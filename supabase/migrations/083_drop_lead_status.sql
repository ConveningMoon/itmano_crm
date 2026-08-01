-- 083 — Se va `leads.status`.
--
-- APLICAR DESPUÉS DEL DEPLOY de la Fase B. La 082 dejó la columna en pie a
-- propósito para que el código anterior siguiera funcionando en el hueco entre
-- migrar y desplegar; una vez desplegado, nadie la lee.
--
-- Lo que decía ya lo dicen `leads.stage` (dónde está) y `leads.quality_score`
-- con su banda (qué tan bueno es). El estado del proceso de compra vive en
-- `purchase_processes.completed_at` desde la 082.
--
-- Los índices que la incluían caen solos con la columna; sus equivalentes sobre
-- `stage` ya se crearon en la 082, así que no queda hueco de rendimiento.

-- El picker de secuencias manuales también filtraba por status. Va aquí y no en
-- la 082 porque cambia la FIRMA del RPC: aplicarlo antes del deploy dejaría al
-- código viejo llamando con `p_status`. Al ir después, la ventana rota es el
-- minuto del deploy y además degrada suave — getEligibleLeadsForSequence
-- devuelve la lista vacía ante un error, no revienta la página.
-- Los tipos de los parámetros no cambian, sólo el nombre de uno (p_status →
-- p_stage), y CREATE OR REPLACE no permite renombrar parámetros: hay que
-- borrarla y volver a crearla.
drop function if exists public.sequence_eligible_leads(uuid, text, text, text, text, text, text, integer);

create function public.sequence_eligible_leads(
  p_sequence_id uuid,
  p_tenant_id   text default null,
  p_agent_id    text default null,
  p_search      text default null,
  p_stage       text default null,
  p_language    text default null,
  p_agent_filter text default null,
  p_limit       integer default 50
)
returns jsonb
language sql
stable
set search_path to ''
as $function$
  with eligible as (
    select l.id, l.first_name, l.last_name, l.email, l.stage,
           l.agent_id, l.language, l.search_text, l.created_at
    from public.leads l
    where (p_tenant_id is null or l.tenant_id = p_tenant_id)
      and (p_agent_id  is null or l.agent_id  = p_agent_id)
      and not exists (
        select 1
        from public.lead_sequence_runs r
        where r.lead_id     = l.id
          and r.sequence_id = p_sequence_id
          and r.status      = 'active'
      )
  ),
  filtered as (
    select *
    from eligible
    where (p_search       is null or p_search = '' or search_text like '%' || lower(p_search) || '%')
      and (p_stage        is null or stage    = p_stage)
      and (p_language     is null or language = p_language)
      and (p_agent_filter is null or agent_id = p_agent_filter)
  )
  select jsonb_build_object(
    'total',     (select count(*)::int from eligible),
    'matched',   (select count(*)::int from filtered),
    'stages',    coalesce((select jsonb_agg(distinct stage)    from eligible), '[]'::jsonb),
    'languages', coalesce((select jsonb_agg(distinct language) from eligible where language is not null), '[]'::jsonb),
    'items',     coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',         id,
        'first_name', first_name,
        'last_name',  last_name,
        'email',      email,
        'stage',      stage,
        'agent_id',   agent_id,
        'language',   language
      ))
      from (select * from filtered order by created_at desc, id desc limit p_limit) t
    ), '[]'::jsonb)
  );
$function$;

revoke all on function public.sequence_eligible_leads(uuid, text, text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.sequence_eligible_leads(uuid, text, text, text, text, text, text, integer) to service_role;

-- El hub de super admin contaba "calientes" por tenant. Esa banda ya no existe;
-- pasa a calidad alta, que es el equivalente en el modelo nuevo. Va aquí porque
-- lee `leads.status` y reventaría en cuanto la columna desaparezca.
create or replace function public.tenant_hub_stats(p_days integer default 30)
returns jsonb
language sql
stable
set search_path to ''
as $function$
  with lead_agg as (
    select
      l.tenant_id,
      count(*)::int                                                      as total,
      (count(*) filter (where l.quality_band = 'alta'))::int              as high_quality,
      (count(*) filter (
        where l.created_at >= now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
      ))::int                                                            as new30d
    from public.leads_list l
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
      coalesce(l.high_quality, 0)             as high_quality,
      coalesce(l.new30d, 0)                   as new30d,
      e.last_activity_at
    from lead_agg l
    full outer join event_agg e on e.tenant_id = l.tenant_id
  )
  select coalesce(
    jsonb_object_agg(
      tenant_id,
      jsonb_build_object(
        'total', total, 'high_quality', high_quality, 'new30d', new30d,
        'last_activity_at', last_activity_at
      )
    ),
    '{}'::jsonb
  )
  from merged
  where tenant_id is not null;
$function$;

revoke all on function public.tenant_hub_stats(integer) from public, anon, authenticated;
grant execute on function public.tenant_hub_stats(integer) to service_role;

-- El puente de la 082 ya no tiene nada que propagar.
drop trigger if exists trg_mirror_status_to_stage on public.leads;
drop function if exists public.mirror_status_to_stage();

-- La vista expande `l.*`, así que hay que recrearla sin la columna.
drop view if exists public.leads_list;

alter table public.leads drop column status;

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
