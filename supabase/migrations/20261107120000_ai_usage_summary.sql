-- Resumen agregado de uso de IA (Configuración → "Uso de IA" y Centro de control).
-- Sólo una función nueva: sin DROP ni cambios destructivos.
--
-- Sustituye la lectura de TODAS las filas de ai_usage_events en
-- getAiUsageSummary: la Data API corta en 1000 filas, así que con más eventos
-- los totales históricos y los meses viejos saldrían incompletos.
--
--   p_tenant_id  null → todos los tenants (super_admin), con desglose byTenant.
--   p_agent_id   no nulo → sólo los requests de ese agente (vista del rol agent).
--   p_months     meses de la serie byMonth, el actual incluido, cortados en UTC.
--
-- byMonth trae sólo los meses con uso; la capa de presentación rellena ceros.
-- Los costos salen como numeric exacto; el redondeo lo hace quien presenta.
create or replace function public.ai_usage_summary(
  p_tenant_id text,
  p_agent_id  text,
  p_months    int default 6
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  with ev as (
    select e.tenant_id, e.feature, e.input_tokens, e.output_tokens, e.cost_usd, e.created_at
    from public.ai_usage_events e
    where (p_tenant_id is null or e.tenant_id = p_tenant_id)
      and (p_agent_id  is null or e.agent_id  = p_agent_id)
  ),
  win as (
    select date_trunc('month', now() at time zone 'UTC')
           - make_interval(months => greatest(p_months, 1) - 1) as month_start
  ),
  by_feature as (
    select feature,
           count(*)                         as requests,
           coalesce(sum(input_tokens), 0)   as input_tokens,
           coalesce(sum(output_tokens), 0)  as output_tokens,
           coalesce(sum(cost_usd), 0)       as cost_usd
    from ev group by feature
  ),
  by_tenant as (
    select tenant_id,
           count(*)                         as requests,
           coalesce(sum(input_tokens), 0)   as input_tokens,
           coalesce(sum(output_tokens), 0)  as output_tokens,
           coalesce(sum(cost_usd), 0)       as cost_usd
    from ev where p_tenant_id is null group by tenant_id
  ),
  by_month as (
    select to_char(date_trunc('month', ev.created_at at time zone 'UTC'), 'YYYY-MM') as key,
           count(*)                    as requests,
           coalesce(sum(cost_usd), 0)  as cost_usd
    from ev cross join win
    where (ev.created_at at time zone 'UTC') >= win.month_start
    group by 1
  )
  select jsonb_build_object(
    'allTime', (
      select jsonb_build_object(
        'requests', count(*),
        'inputTokens', coalesce(sum(input_tokens), 0),
        'outputTokens', coalesce(sum(output_tokens), 0),
        'costUsd', coalesce(sum(cost_usd), 0))
      from ev
    ),
    'last30d', (
      select jsonb_build_object(
        'requests', count(*),
        'inputTokens', coalesce(sum(input_tokens), 0),
        'outputTokens', coalesce(sum(output_tokens), 0),
        'costUsd', coalesce(sum(cost_usd), 0))
      from ev where created_at >= now() - interval '30 days'
    ),
    'byFeature', coalesce((
      select jsonb_agg(jsonb_build_object(
        'feature', feature, 'requests', requests, 'inputTokens', input_tokens,
        'outputTokens', output_tokens, 'costUsd', cost_usd) order by cost_usd desc, feature)
      from by_feature
    ), '[]'::jsonb),
    'byTenant', case when p_tenant_id is null then coalesce((
      select jsonb_agg(jsonb_build_object(
        'tenantId', tenant_id, 'requests', requests, 'inputTokens', input_tokens,
        'outputTokens', output_tokens, 'costUsd', cost_usd) order by cost_usd desc)
      from by_tenant
    ), '[]'::jsonb) end,
    'byMonth', coalesce((
      select jsonb_agg(jsonb_build_object('key', key, 'requests', requests, 'costUsd', cost_usd) order by key)
      from by_month
    ), '[]'::jsonb)
  )
$function$;

revoke all on function public.ai_usage_summary(text, text, int) from public, anon, authenticated;
grant execute on function public.ai_usage_summary(text, text, int) to service_role;
