-- Correos grupales: un correo manual a un grupo de leads elegido por filtros
-- (etiquetas, etapa, agente, fuente, idioma, calidad) o a mano.
--
-- Es el segundo envío masivo del producto, después de los open houses, y
-- hereda sus tres garantías:
--
--   · UN LEAD NO RECIBE DOS VECES EL MISMO CORREO. Los destinatarios se
--     congelan en `email_broadcast_recipients` con PK (broadcast_id, lead_id)
--     y cada lote viaja a Resend con una Idempotency-Key.
--
--   · NADA SALE SIN CONFIRMAR. Un envío nace en `draft`; sólo `pending`
--     (confirmado, con su hora) lo toma el despachador.
--
--   · UN ENVÍO QUE DAÑA EL DOMINIO SE DETIENE SOLO. Si los rebotes duros o las
--     quejas de spam pasan el umbral, el despachador lo deja en `paused` con
--     el motivo a la vista (src/lib/broadcasts/model.ts).
--
-- Todas las escrituras pasan por Server Actions con el admin client, como en
-- open houses: RLS aquí es la defensa de lectura.

-- ── 1) El envío ──────────────────────────────────────────────────────────────

create table if not exists public.email_broadcasts (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            text not null references public.tenants(id) on delete cascade,
  -- Nombre interno para la lista ("Nuevas propiedades octubre"). No viaja en
  -- el correo.
  name                 text not null check (char_length(name) between 1 and 120),
  -- Filtro de audiencia o selección manual. El contrato lo valida
  -- parseBroadcastAudience (src/lib/broadcasts/audience.ts); la base sólo
  -- exige que sea un objeto.
  audience             jsonb not null default '{}'::jsonb
                         check (jsonb_typeof(audience) = 'object'),
  -- Idiomas escritos (1..3). Un lead cuyo idioma no está no recibe nada.
  languages            text[] not null default '{es}'
                         check (cardinality(languages) between 1 and 3),
  -- A nombre de qué agente salen TODOS los correos; null = cada lead lo
  -- recibe de su propio agente.
  sender_agent_id      text references public.agents(id) on delete set null,
  -- Alcance de quien lo creó: un agente sólo puede escribir a sus leads, y se
  -- vuelve a aplicar al congelar la lista. null = todo el tenant.
  scope_agent_id       text references public.agents(id) on delete set null,
  -- draft     → se edita; no sale nada
  -- pending   → confirmado; sale cuando llega `scheduled_at`
  -- sending   → un despachador lo tomó; `started_at` recupera uno caído
  -- paused    → detenido por rebotes/quejas; `last_error` dice por qué
  -- sent      → terminó; los conteos describen el resultado
  -- cancelled → alguien lo canceló (lo ya entregado no se deshace)
  -- failed    → no pudo salir (p. ej. el tenant perdió su dominio propio)
  status               text not null default 'draft'
                         check (status in ('draft', 'pending', 'sending', 'paused', 'sent', 'cancelled', 'failed')),
  scheduled_at         timestamptz,
  recipients_frozen_at timestamptz,
  sent_count           integer not null default 0,
  skipped_count        integer not null default 0,
  failed_count         integer not null default 0,
  attempts             integer not null default 0,
  started_at           timestamptz,
  finished_at          timestamptz,
  last_error           text check (char_length(last_error) <= 500),
  created_by_user_id   uuid references auth.users(id)   on delete set null,
  created_by_agent_id  text references public.agents(id) on delete set null,
  confirmed_at         timestamptz,
  confirmed_by_user_id uuid references auth.users(id) on delete set null,
  cancelled_at         timestamptz,
  cancelled_by_user_id uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint email_broadcasts_pending_has_time check (status <> 'pending' or scheduled_at is not null)
);

comment on table public.email_broadcasts is
  'Correos grupales manuales. draft → pending → sending → sent (o paused/cancelled/failed).
   Ver docs/agents/domains.md.';

create index if not exists email_broadcasts_tenant_created_idx
  on public.email_broadcasts (tenant_id, created_at desc);

-- Lo que consulta el orquestador cada hora.
create index if not exists email_broadcasts_due_idx
  on public.email_broadcasts (scheduled_at)
  where status in ('pending', 'sending');

