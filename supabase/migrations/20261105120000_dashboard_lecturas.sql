-- Lecturas del dashboard rediseñado (fase 2).
-- Sólo funciones nuevas: sin DROP ni cambios destructivos.

-- ── email_dashboard_stats ────────────────────────────────────────────────────
-- Métricas de email de una ventana de p_days días locales (zona p_time_zone):
-- desde el inicio del día local hoy-(p_days-1) hasta ahora, sobre email_sends.sent_at.
--
--   p_tenant_id  null → todos los tenants (super_admin).
--   p_agent_id   no nulo → sólo envíos cuyo lead pertenece a ese agente
--                (incluye lo que la agencia envió a esos leads). Nulo → todo el scope.
--
-- Tasas: enteras, una vez por lead, con eventos posteriores a su primer envío DE LA
-- VENTANA (mismo criterio que sequence_email_metrics). Sin envíos, 0.
-- Clases: broadcast → grupales; purchase → cierre; sequence con trigger_tag_id →
-- etiqueta; sequence sin él → secuencias; one_off y open_house → otros.
-- Serie: todas las barras, también en cero. 7 días: una por día; 28 y 91: una por
-- cada 7 días contando hacia atrás desde hoy. start es la fecha local YYYY-MM-DD.
create or replace function public.email_dashboard_stats(
  p_tenant_id text,
  p_agent_id  text,
  p_days      int,
  p_time_zone text
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  with params as (
    select
      (now() at time zone p_time_zone)::date                  as today,
      ((now() at time zone p_time_zone)::date - (p_days - 1)) as win_start_day,
      case when p_days <= 7 then 1 else 7 end                 as bucket_days
  ),
  win as (
    select win_start_day, today, bucket_days,
           (win_start_day::timestamp at time zone p_time_zone) as win_start_ts
    from params
  ),
  sends as (
    select
      e.id, e.lead_id, e.sent_at,
      case
        when e.send_type = 'broadcast' then 'grupales'
        when e.send_type = 'purchase'  then 'cierre'
        when e.send_type = 'sequence' and s.trigger_tag_id is not null then 'etiqueta'
        when e.send_type = 'sequence'  then 'secuencias'
        else 'otros'
      end as class,
      case when e.send_type = 'sequence' then r.sequence_id end as sequence_id,
      ((e.sent_at at time zone p_time_zone)::date)              as local_day
    from public.email_sends e
    join public.leads l
      on l.id = e.lead_id and l.tenant_id = e.tenant_id
    left join public.lead_sequence_runs r on r.id = e.sequence_run_id
    left join public.email_sequences s    on s.id = r.sequence_id
    cross join win w
    where (p_tenant_id is null or e.tenant_id = p_tenant_id)
      and (p_agent_id  is null or l.agent_id = p_agent_id)
      and e.sent_at >= w.win_start_ts
      and e.sent_at <= now()
  ),
  ev as (
    select x.lead_id, x.type, x.created_at
    from public.lead_events x
    where x.type in ('email_clicked', 'email_replied', 'email_hard_bounce', 'email_unsubscribed')
      and (p_tenant_id is null or x.tenant_id = p_tenant_id)
      and x.lead_id in (select lead_id from sends)
  ),
  -- Total: primer envío de cada lead en la ventana.
  all_lead as (
    select f.lead_id,
      bool_or(e.type = 'email_clicked')      as clicked,
      bool_or(e.type = 'email_replied')      as replied,
      bool_or(e.type = 'email_hard_bounce')  as bounced,
      bool_or(e.type = 'email_unsubscribed') as unsubscribed
    from (select lead_id, min(sent_at) as first_sent from sends group by lead_id) f
    left join ev e on e.lead_id = f.lead_id and e.created_at >= f.first_sent
    group by f.lead_id
  ),
  all_agg as (
    select count(*)::int as unique_leads,
      (count(*) filter (where clicked))::int      as clicked,
      (count(*) filter (where replied))::int      as replied,
      (count(*) filter (where bounced))::int      as bounced,
      (count(*) filter (where unsubscribed))::int as unsubscribed
    from all_lead
  ),
  -- Por secuencia: sólo envíos de clase secuencias/etiqueta.
  seq_lead as (
    select f.sequence_id, f.lead_id,
      bool_or(e.type = 'email_clicked')      as clicked,
      bool_or(e.type = 'email_replied')      as replied,
      bool_or(e.type = 'email_hard_bounce')  as bounced,
      bool_or(e.type = 'email_unsubscribed') as unsubscribed
    from (
      select sequence_id, lead_id, min(sent_at) as first_sent
      from sends where sequence_id is not null group by sequence_id, lead_id
    ) f
    left join ev e on e.lead_id = f.lead_id and e.created_at >= f.first_sent
    group by f.sequence_id, f.lead_id
  ),
  seq_agg as (
    select sequence_id, count(*)::int as unique_leads,
      (count(*) filter (where clicked))::int      as clicked,
      (count(*) filter (where replied))::int      as replied,
      (count(*) filter (where bounced))::int      as bounced,
      (count(*) filter (where unsubscribed))::int as unsubscribed
    from seq_lead group by sequence_id
  ),
  seq_sends as (
    select sequence_id, count(*)::int as total_sends
    from sends where sequence_id is not null group by sequence_id
  ),
  buckets as (
    select g.i,
      to_char(w.win_start_day + g.i * w.bucket_days, 'YYYY-MM-DD') as start,
      (w.win_start_day + g.i * w.bucket_days)       as b_start,
      (w.win_start_day + (g.i + 1) * w.bucket_days) as b_end
    from win w
    cross join lateral generate_series(0, ((p_days + w.bucket_days - 1) / w.bucket_days) - 1) as g(i)
  ),
  series as (
    select b.i, b.start,
      (select count(*)::int from sends s where s.local_day >= b.b_start and s.local_day < b.b_end) as sends
    from buckets b
  )
  select jsonb_build_object(
    'total_sends',  (select count(*)::int from sends),
    'unique_leads', coalesce((select unique_leads from all_agg), 0),
    'click_rate',       case when coalesce((select unique_leads from all_agg), 0) > 0 then round((select clicked from all_agg)::numeric      / (select unique_leads from all_agg) * 100)::int else 0 end,
    'reply_rate',       case when coalesce((select unique_leads from all_agg), 0) > 0 then round((select replied from all_agg)::numeric      / (select unique_leads from all_agg) * 100)::int else 0 end,
    'bounce_rate',      case when coalesce((select unique_leads from all_agg), 0) > 0 then round((select bounced from all_agg)::numeric      / (select unique_leads from all_agg) * 100)::int else 0 end,
    'unsubscribe_rate', case when coalesce((select unique_leads from all_agg), 0) > 0 then round((select unsubscribed from all_agg)::numeric / (select unique_leads from all_agg) * 100)::int else 0 end,
    'by_class', jsonb_build_object(
      'secuencias', (select count(*)::int from sends where class = 'secuencias'),
      'grupales',   (select count(*)::int from sends where class = 'grupales'),
      'etiqueta',   (select count(*)::int from sends where class = 'etiqueta'),
      'cierre',     (select count(*)::int from sends where class = 'cierre'),
      'otros',      (select count(*)::int from sends where class = 'otros')
    ),
    'series', coalesce((select jsonb_agg(jsonb_build_object('start', start, 'sends', sends) order by i) from series), '[]'::jsonb),
    'by_sequence', coalesce((
      select jsonb_object_agg(ss.sequence_id, jsonb_build_object(
        'total_sends',      ss.total_sends,
        'click_rate',       case when sa.unique_leads > 0 then round(sa.clicked::numeric      / sa.unique_leads * 100)::int else 0 end,
        'reply_rate',       case when sa.unique_leads > 0 then round(sa.replied::numeric      / sa.unique_leads * 100)::int else 0 end,
        'bounce_rate',      case when sa.unique_leads > 0 then round(sa.bounced::numeric      / sa.unique_leads * 100)::int else 0 end,
        'unsubscribe_rate', case when sa.unique_leads > 0 then round(sa.unsubscribed::numeric / sa.unique_leads * 100)::int else 0 end
      ))
      from seq_sends ss left join seq_agg sa on sa.sequence_id = ss.sequence_id
    ), '{}'::jsonb)
  );
$function$;

revoke all on function public.email_dashboard_stats(text, text, int, text) from public, anon, authenticated;
grant execute on function public.email_dashboard_stats(text, text, int, text) to service_role;
