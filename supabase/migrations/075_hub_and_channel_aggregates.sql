-- 075 — Agregados en Postgres para el hub del super admin y las métricas de canal.
--
-- Eran las dos últimas superficies que traían `leads` sin límite para contar en
-- JavaScript. Con 117 leads da igual; con veinte clientes de a miles, cada carga
-- del hub arrastraría la tabla entera de TODOS los tenants por la red.
--
-- Mismo patrón que 072/073: SECURITY INVOKER (la RLS de leads sigue mandando) y
-- EXECUTE revocado salvo service_role — la app las llama con el admin client.

-- ── Índices de apoyo ─────────────────────────────────────────────────────────
-- El hub agrupa por tenant_id filtrando por created_at; las métricas de canal
-- agrupan por acquisition_channel_id. Con `include` el conteo se resuelve sin
-- ir al heap (leads es una tabla ancha).
create index if not exists idx_leads_tenant_hub
  on public.leads (tenant_id) include (status, created_at);

create index if not exists idx_leads_channel_metrics
  on public.leads (acquisition_channel_id) include (created_at, current_score);

create index if not exists idx_lead_events_tenant_created
  on public.lead_events (tenant_id, created_at desc);

create index if not exists idx_channel_page_views_channel_created
  on public.channel_page_views (channel_id, created_at) include (visitor_fingerprint);

-- ── Hub del super admin ──────────────────────────────────────────────────────
-- Devuelve un objeto { tenant_id: { total, hot, new30d, last_activity_at } }.
-- Solo aparecen los tenants CON leads o CON actividad; la página ya hace merge
-- contra la lista de tenants y usa ceros por defecto, igual que antes.
--
-- "Caliente" = status 'hot': el mismo criterio que /dashboard, /analytics y la
-- banda del pipeline (ver migraciones 072/073).
create or replace function public.tenant_hub_stats(p_days int default 30)
returns jsonb
language sql
stable
-- search_path vacío: todas las referencias van calificadas (linter de Supabase).
set search_path = ''
as $$
  with lead_agg as (
    select
      l.tenant_id,
      count(*)::int                                                      as total,
      (count(*) filter (where l.status = 'hot'))::int                    as hot,
      (count(*) filter (
        where l.created_at >= now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
      ))::int                                                            as new30d
    from public.leads l
    group by l.tenant_id
  ),
  event_agg as (
    select e.tenant_id, max(e.created_at) as last_activity_at
    from public.lead_events e
    group by e.tenant_id
  ),
  merged as (
    select
      coalesce(l.tenant_id, e.tenant_id)      as tenant_id,
      coalesce(l.total, 0)                    as total,
      coalesce(l.hot, 0)                      as hot,
      coalesce(l.new30d, 0)                   as new30d,
      e.last_activity_at
    from lead_agg l
    full outer join event_agg e on e.tenant_id = l.tenant_id
  )
  select coalesce(
    jsonb_object_agg(
      tenant_id,
      jsonb_build_object(
        'total', total, 'hot', hot, 'new30d', new30d,
        'last_activity_at', last_activity_at
      )
    ),
    '{}'::jsonb
  )
  from merged
  where tenant_id is not null;
$$;

revoke all on function public.tenant_hub_stats(int) from public, anon, authenticated;
grant execute on function public.tenant_hub_stats(int) to service_role;

-- ── Métricas por canal de adquisición ────────────────────────────────────────
-- Devuelve { channel_id: { leads_total, leads_in_window, page_views_in_window,
-- conversion_rate, avg_temp_score } }.
--
-- page_views_in_window replica la regla previa: visitantes ÚNICOS por
-- visitor_fingerprint, más una vista por cada fila legacy sin fingerprint (para
-- no perderlas). avg_temp_score ignora los leads sin score (null), y devuelve
-- null cuando no hay ninguno con score — la UI muestra "—".
create or replace function public.channel_metrics(
  p_channel_ids uuid[],
  p_window_days int default 30
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select now() - make_interval(days => greatest(coalesce(p_window_days, 30), 1)) as window_start
  ),
  ids as (
    select unnest(coalesce(p_channel_ids, '{}'::uuid[])) as channel_id
  ),
  lead_agg as (
    select
      l.acquisition_channel_id                                                as channel_id,
      count(*)::int                                                           as leads_total,
      (count(*) filter (where l.created_at >= b.window_start))::int           as leads_in_window,
      avg(l.current_score) filter (
        where l.created_at >= b.window_start and l.current_score is not null
      )                                                                       as avg_score
    from public.leads l, bounds b
    where l.acquisition_channel_id in (select channel_id from ids)
    group by l.acquisition_channel_id
  ),
  view_agg as (
    select
      pv.channel_id,
      (count(distinct pv.visitor_fingerprint)
        + count(*) filter (where pv.visitor_fingerprint is null))::int         as views
    from public.channel_page_views pv, bounds b
    where pv.channel_id in (select channel_id from ids)
      and pv.created_at >= b.window_start
    group by pv.channel_id
  )
  select coalesce(
    jsonb_object_agg(
      i.channel_id,
      jsonb_build_object(
        'leads_total',          coalesce(l.leads_total, 0),
        'leads_in_window',      coalesce(l.leads_in_window, 0),
        'page_views_in_window', coalesce(v.views, 0),
        'conversion_rate',      case
                                  when coalesce(v.views, 0) > 0
                                  then round((coalesce(l.leads_in_window, 0)::numeric / v.views) * 100)::int
                                  else 0
                                end,
        'avg_temp_score',       case when l.avg_score is null then null else round(l.avg_score)::int end
      )
    ),
    '{}'::jsonb
  )
  from ids i
  left join lead_agg l on l.channel_id = i.channel_id
  left join view_agg v on v.channel_id = i.channel_id;
$$;

revoke all on function public.channel_metrics(uuid[], int) from public, anon, authenticated;
grant execute on function public.channel_metrics(uuid[], int) to service_role;