-- ── 2) Contenido por idioma ──────────────────────────────────────────────────

create table if not exists public.email_broadcast_contents (
  broadcast_id uuid not null references public.email_broadcasts(id) on delete cascade,
  tenant_id    text not null references public.tenants(id) on delete cascade,
  language     text not null check (char_length(language) between 2 and 8),
  subject      text not null check (char_length(subject) between 1 and 200),
  body_json    jsonb not null,
  updated_at   timestamptz not null default now(),
  primary key (broadcast_id, language)
);

-- ── 3) Destinatarios congelados ──────────────────────────────────────────────

create table if not exists public.email_broadcast_recipients (
  broadcast_id    uuid not null references public.email_broadcasts(id) on delete cascade,
  lead_id         text not null references public.leads(id) on delete cascade,
  tenant_id       text not null references public.tenants(id) on delete cascade,
  language        text,
  status          text not null default 'pending'
                    check (status in ('pending', 'sent', 'skipped', 'failed')),
  skip_reason     text,
  resend_email_id text,
  attempts        smallint not null default 0,
  last_error      text,
  sent_at         timestamptz,
  primary key (broadcast_id, lead_id)
);

create index if not exists email_broadcast_recipients_status_idx
  on public.email_broadcast_recipients (broadcast_id, status);

create index if not exists email_broadcast_recipients_lead_idx
  on public.email_broadcast_recipients (lead_id);

-- Índices de FK que no cubre ninguno de arriba.
create index if not exists email_broadcasts_sender_agent_idx        on public.email_broadcasts (sender_agent_id);
create index if not exists email_broadcasts_scope_agent_idx         on public.email_broadcasts (scope_agent_id);
create index if not exists email_broadcasts_created_by_user_idx     on public.email_broadcasts (created_by_user_id);
create index if not exists email_broadcasts_created_by_agent_idx    on public.email_broadcasts (created_by_agent_id);
create index if not exists email_broadcasts_confirmed_by_user_idx   on public.email_broadcasts (confirmed_by_user_id);
create index if not exists email_broadcasts_cancelled_by_user_idx   on public.email_broadcasts (cancelled_by_user_id);
create index if not exists email_broadcast_contents_tenant_idx      on public.email_broadcast_contents (tenant_id);
create index if not exists email_broadcast_recipients_tenant_idx    on public.email_broadcast_recipients (tenant_id);

-- ── 4) email_sends: tipo y vínculo ───────────────────────────────────────────
-- Cada correo grupal deja su fila en email_sends: el webhook de Resend atribuye
-- rebotes, quejas, clicks y respuestas, y un rebote bloquea el email del lead.

alter table public.email_sends
  add column if not exists broadcast_id uuid
    references public.email_broadcasts(id) on delete set null;

create index if not exists email_sends_broadcast_idx
  on public.email_sends (broadcast_id)
  where broadcast_id is not null;

do $$
declare
  vivos text[];
begin
  -- Guarda: el CHECK se reemplaza entero; no debe perder ningún valor en uso.
  select array_agg(distinct send_type) into vivos from public.email_sends;
  if vivos is not null and not vivos <@ array['sequence', 'purchase', 'one_off', 'open_house', 'broadcast'] then
    raise exception 'email_sends.send_type tiene valores fuera del CHECK nuevo: %', vivos;
  end if;
end;
$$;

alter table public.email_sends drop constraint if exists email_sends_send_type_check;
alter table public.email_sends
  add constraint email_sends_send_type_check
  check (send_type in ('sequence', 'purchase', 'one_off', 'open_house', 'broadcast'));

-- ── 5) Dirección postal del negocio ──────────────────────────────────────────
-- CAN-SPAM exige una dirección postal física en todo correo comercial. Un
-- correo grupal lo es, así que no sale sin ella. Es un dato del tenant, no del
-- código.

alter table public.tenants
  add column if not exists postal_address text
    check (char_length(postal_address) <= 300);

-- ── 6) updated_at ────────────────────────────────────────────────────────────

create trigger email_broadcasts_touch before update on public.email_broadcasts
  for each row execute function public.touch_open_house_row();

create trigger email_broadcast_contents_touch before update on public.email_broadcast_contents
  for each row execute function public.touch_open_house_row();

