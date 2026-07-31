-- 072_leads_server_side_listing.sql
--
-- /leads y /dashboard traían TODOS los leads del tenant y filtraban, buscaban,
-- ordenaban y contaban en JavaScript. Con miles de leads por tenant eso no escala:
-- el payload RSC crece sin techo y cada render recorre la lista completa.
--
-- Esta migración mueve ese trabajo a Postgres:
--   1. búsqueda por nombre/email indexada (trigramas)
--   2. índices para el orden y los filtros de la lista
--   3. vista `leads_list` con la premura de atención ya calculada (orden "Atención")
--   4. RPC de agregados del dashboard (conteos por estado y por agente)
--   5. RPC de leads elegibles para una secuencia manual (anti-join + facetas)

-- ── 1. Búsqueda por nombre completo o email ──────────────────────────────────
-- La búsqueda de /leads compara contra "nombre apellido" concatenado y contra el
-- email. Una columna generada permite una sola condición ILIKE y, con pg_trgm,
-- que esa condición use índice en vez de escanear el tenant entero.
-- pg_trgm va en el esquema `extensions` (convención de Supabase: nada de
-- extensiones en public), así que el opclass se referencia calificado.
create extension if not exists pg_trgm with schema extensions;

alter table public.leads
  add column if not exists search_text text
  generated always as (lower(first_name || ' ' || last_name || ' ' || email)) stored;

create index if not exists idx_leads_search_text
  on public.leads using gin (search_text extensions.gin_trgm_ops);

-- ── 2. Índices de listado ────────────────────────────────────────────────────
-- El orden por defecto es created_at desc; `id` entra como desempate para que la
-- paginación por .range() sea estable cuando dos leads comparten timestamp.
create index if not exists idx_leads_tenant_created_at
  on public.leads (tenant_id, created_at desc, id desc);

-- Rol 'agent': la lista siempre lleva además agent_id = <suyo>.
create index if not exists idx_leads_tenant_agent_created_at
  on public.leads (tenant_id, agent_id, created_at desc, id desc);

-- Filtro por estado y columnas del kanban.
create index if not exists idx_leads_tenant_status_created_at
  on public.leads (tenant_id, status, created_at desc, id desc);

-- ── 3. Vista de listado ──────────────────────────────────────────────────────
-- `attention_when` es metadata.ai_fit.next_action_when (premura del último
-- briefing de IA) y `attention_rank` es el criterio del orden "Atención":
-- lo que dijo la IA manda; si no hay briefing, una heurística determinista
-- (actividad fresca en banda activa con score real) para que el orden sirva
-- aunque el tenant no tenga IA. Menor = más urgente.
--
-- security_invoker: la vista NO es una puerta trasera a las RLS de `leads`.
drop view if exists public.leads_list;

create view public.leads_list
with (security_invoker = on) as
select
  l.*,
  case l.metadata #>> '{ai_fit,next_action_when}'
    when 'hoy'         then 'hoy'
    when 'esta_semana' then 'esta_semana'
    when 'sin_apuro'   then 'sin_apuro'
    else null
  end as attention_when,
  case
    when l.metadata #>> '{ai_fit,next_action_when}' = 'hoy'         then 0
    when l.metadata #>> '{ai_fit,next_action_when}' = 'esta_semana' then 2
    when l.metadata #>> '{ai_fit,next_action_when}' = 'sin_apuro'   then 4
    when l.last_event_at > now() - interval '3 days'
     and l.status not in ('process_started', 'process_completed', 'closed', 'lost')
     and coalesce(l.current_score, 0) >= 35                         then 1
    else 3
  end as attention_rank
from public.leads l;

revoke all on public.leads_list from anon;
grant select on public.leads_list to authenticated, service_role;

