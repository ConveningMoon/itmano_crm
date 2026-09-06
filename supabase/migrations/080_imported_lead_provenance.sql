-- 080 — Procedencia de los leads importados de otro CRM.
--
-- A&J arrancó con 113 leads traídos de HubSpot. Entraron ya cerrados: nunca
-- pasaron por el embudo de ITMANO. Eso rompía dos cosas:
--
--   1. El embudo del dashboard deduce el paso por cada etapa desde la etapa
--      actual (un cerrado necesariamente fue nuevo alguna vez). Para un lead que
--      nació cerrado eso es historia inventada, y con 113 de 116 el embudo decía
--      "100% de paso" en todas las etapas — un número bonito y falso.
--
--   2. Iban con traffic_source = 'direct', o sea "Registro manual". En la
--      analítica de canales eso convertía al registro manual en la fuente que
--      más cierra, cuando esos cierres ocurrieron fuera del sistema.
--
-- NO se les cambia el estado. Están cerrados y eso es verdad: alimentan la
-- calidad por fuente y la tasa de conversión. Lo que faltaba no era una etapa
-- nueva, era la PROCEDENCIA — de dónde vino el lead, que es otro eje.
--
-- La regla es agnóstica del tenant: un lead en etapa post-embudo SIN una sola
-- transición en lead_status_history nunca se movió dentro del CRM, así que
-- entró ya en ese estado. Hoy eso son 113 filas, todas de A&J.

-- ── 1) Marcar la procedencia ─────────────────────────────────────────────────
-- 'import' es un valor nuevo de traffic_source; el CHECK lo enumera.
alter table public.leads drop constraint if exists leads_traffic_source_check;
alter table public.leads add constraint leads_traffic_source_check
  check (traffic_source = any (array[
    'ads_meta', 'ads_google', 'organic_social', 'direct', 'referral',
    'unknown', 'instagram', 'facebook', 'whatsapp', 'import'
  ]));

update public.leads l
set
  traffic_source = 'import',
  metadata = coalesce(l.metadata, '{}'::jsonb)
             || jsonb_build_object('imported', jsonb_build_object(
                  'system', 'hubspot',
                  'at',     to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                ))
where l.status in ('process_started', 'process_completed', 'closed', 'lost')
  and l.traffic_source = 'direct'
  and not exists (select 1 from public.lead_status_history h where h.lead_id = l.id);

-- ── 2) La vista expone la marca ──────────────────────────────────────────────
drop view if exists public.leads_list;

create view public.leads_list
with (security_invoker = on) as
select
  l.*,

  -- Procedencia: vino de otro CRM, no lo captó un canal de ITMANO.
  jsonb_exists(coalesce(l.metadata, '{}'::jsonb), 'imported') as is_imported,

  case
    when l.status = 'new'                                  then 'nuevo'
    when l.status in ('nurturing','warm','hot')            then 'nutricion'
    when l.status = 'process_started'                      then 'en_proceso'
    when l.status in ('process_completed','closed')        then 'cerrado'
    when l.status = 'lost'                                 then 'perdido'
  end as stage,

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

  case
    when l.status in ('process_started','process_completed','closed','lost') then null
    when ai.fresh_when is not null                                   then ai.fresh_when
    when l.last_signal_at > now() - interval '48 hours'
     and l.last_signal_type in ('email_replied','contact_us_question') then 'hoy'
    when l.last_signal_at > now() - interval '7 days'                then 'esta_semana'
    else 'sin_apuro'
  end as urgency,

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

-- ── 3) El embudo del dashboard ignora a los importados ───────────────────────
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
           l.is_imported,
           coalesce(l.current_score, 0) as score,
           coalesce(l.quality_score, 0) as quality,
           l.created_at
    from public.leads_list l
    where (p_tenant_id is null or l.tenant_id = p_tenant_id)
      and (p_agent_id  is null or l.agent_id  = p_agent_id)
  ),
  by_status as (select status, count(*)::int as c from scoped group by status),
  -- Sólo los leads que SÍ recorrieron el embudo dentro del CRM. Un importado no
  -- pasó por "nuevo" aquí, y contarlo como si lo hubiera hecho falsea la tasa
  -- de paso, que es justamente el número que este bloque existe para dar.
  by_stage  as (select stage, count(*)::int as c from scoped where not is_imported group by stage),
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
    'active',    (select count(*)::int from scoped where stage in ('nuevo','nutricion')),
    'high_quality', (select count(*)::int from scoped where stage in ('nuevo','nutricion') and quality_band = 'alta'),
    'urgent_today', (select count(*)::int from scoped where urgency = 'hoy'),
    -- Para que la UI pueda decir de dónde salen los que faltan en el embudo.
    'imported',  (select count(*)::int from scoped where is_imported),
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