-- ── 7) Métricas ──────────────────────────────────────────────────────────────
-- Misma definición que sequence_email_metrics: leads distintos con evento
-- posterior a su envío / leads distintos con envío. Las quejas de spam se
-- cuentan aparte porque son la mitad de la guarda que pausa un envío.

create or replace function public.email_broadcast_metrics(
  p_tenant_id     text,
  p_broadcast_ids uuid[]
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with sends as (
    select e.broadcast_id, e.lead_id, min(e.sent_at) as first_sent
    from public.email_sends e
    where e.tenant_id = p_tenant_id
      and e.broadcast_id = any (p_broadcast_ids)
    group by e.broadcast_id, e.lead_id
  ),
  per_lead as (
    select s.broadcast_id, s.lead_id,
      bool_or(x.type = 'email_clicked')        as clicked,
      bool_or(x.type = 'email_replied')        as replied,
      bool_or(x.type = 'email_hard_bounce')    as bounced,
      bool_or(x.type = 'email_spam_complaint') as complained,
      bool_or(x.type = 'email_unsubscribed')   as unsubscribed
    from sends s
    left join public.lead_events x
      on x.lead_id = s.lead_id
     and x.tenant_id = p_tenant_id
     and x.created_at >= s.first_sent
     and x.type in ('email_clicked', 'email_replied', 'email_hard_bounce', 'email_spam_complaint', 'email_unsubscribed')
    group by s.broadcast_id, s.lead_id
  )
  select coalesce(jsonb_object_agg(broadcast_id, jsonb_build_object(
    'leads',        leads,
    'clicked',      clicked,
    'replied',      replied,
    'bounced',      bounced,
    'complained',   complained,
    'unsubscribed', unsubscribed
  )), '{}'::jsonb)
  from (
    select broadcast_id,
      count(*)::int                               as leads,
      (count(*) filter (where clicked))::int      as clicked,
      (count(*) filter (where replied))::int      as replied,
      (count(*) filter (where bounced))::int      as bounced,
      (count(*) filter (where complained))::int   as complained,
      (count(*) filter (where unsubscribed))::int as unsubscribed
    from per_lead
    group by broadcast_id
  ) agg;
$$;

revoke all on function public.email_broadcast_metrics(text, uuid[]) from public, anon, authenticated;
grant execute on function public.email_broadcast_metrics(text, uuid[]) to service_role;

-- ── 8) RLS ───────────────────────────────────────────────────────────────────

alter table public.email_broadcasts           enable row level security;
alter table public.email_broadcast_contents   enable row level security;
alter table public.email_broadcast_recipients enable row level security;

create policy "email_broadcasts_select" on public.email_broadcasts
  for select to authenticated
  using ((select public.is_super_admin()) or tenant_id = (select public.get_my_tenant_id()));

create policy "email_broadcast_contents_select" on public.email_broadcast_contents
  for select to authenticated
  using ((select public.is_super_admin()) or tenant_id = (select public.get_my_tenant_id()));

create policy "email_broadcast_recipients_select" on public.email_broadcast_recipients
  for select to authenticated
  using ((select public.is_super_admin()) or tenant_id = (select public.get_my_tenant_id()));

-- ── 9) Grants ────────────────────────────────────────────────────────────────
-- Desde 2026-10-30 Supabase no concede privilegios por defecto a tablas nuevas
-- (ver table_grants_snapshot): sin estos GRANT no existen para la Data API. Los
-- REVOKE sí hacen falta: el default ACL actual aún da TRUNCATE, REFERENCES,
-- TRIGGER y MAINTAIN a anon y authenticated, y RLS no protege de un TRUNCATE.

revoke all on public.email_broadcasts from anon, authenticated;
revoke all on public.email_broadcast_contents from anon, authenticated;
revoke all on public.email_broadcast_recipients from anon, authenticated;

grant select on public.email_broadcasts to authenticated;
grant select on public.email_broadcast_contents to authenticated;
grant select on public.email_broadcast_recipients to authenticated;

grant all on public.email_broadcasts           to service_role;
grant all on public.email_broadcast_contents   to service_role;
grant all on public.email_broadcast_recipients to service_role;
