-- 079 — Dos correcciones encontradas al probar la Fase A contra producción.
--
-- (1) El veredicto de la IA no caducaba. `leads_list.urgency` daba prioridad
--     absoluta a metadata.ai_fit.next_action_when, sin mirar CUÁNDO se escribió.
--     Un briefing de hace diez días seguía diciendo "Hoy", así que el KPI "Para
--     hoy" y la cola del día se llenaban de leads que ya no eran urgentes — que
--     es justo lo que el eje de urgencia existía para evitar.
--
--     El briefing ya guarda su fecha en ai_fit.at, así que el veredicto vale lo
--     que dura su propio horizonte: 'hoy' 48 horas, el resto 7 días. Vencido,
--     manda la regla determinista sobre la última señal — que es la que sigue
--     funcionando con la IA apagada o sin presupuesto.
--
-- (2) "Cerrados · este mes" contaba por created_at. Un lead creado en junio y
--     cerrado en agosto no aparecía, y uno creado y cerrado el mismo mes sí,
--     aunque el cierre fuera lo único que importa. La fecha real del cierre
--     vive en lead_status_history; de ahí sale ahora.
--
--     Los leads importados sin historial no cuentan: no sabemos cuándo se
--     cerraron y afirmar que fue este mes sería inventarlo.

-- ── 1) Vista: la urgencia de la IA caduca ────────────────────────────────────
drop view if exists public.leads_list;

create view public.leads_list
with (security_invoker = on) as
select
  l.*,

  -- ETAPA — en Fase A se DERIVA de status; no se toca la columna. La Fase B la
  -- separa de verdad y con ello desaparece el concepto de congelado.
  case
    when l.status = 'new'                                  then 'nuevo'
    when l.status in ('nurturing','warm','hot')            then 'nutricion'
    when l.status = 'process_started'                      then 'en_proceso'
    when l.status in ('process_completed','closed')        then 'cerrado'
    when l.status = 'lost'                                 then 'perdido'
  end as stage,

  -- CALIDAD — quintil dentro de la cartera activa del tenant. Con menos de 20
  -- leads activos los quintiles no significan nada y se cae a cortes fijos.
  case
    when coalesce(b.active_leads, 0) < 20 then
      case
        when coalesce(l.quality_score, 0) >= 80 then 'alta'
        when coalesce(l.quality_score, 0) >= 60 then 'media_alta'
        when coalesce(l.quality_score, 0) >= 35 then 'media'
        when coalesce(l.quality_score, 0) >= 15 then 'media_baja'
        else 'baja'
      end
    else
      case
        when coalesce(l.quality_score, 0) >= b.p80 then 'alta'
        when coalesce(l.quality_score, 0) >= b.p60 then 'media_alta'
        when coalesce(l.quality_score, 0) >= b.p40 then 'media'
        when coalesce(l.quality_score, 0) >= b.p20 then 'media_baja'
        else 'baja'
      end
  end as quality_band,

  -- URGENCIA — derivada al leer, nunca almacenada. Manda el briefing de IA
  -- MIENTRAS SIGA VIGENTE; si caducó o no existe, la regla determinista sobre
  -- la última señal positiva.
  case
    when l.status in ('process_started','process_completed','closed','lost') then null
    when ai.fresh_when is not null                                   then ai.fresh_when
    when l.last_signal_at > now() - interval '48 hours'
     and l.last_signal_type in ('email_replied','contact_us_question') then 'hoy'
    when l.last_signal_at > now() - interval '7 days'                then 'esta_semana'
    else 'sin_apuro'
  end as urgency,

  -- Rango numérico de la urgencia, para ordenar sin repetir el CASE.
  case
    when l.status in ('process_started','process_completed','closed','lost') then 9
    when ai.fresh_when = 'hoy'                                       then 0
    when ai.fresh_when = 'esta_semana'                               then 1
    when ai.fresh_when = 'sin_apuro'                                 then 2
    when l.last_signal_at > now() - interval '48 hours'
     and l.last_signal_type in ('email_replied','contact_us_question') then 0
    when l.last_signal_at > now() - interval '7 days'                then 1
    else 2
  end as urgency_rank,

  -- Se conservan de la 072 para no romper el orden "Atención" mientras la UI migra.
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
from public.leads l
left join public.tenant_quality_bands b on b.tenant_id = l.tenant_id
-- Veredicto de la IA sólo si sigue vigente. El cast va con guarda de formato:
-- un `at` corrupto tumbaría la lista entera de leads, y eso no lo vale.
left join lateral (
  select case
    when s.at_ts is null                                                  then null
    when s.w = 'hoy'         and s.at_ts > now() - interval '48 hours'    then 'hoy'
    when s.w = 'esta_semana' and s.at_ts > now() - interval '7 days'      then 'esta_semana'
    when s.w = 'sin_apuro'   and s.at_ts > now() - interval '7 days'      then 'sin_apuro'
  end as fresh_when
  from (
    select
      l.metadata #>> '{ai_fit,next_action_when}' as w,
      case when (l.metadata #>> '{ai_fit,at}') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'
           then (l.metadata #>> '{ai_fit,at}')::timestamptz end as at_ts
  ) s
) ai on true;

revoke all on public.leads_list from anon;
grant select on public.leads_list to authenticated, service_role;

-- ── 2) Dashboard: "cerrados este mes" por fecha de cierre real ───────────────
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
    select l.id, l.agent_id, l.status, l.stage, l.quality_band, l.urgency,
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
    -- Cuándo se CERRÓ, no cuándo entró. Sale de lead_status_history, que es el
    -- único sitio donde consta la fecha de la transición.
    'closed_this_month', (
      select count(distinct h.lead_id)::int
      from public.lead_status_history h
      where h.lead_id in (select id from scoped)
        and h.to_status in ('closed', 'process_completed')
        and h.changed_at >= date_trunc('month', (now() at time zone 'utc')) at time zone 'utc'
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