-- ── 4. Agregados del dashboard ───────────────────────────────────────────────
-- Reemplaza el "traer todos los leads y contarlos en JS". Un solo viaje devuelve
-- los cuatro KPIs, el pipeline por estado y el rendimiento por agente.
-- p_tenant_id null = super_admin (todos los tenants); p_agent_id null = sin
-- filtro por agente. Mismo criterio que scopeFor() en el código.
create or replace function public.lead_dashboard_stats(
  p_tenant_id text default null,
  p_agent_id  text default null
)
returns jsonb
language sql
stable
-- search_path vacío: todas las referencias van calificadas (linter de Supabase).
set search_path = ''
as $$
  with scoped as (
    select l.agent_id, l.status, coalesce(l.current_score, 0) as score
    from public.leads l
    where (p_tenant_id is null or l.tenant_id = p_tenant_id)
      and (p_agent_id  is null or l.agent_id  = p_agent_id)
  ),
  by_status as (
    select status, count(*)::int as c
    from scoped
    group by status
  ),
  by_agent as (
    select agent_id,
           count(*)::int                                                    as total,
           (count(*) filter (where status = 'hot'))::int                     as hot,
           (count(*) filter (where status in ('closed', 'process_completed')))::int as closed
    from scoped
    group by agent_id
  )
  select jsonb_build_object(
    'total',     (select count(*)::int from scoped),
    -- "Caliente" = la banda del pipeline, sin excepciones: status = 'hot', que el
    -- trigger de scoring mantiene en score >= 60. Contar por score sumaria leads que
    -- el agente ya movio a 'en proceso' (score congelado alto), duplicandolos contra
    -- la tarjeta de al lado.
    'hot',       (select count(*)::int from scoped where status = 'hot'),
    'by_status', coalesce((select jsonb_object_agg(status, c) from by_status), '{}'::jsonb),
    'by_agent',  coalesce((
      select jsonb_agg(jsonb_build_object(
        'agent_id', agent_id, 'total', total, 'hot', hot, 'closed', closed
      ))
      from by_agent
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.lead_dashboard_stats(text, text) from public, anon, authenticated;
grant execute on function public.lead_dashboard_stats(text, text) to service_role;

-- ── 5. Leads elegibles para una secuencia manual ─────────────────────────────
-- El picker de /emails/[id] traía todos los leads del scope y descartaba en JS
-- los que ya tienen un run activo. El anti-join hace eso en la base y devuelve
-- sólo la página pedida, más las facetas (estados e idiomas presentes) para no
-- ofrecer filtros vacíos.
-- p_agent_id es la visibilidad (rol 'agent'); p_agent_filter es el desplegable
-- del picker. Son cosas distintas y se aplican las dos.
create or replace function public.sequence_eligible_leads(
  p_sequence_id  uuid,
  p_tenant_id    text default null,
  p_agent_id     text default null,
  p_search       text default null,
  p_status       text default null,
  p_language     text default null,
  p_agent_filter text default null,
  p_limit        int  default 50
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with eligible as (
    select l.id, l.first_name, l.last_name, l.email, l.status,
           l.agent_id, l.language, l.search_text, l.created_at
    from public.leads l
    where (p_tenant_id is null or l.tenant_id = p_tenant_id)
      and (p_agent_id  is null or l.agent_id  = p_agent_id)
      and not exists (
        select 1
        from public.lead_sequence_runs r
        where r.lead_id     = l.id
          and r.sequence_id = p_sequence_id
          and r.status      = 'active'
      )
  ),
  filtered as (
    select *
    from eligible
    where (p_search       is null or p_search = '' or search_text like '%' || lower(p_search) || '%')
      and (p_status       is null or status   = p_status)
      and (p_language     is null or language = p_language)
      and (p_agent_filter is null or agent_id = p_agent_filter)
  )
  select jsonb_build_object(
    'total',     (select count(*)::int from eligible),
    'matched',   (select count(*)::int from filtered),
    'statuses',  coalesce((select jsonb_agg(distinct status)   from eligible), '[]'::jsonb),
    'languages', coalesce((select jsonb_agg(distinct language) from eligible where language is not null), '[]'::jsonb),
    'items',     coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',         id,
        'first_name', first_name,
        'last_name',  last_name,
        'email',      email,
        'status',     status,
        'agent_id',   agent_id,
        'language',   language
      ))
      from (select * from filtered order by created_at desc, id desc limit p_limit) t
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.sequence_eligible_leads(uuid, text, text, text, text, text, text, int) from public, anon, authenticated;
grant execute on function public.sequence_eligible_leads(uuid, text, text, text, text, text, text, int) to service_role;
