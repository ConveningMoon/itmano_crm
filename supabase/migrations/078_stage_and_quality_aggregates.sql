-- 078 — Agregados por etapa y calidad para dashboard y analytics.
--
-- Los dos RPC agregaban sobre `status`, que mezcla medición (new/nurturing/warm/
-- hot) con etapa del embudo (process_started/closed/lost). Por eso el "embudo"
-- del dashboard tenía ocho columnas y ninguna era una etapa real.
--
-- Ahora leen de `leads_list`, que ya resuelve etapa / banda de calidad / urgencia
-- en un solo sitio. Cambiar la regla de bandas no exige tocar estas funciones.
--
-- ADITIVA: se conservan todas las claves anteriores para que la UI migre sin
-- romperse a mitad de camino.

-- ── Dashboard ────────────────────────────────────────────────────────────────
create or replace function public.lead_dashboard_stats(
  p_tenant_id text default null,
  p_agent_id  text default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with scoped as (
    select l.agent_id, l.status, l.stage, l.quality_band, l.urgency,
           coalesce(l.current_score, 0) as score,
           coalesce(l.quality_score, 0) as quality,
           l.created_at
    from public.leads_list l
    where (p_tenant_id is null or l.tenant_id = p_tenant_id)
      and (p_agent_id  is null or l.agent_id  = p_agent_id)
  ),
  by_status as (select status, count(*)::int as c from scoped group by status),
  by_stage  as (select stage,  count(*)::int as c from scoped group by stage),
  by_agent as (
    select agent_id,
           count(*)::int                                                    as total,
           (count(*) filter (where status = 'hot'))::int                     as hot,
           (count(*) filter (where quality_band = 'alta'))::int              as high_quality,
           (count(*) filter (where status in ('closed', 'process_completed')))::int as closed
    from scoped
    group by agent_id
  )
  select jsonb_build_object(
    'total',     (select count(*)::int from scoped),
    'hot',       (select count(*)::int from scoped where status = 'hot'),
    -- Cartera VIVA: lo único que compite por la atención del agente.
    'active',    (select count(*)::int from scoped where stage in ('nuevo','nutricion')),
    -- Calidad alta DENTRO de la cartera viva: un cerrado de calidad alta ya no es
    -- trabajo pendiente, y contarlo inflaría el KPI del día.
    'high_quality', (select count(*)::int from scoped where stage in ('nuevo','nutricion') and quality_band = 'alta'),
    'urgent_today', (select count(*)::int from scoped where urgency = 'hoy'),
    'closed_this_month', (
      select count(*)::int from scoped
      where status in ('closed','process_completed')
        and created_at >= date_trunc('month', (now() at time zone 'utc'))
    ),
    'by_status', coalesce((select jsonb_object_agg(status, c) from by_status), '{}'::jsonb),
    'by_stage',  coalesce((select jsonb_object_agg(stage, c) from by_stage where stage is not null), '{}'::jsonb),
    'by_agent',  coalesce((
      select jsonb_agg(jsonb_build_object(
        'agent_id', agent_id, 'total', total, 'hot', hot,
        'high_quality', high_quality, 'closed', closed
      ))
      from by_agent
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.lead_dashboard_stats(text, text) from public, anon, authenticated;
grant execute on function public.lead_dashboard_stats(text, text) to service_role;

-- ── Analytics ────────────────────────────────────────────────────────────────
create or replace function public.lead_analytics_stats(
  p_tenant_id text default null,
  p_agent_id  text default null,
  p_months    int  default 7
)
returns jsonb
language sql
stable
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
      l.agent_id, l.status, l.stage, l.quality_band,
      coalesce(l.current_score, 0) as score,
      coalesce(l.quality_score, 0) as quality,
      l.traffic_source,
      c.channel_type,
      date_trunc('month', (l.created_at at time zone 'utc')) as created_month
    from public.leads_list l
    left join public.acquisition_channels c on c.id = l.acquisition_channel_id
    where (p_tenant_id is null or l.tenant_id = p_tenant_id)
      and (p_agent_id  is null or l.agent_id  = p_agent_id)
  ),
  -- Por fuente: además del volumen, la CALIDAD MEDIA. Responde "qué canal trae
  -- mejores leads", no sólo cuál trae más — que es lo único que se podía saber.
  by_source as (
    select channel_type, traffic_source,
           count(*)::int                as total,
           round(avg(quality))::int     as avg_quality
    from scoped
    group by channel_type, traffic_source
  ),
  by_agent as (
    select
      agent_id,
      count(*)::int                                                              as total,
      (count(*) filter (where status = 'hot'))::int                              as hot,
      (count(*) filter (where quality_band = 'alta'))::int                       as high_quality,
      (count(*) filter (where status in ('closed', 'process_completed')))::int    as closed,
      round(avg(score))::int                                                     as avg_score,
      round(avg(quality))::int                                                   as avg_quality
    from scoped
    group by agent_id
  ),
  agent_statuses as (
    select agent_id, jsonb_object_agg(status, c) as statuses
    from (select agent_id, status, count(*)::int as c from scoped group by agent_id, status) s
    group by agent_id
  ),
  agent_stages as (
    select agent_id, jsonb_object_agg(stage, c) as stages
    from (select agent_id, stage, count(*)::int as c from scoped where stage is not null group by agent_id, stage) s
    group by agent_id
  ),
  monthly as (
    select
      to_char(s.created_month, 'YYYY-MM')                                        as month,
      count(*)::int                                                              as leads,
      (count(*) filter (where s.status = 'nurturing'))::int                       as nurturing,
      (count(*) filter (where s.status = 'hot'))::int                             as hot,
      (count(*) filter (where s.status in ('closed', 'process_completed')))::int  as closed,
      -- Serie por ETAPA: mide progreso del negocio, no del termómetro.
      (count(*) filter (where s.stage = 'nuevo'))::int                            as nuevo,
      (count(*) filter (where s.stage = 'nutricion'))::int                        as nutricion,
      (count(*) filter (where s.stage = 'en_proceso'))::int                       as en_proceso,
      (count(*) filter (where s.stage = 'cerrado'))::int                          as cerrado,
      (count(*) filter (where s.stage = 'perdido'))::int                          as perdido
    from scoped s, bounds b
    where s.created_month >= b.window_start
    group by s.created_month
  ),
  by_quality as (select quality_band, count(*)::int as c from scoped group by quality_band),
  by_stage   as (select stage,        count(*)::int as c from scoped where stage is not null group by stage)
  select jsonb_build_object(
    'total',  (select count(*)::int from scoped),
    'hot',    (select count(*)::int from scoped where status = 'hot'),
    'closed', (select count(*)::int from scoped where status in ('closed', 'process_completed')),
    'active', (select count(*)::int from scoped where stage in ('nuevo','nutricion')),
    'live_avg_score', (
      select round(avg(score))::int from scoped
      where status not in ('process_started', 'process_completed', 'closed', 'lost')
    ),
    -- Distribución de calidad sobre TODA la cartera, incluidos los cerrados: sin
    -- ellos no se puede ver si los buenos leads terminan cerrando. Reemplaza a la
    -- "temperatura promedio", que promediaba una escala arbitraria.
    'quality_distribution', coalesce((select jsonb_object_agg(quality_band, c) from by_quality where quality_band is not null), '{}'::jsonb),
    'by_stage', coalesce((select jsonb_object_agg(stage, c) from by_stage), '{}'::jsonb),
    'this_month', jsonb_build_object(
      'leads', (select count(*)::int from scoped s, bounds b where s.created_month = b.month_start),
      'hot',   (select count(*)::int from scoped s, bounds b where s.created_month = b.month_start and s.status = 'hot'),
      'high_quality', (select count(*)::int from scoped s, bounds b where s.created_month = b.month_start and s.quality_band = 'alta')
    ),
    'by_source', coalesce((
      select jsonb_agg(jsonb_build_object(
        'channel_type', channel_type, 'traffic_source', traffic_source,
        'total', total, 'avg_quality', avg_quality
      ))
      from by_source
    ), '[]'::jsonb),
    'by_agent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'agent_id',  a.agent_id,
        'total',     a.total,
        'hot',       a.hot,
        'high_quality', a.high_quality,
        'closed',    a.closed,
        'avg_score', a.avg_score,
        'avg_quality', a.avg_quality,
        'statuses',  coalesce(st.statuses, '{}'::jsonb),
        'stages',    coalesce(sg.stages,   '{}'::jsonb)
      ))
      from by_agent a
      left join agent_statuses st on st.agent_id = a.agent_id
      left join agent_stages   sg on sg.agent_id = a.agent_id
    ), '[]'::jsonb),
    'monthly', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', month, 'leads', leads,
        'nurturing', nurturing, 'hot', hot, 'closed', closed,
        'nuevo', nuevo, 'nutricion', nutricion,
        'en_proceso', en_proceso, 'cerrado', cerrado, 'perdido', perdido
      ))
      from monthly
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.lead_analytics_stats(text, text, int) from public, anon, authenticated;
grant execute on function public.lead_analytics_stats(text, text, int) to service_role;
