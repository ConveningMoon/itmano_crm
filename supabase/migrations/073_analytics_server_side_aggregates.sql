-- 073_analytics_server_side_aggregates.sql
--
-- /analytics era el último consumidor de "traer TODOS los leads del tenant y
-- agregarlos en JavaScript": un `select('*')` sin límite más una docena de
-- .filter()/.reduce() por render. Con miles de leads eso no escala (payload RSC
-- sin techo y N recorridos completos de la lista por página).
--
-- La migración 072 movió el listado y el dashboard a Postgres; ésta cierra el
-- círculo con los agregados que /analytics necesita y que `lead_dashboard_stats`
-- NO cubre: temperatura media del pipeline vivo, altas del mes en curso, serie
-- mensual, distribución por fuente compuesta, y por agente la matriz de estados
-- y el score promedio.
--
-- Se crea una función aparte en vez de ampliar `lead_dashboard_stats` porque el
-- criterio de "caliente" difiere: el dashboard cuenta `score >= 70 OR status =
-- 'hot'` y /analytics cuenta sólo `score >= 70`. Fundirlas cambiaría un KPI ya
-- publicado en una de las dos páginas.

-- ── Índice de cobertura para los agregados ───────────────────────────────────
-- Los agregados recorren todos los leads del scope. Con estas columnas en el
-- índice el recorrido se resuelve sin ir al heap (la tabla `leads` es ancha:
-- notes, metadata, fit_profile). tenant_id + agent_id como claves porque son el
-- filtro del scope de visibilidad; el resto viaja como payload.
create index if not exists idx_leads_tenant_agent_analytics
  on public.leads (tenant_id, agent_id)
  include (status, current_score, created_at, traffic_source, acquisition_channel_id);

-- ── Agregados de /analytics ──────────────────────────────────────────────────
-- p_tenant_id null = super_admin (todos los tenants); p_agent_id null = sin
-- filtro por agente. Mismo criterio que scopeFor() en el código.
-- p_months = tamaño de la ventana de la serie mensual, contando el mes en curso.
--
-- Los meses se cortan en UTC (`at time zone 'utc'`) para que el bucket no dependa
-- de la zona horaria de la sesión de Postgres ni del servidor de Node.
create or replace function public.lead_analytics_stats(
  p_tenant_id text default null,
  p_agent_id  text default null,
  p_months    int  default 7
)
returns jsonb
language sql
stable
-- search_path vacío: todas las referencias van calificadas (linter de Supabase).
set search_path = ''
as $$
  with bounds as (
    select
      date_trunc('month', (now() at time zone 'utc')) as month_start,
      date_trunc('month', (now() at time zone 'utc'))
        - make_interval(months => greatest(coalesce(p_months, 7), 1) - 1) as window_start
  ),
  scoped as (
    select
      l.agent_id,
      l.status,
      coalesce(l.current_score, 0) as score,
      l.traffic_source,
      c.channel_type,
      date_trunc('month', (l.created_at at time zone 'utc')) as created_month
    from public.leads l
    left join public.acquisition_channels c on c.id = l.acquisition_channel_id
    where (p_tenant_id is null or l.tenant_id = p_tenant_id)
      and (p_agent_id  is null or l.agent_id  = p_agent_id)
  ),
  -- Fuente compuesta: el tipo de canal si el lead tiene canal, y si no su
  -- traffic_source. La base devuelve las dos columnas crudas y el mapeo a
  -- etiqueta lo sigue haciendo getLeadSource() — una sola fuente de verdad.
  by_source as (
    select channel_type, traffic_source, count(*)::int as total
    from scoped
    group by channel_type, traffic_source
  ),
  by_agent as (
    select
      agent_id,
      count(*)::int                                                              as total,
      (count(*) filter (where score >= 70))::int                                 as hot,
      (count(*) filter (where status in ('closed', 'process_completed')))::int   as closed,
      round(avg(score))::int                                                     as avg_score
    from scoped
    group by agent_id
  ),
  agent_statuses as (
    select agent_id, jsonb_object_agg(status, c) as statuses
    from (
      select agent_id, status, count(*)::int as c
      from scoped
      group by agent_id, status
    ) s
    group by agent_id
  ),
  monthly as (
    select
      to_char(s.created_month, 'YYYY-MM')                                        as month,
      count(*)::int                                                              as leads,
      (count(*) filter (where s.status = 'nurturing'))::int                       as nurturing,
      (count(*) filter (where s.score >= 70))::int                                as hot,
      (count(*) filter (where s.status in ('closed', 'process_completed')))::int  as closed
    from scoped s, bounds b
    where s.created_month >= b.window_start
    group by s.created_month
  )
  select jsonb_build_object(
    'total',  (select count(*)::int from scoped),
    -- Criterio de la tarjeta "Leads Calientes" de /analytics: score >= 70.
    'hot',    (select count(*)::int from scoped where score >= 70),
    'closed', (select count(*)::int from scoped where status in ('closed', 'process_completed')),
    -- Temperatura promedio: media sobre el pipeline VIVO (los estados congelados
    -- guardan un score viejo, ver FROZEN_STATUSES). null = no hay pipeline vivo.
    'live_avg_score', (
      select round(avg(score))::int from scoped
      where status not in ('process_started', 'process_completed', 'closed', 'lost')
    ),
    'this_month', jsonb_build_object(
      'leads', (select count(*)::int from scoped s, bounds b where s.created_month = b.month_start),
      'hot',   (select count(*)::int from scoped s, bounds b where s.created_month = b.month_start and s.score >= 70)
    ),
    'by_source', coalesce((
      select jsonb_agg(jsonb_build_object(
        'channel_type', channel_type, 'traffic_source', traffic_source, 'total', total
      ))
      from by_source
    ), '[]'::jsonb),
    'by_agent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'agent_id',  a.agent_id,
        'total',     a.total,
        'hot',       a.hot,
        'closed',    a.closed,
        'avg_score', a.avg_score,
        'statuses',  coalesce(st.statuses, '{}'::jsonb)
      ))
      from by_agent a
      left join agent_statuses st on st.agent_id = a.agent_id
    ), '[]'::jsonb),
    -- Sólo los meses con leads; el eje de N meses (incluidos los vacíos) lo arma
    -- la página, que ya es quien conoce las etiquetas en español.
    'monthly', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', month, 'leads', leads, 'nurturing', nurturing, 'hot', hot, 'closed', closed
      ))
      from monthly
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.lead_analytics_stats(text, text, int) from public, anon, authenticated;
grant execute on function public.lead_analytics_stats(text, text, int) to service_role;
