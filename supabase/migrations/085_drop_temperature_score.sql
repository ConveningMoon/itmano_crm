-- 085 — Se va `leads.temperature_score`.
--
-- Columna muerta desde la migración 072: nadie la escribe ni la lee. El score
-- real vive en `current_score` y la medición que importa en `quality_score`.
--
-- El riesgo aparente era perder los scores históricos previos a la 072. No hay
-- tal: las 117 filas tienen el valor en 0. La columna no guarda nada.
--
-- Lo que sí hacía daño era el nombre. En TypeScript el mapper la reapuntaba
-- (`temperatureScore: r.current_score`), así que quien leyera ese campo creía
-- estar viendo esta columna y veía otra cosa. Ese alias ya se quitó del código;
-- esto retira la columna que lo justificaba.

-- La vista expande `l.*`, así que hay que recrearla sin la columna.
drop view if exists public.leads_list;

-- El índice (tenant_id, temperature_score) cae solo con la columna. No se
-- reemplaza: su equivalente útil es idx_leads_tenant_quality, de la 082.
alter table public.leads drop column temperature_score;

create view public.leads_list
with (security_invoker = on) as
select
  l.*,
  jsonb_exists(coalesce(l.metadata, '{}'::jsonb), 'imported') as is_imported,

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
    when l.stage not in ('nuevo', 'nutricion')                       then null
    when ai.fresh_when is not null                                   then ai.fresh_when
    when l.last_signal_at > now() - interval '48 hours'
     and l.last_signal_type in ('email_replied','contact_us_question') then 'hoy'
    when l.last_signal_at > now() - interval '7 days'                then 'esta_semana'
    else 'sin_apuro'
  end as urgency,

  case
    when l.stage not in ('nuevo', 'nutricion')                       then 9
    when ai.fresh_when = 'hoy'                                       then 0
    when ai.fresh_when = 'esta_semana'                               then 1
    when ai.fresh_when = 'sin_apuro'                                 then 2
    when l.last_signal_at > now() - interval '48 hours'
     and l.last_signal_type in ('email_replied','contact_us_question') then 0
    when l.last_signal_at > now() - interval '7 days'                then 1
    else 2
  end as urgency_rank
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
