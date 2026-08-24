-- 106 · El suscriptor de newsletter no define la calidad de la cartera.
--
-- refresh_quality_bands calcula los quintiles sobre TODO lead en etapa nuevo o
-- nutricion. Un suscriptor entra con fit_profile vacio (fit_score 0), el
-- form_baseline de +10 y etapa nuevo: score ~ 10.
--
-- Con 60 leads reales y 400 suscriptores el p80 cae de ~70 a ~15 y toda la
-- cartera pasa a banda "alta". La banda -- el mecanismo que dirige la atencion
-- del agente -- deja de significar nada, sin error y sin sintoma visible. Es el
-- mismo fallo silencioso que la 098 arreglo por otra via.
--
-- Es tambien el mismo problema que resolvio la 080 con los leads importados, y
-- la misma solucion: no hace falta una etapa nueva, hace falta la PROCEDENCIA.
-- La marca vive en leads.metadata->'newsletter_subscriber' y se quita al
-- graduarse (cuando el suscriptor muestra intencion), asi que un lead deja de
-- estar excluido en el momento en que empieza a contar.
--
-- El suscriptor SI sigue contando en la analitica por fuente: ahi es donde
-- aporta, porque mide de donde vino.
--
-- OJO: la vista se recrea ENTERA a partir de su definicion viva. Perder una
-- columna aqui deja /leads sin cargar y sin error en tsc -- ya paso con la 082.

-- ── 1) La vista expone la marca ──────────────────────────────────────────────
drop view if exists public.leads_list;

create view public.leads_list
with (security_invoker = on) as
select
  l.id,
  l.tenant_id,
  l.agent_id,
  l.first_name,
  l.last_name,
  l.email,
  l.phone,
  l.language,
  l.lender,
  l.notes,
  l.created_at,
  l.updated_at,
  l.acquisition_channel_id,
  l.traffic_source,
  l.traffic_source_detail,
  l.peak_score,
  l.current_score,
  l.last_event_at,
  l.score_updated_at,
  l.metadata,
  l.fit_profile,
  l.fit_score,
  l.engagement_score,
  l.manual_score,
  l.email_blocked,
  l.email_blocked_reason,
  l.search_text,
  l.quality_score,
  l.last_signal_at,
  l.last_signal_type,
  l.stage,

  -- Procedencia: vino de otro CRM, no lo capto un canal de ITMANO.
  jsonb_exists(coalesce(l.metadata, '{}'::jsonb), 'imported') as is_imported,

  -- Procedencia: llego por el formulario de una newsletter y todavia no ha
  -- mostrado intencion. Se le quita la marca al graduarse.
  jsonb_exists(coalesce(l.metadata, '{}'::jsonb), 'newsletter_subscriber') as is_subscriber,

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
    when l.stage not in ('nuevo','nutricion')                        then null
    when ai.fresh_when is not null                                   then ai.fresh_when
    when l.last_signal_at > now() - interval '48 hours'
     and l.last_signal_type in ('email_replied','contact_us_question') then 'hoy'
    when l.last_signal_at > now() - interval '7 days'                then 'esta_semana'
    else 'sin_apuro'
  end as urgency,

  case
    when l.stage not in ('nuevo','nutricion')                        then 9
    when ai.fresh_when = 'hoy'                                       then 0
    when ai.fresh_when = 'esta_semana'                               then 1
    when ai.fresh_when = 'sin_apuro'                                 then 2
    when l.last_signal_at > now() - interval '48 hours'
     and l.last_signal_type in ('email_replied','contact_us_question') then 0
    when l.last_signal_at > now() - interval '7 days'                then 1
    else 2
  end as urgency_rank,

  l.budget_amount
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

-- ── 2) Los quintiles se calculan solo sobre prospectos ───────────────────────
-- Unico cambio respecto a la 098: el filtro de procedencia del subquery.
create or replace function public.refresh_quality_bands()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count integer := 0;
begin
  insert into tenant_quality_bands (tenant_id, p20, p40, p60, p80, active_leads, computed_at)
  select
    t.tenant_id,
    percentile_cont(0.2) within group (order by t.q)::int,
    percentile_cont(0.4) within group (order by t.q)::int,
    percentile_cont(0.6) within group (order by t.q)::int,
    percentile_cont(0.8) within group (order by t.q)::int,
    count(*)::int,
    now()
  from (
    select l.tenant_id, coalesce(l.quality_score, 0) as q
    from   leads l
    -- Solo cartera VIVA: cerrar un buen lead no debe degradar a los demas.
    where  l.stage not in ('en_proceso','cerrado','perdido')
    -- Y solo PROSPECTOS: un lector de la newsletter no define que es un lead
    -- de banda "alta" para esta agencia.
      and  not jsonb_exists(coalesce(l.metadata, '{}'::jsonb), 'newsletter_subscriber')
  ) t
  group by t.tenant_id
  on conflict (tenant_id) do update
  set p20 = excluded.p20, p40 = excluded.p40, p60 = excluded.p60,
      p80 = excluded.p80, active_leads = excluded.active_leads,
      computed_at = excluded.computed_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.refresh_quality_bands() from public, anon, authenticated;
grant execute on function public.refresh_quality_bands() to service_role;
