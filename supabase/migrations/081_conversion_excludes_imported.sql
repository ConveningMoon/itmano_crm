-- 081 — La tasa de conversión también ignora a los importados.
--
-- La 080 sacó a los leads traídos de otro CRM del embudo del dashboard, pero
-- /analytics seguía calculando la conversión sobre TODA la cartera. Con 113 de
-- 116 leads importados ya cerrados, A&J mostraba un 98% de conversión — un
-- número que no describe nada que haya pasado dentro de ITMANO.
--
-- La conversión pasa a medirse sólo sobre los leads que sí entraron por aquí.
-- El resto de los agregados (calidad, fuentes, cohortes) los sigue incluyendo:
-- ahí sí aportan — son los únicos casos cerrados que existen para comparar.

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
      l.agent_id, l.status, l.stage, l.quality_band, l.is_imported,
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
    -- Denominador y numerador de la CONVERSIÓN: sólo lo captado por ITMANO.
    'attributed_total',  (select count(*)::int from scoped where not is_imported),
    'attributed_closed', (select count(*)::int from scoped where not is_imported and status in ('closed', 'process_completed')),
    'imported', (select count(*)::int from scoped where is_imported),
    'live_avg_score', (
      select round(avg(score))::int from scoped
      where status not in ('process_started', 'process_completed', 'closed', 'lost')
    ),
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
