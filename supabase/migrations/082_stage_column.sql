-- 082 — La etapa deja de compartir columna con la medición (Fase B).
--
-- `leads.status` hacía dos trabajos incompatibles:
--
--   · MEDIR       — new / nurturing / warm / hot los escribía el trigger de
--                   scoring a partir del score.
--   · UBICAR      — process_started / process_completed / closed / lost los
--                   movía el agente.
--
-- Como el trigger pisaba lo que ponía el agente, hubo que inventar el
-- CONGELADO: al entrar en una etapa post-embudo, `recompute_lead_score`
-- retornaba de inmediato y el lead dejaba de medirse. Eso resolvía el choque
-- rompiendo la medición, que es justo lo que no queríamos.
--
-- Con `stage` en su propia columna el choque no existe: el agente es el único
-- dueño de la etapa y el sistema es el único dueño de calidad y urgencia.
-- Ninguno pisa al otro, así que el congelado sobra y desaparece.
--
-- La ÚNICA excepción: una regla con side_effect = 'force_perdido' (queja de
-- spam, descalificación manual) sí mueve la etapa a 'perdido'. Son hechos
-- objetivos, no una opinión que el agente pueda contradecir.
--
-- `status` se borra. Lo que decía ya lo dicen la etapa y la banda de calidad,
-- salvo una cosa: si un proceso de compra terminó. Eso pasa a
-- `purchase_processes.completed_at`, que además guarda CUÁNDO — un dato que
-- `status = 'process_completed'` nunca tuvo.

-- ── 1) La vista se va primero ────────────────────────────────────────────────
-- Expone un `stage` derivado que chocaría contra la columna nueva al expandir
-- `l.*`. Se recrea al final leyendo ya de la columna.
drop view if exists public.leads_list;

-- ── 2) La columna de etapa ───────────────────────────────────────────────────
alter table public.leads add column stage text;

update public.leads set stage = case
  when status = 'new'                           then 'nuevo'
  when status in ('nurturing', 'warm', 'hot')   then 'nutricion'
  when status = 'process_started'               then 'en_proceso'
  when status in ('process_completed','closed') then 'cerrado'
  when status = 'lost'                          then 'perdido'
  else 'nuevo'
end;

alter table public.leads
  alter column stage set not null,
  alter column stage set default 'nuevo',
  add constraint leads_stage_check
    check (stage = any (array['nuevo','nutricion','en_proceso','cerrado','perdido']));

comment on column public.leads.stage is
  'Dónde está el lead en el embudo. La mueve el AGENTE. El sistema sólo la toca '
  'por side_effect force_perdido. La medición vive en quality_score.';

-- ── 3) Dónde termina un proceso de compra ────────────────────────────────────
alter table public.purchase_processes add column completed_at timestamptz;

comment on column public.purchase_processes.completed_at is
  'Cuándo se completó el proceso. Null = sigue abierto. Antes esto se deducía '
  'de leads.status = process_completed, que no guardaba la fecha.';

update public.purchase_processes p
set    completed_at = h.changed_at
from (
  select lead_id, max(changed_at) as changed_at
  from   public.lead_status_history
  where  to_status = 'process_completed'
  group  by lead_id
) h
where h.lead_id = p.lead_id;

-- ── 4) Índices equivalentes ──────────────────────────────────────────────────
-- Los que llevaban `status` (directo o en INCLUDE) desaparecen solos al borrar
-- la columna; se crean antes sus equivalentes para no dejar hueco.
create index idx_leads_acquisition_channel_stage
  on public.leads (acquisition_channel_id, stage);
create index idx_leads_tenant_stage_created_at
  on public.leads (tenant_id, stage, created_at desc, id desc);
create index idx_leads_tenant_agent_analytics_stage
  on public.leads (tenant_id, agent_id)
  include (stage, current_score, quality_score, created_at, traffic_source, acquisition_channel_id);
create index idx_leads_tenant_hub_stage
  on public.leads (tenant_id) include (stage, created_at);

-- ── 5) El motor de scoring deja de mover la etapa ────────────────────────────
create or replace function public.recompute_lead_score(p_lead_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lead          leads%rowtype;
  v_fit           integer;
  v_eng           integer;
  v_man           integer;
  v_eng_raw       integer;
  v_quality       integer;
  v_total         integer;
  v_old_current   integer;
  v_force_perdido boolean;
  v_last_event    timestamptz;
  v_sig_at        timestamptz;
  v_sig_type      text;
begin
  select * into v_lead from leads where id = p_lead_id;
  if not found then return; end if;

  -- FIT — cada dimensión declarada aporta una sola vez.
  select coalesce(sum(points), 0) into v_fit
  from (
    select distinct on (r.dimension) r.points
    from   lead_score_rules r
    where  r.category = 'fit' and r.is_active
      and  (r.tenant_id = v_lead.tenant_id or r.tenant_id is null)
      and  v_lead.fit_profile ->> r.dimension = r.match_value
    order  by r.dimension, r.tenant_id nulls last
  ) f;

  -- MANUAL — lo que el agente registra. No decae.
  select coalesce(sum(pts), 0) into v_man
  from (
    select distinct on (e.id) r.points as pts
    from   lead_events e
    join   lead_score_rules r
           on  r.dimension = e.type and r.category = 'manual' and r.is_active
           and (r.tenant_id = e.tenant_id or r.tenant_id is null)
    where  e.lead_id = p_lead_id
    order  by e.id, r.tenant_id nulls last
  ) man;

  -- ENGAGEMENT SIN DECAER — alimenta la CALIDAD: el clic ocurrió, y que fuera
  -- hace dos meses no lo deshace. Lo que caduca es la urgencia, no el hecho.
  select coalesce(sum(pts), 0) into v_eng_raw
  from (
    select distinct on (e.id) r.points as pts
    from   lead_events e
    join   lead_score_rules r
           on  r.dimension = e.type and r.category = 'engagement' and r.is_active
           and (r.tenant_id = e.tenant_id or r.tenant_id is null)
    where  e.lead_id = p_lead_id
    order  by e.id, r.tenant_id nulls last
  ) engr;

  v_quality := greatest(0, least(100, v_fit + v_man + v_eng_raw));

  -- ÚLTIMA SEÑAL — sólo eventos POSITIVOS. Un hard bounce no hace urgente a
  -- nadie; de hecho es lo contrario.
  select e.created_at, e.type into v_sig_at, v_sig_type
  from   lead_events e
  join   lead_score_rules r
         on  r.dimension = e.type and r.is_active and r.points > 0
         and r.category in ('engagement', 'manual')
         and (r.tenant_id = e.tenant_id or r.tenant_id is null)
  where  e.lead_id = p_lead_id
  order  by e.created_at desc
  limit  1;

  v_old_current := coalesce(v_lead.current_score, 0);

  -- ENGAGEMENT DECAÍDO — alimenta el score interno. Cada evento decae por su
  -- cuenta: entero 14 días, luego a la mitad cada 30.
  select coalesce(sum(eff), 0) into v_eng
  from (
    select distinct on (e.id)
      case when r.decays then
        round(r.points::numeric * (
          case when (extract(epoch from (now() - e.created_at)) / 86400.0) <= 14 then 1
               else power(0.5, ((extract(epoch from (now() - e.created_at)) / 86400.0) - 14.0) / 30.0)
          end
        ))::integer
      else r.points end as eff
    from   lead_events e
    join   lead_score_rules r
           on  r.dimension = e.type and r.category = 'engagement' and r.is_active
           and (r.tenant_id = e.tenant_id or r.tenant_id is null)
    where  e.lead_id = p_lead_id
    order  by e.id, r.tenant_id nulls last
  ) eng;

  select exists (
    select 1
    from   lead_events e
    join   lead_score_rules r
           on  r.dimension = e.type and r.is_active and r.side_effect = 'force_perdido'
           and (r.tenant_id = e.tenant_id or r.tenant_id is null)
    where  e.lead_id = p_lead_id
  ) into v_force_perdido;

  v_total := case when v_force_perdido
                  then 0
                  else greatest(0, least(100, v_fit + v_eng + v_man)) end;

  select max(created_at) into v_last_event from lead_events where lead_id = p_lead_id;

  perform set_config('app.history_source', 'trigger', true);

  -- Un solo UPDATE. Ya no hay retorno anticipado por etapa: un lead en proceso
  -- o cerrado se sigue midiendo, que es lo que permite comparar calidad por
  -- fuente incluyendo los que cerraron.
  update leads
  set    fit_score        = v_fit,
         engagement_score = v_eng,
         manual_score     = v_man,
         quality_score    = v_quality,
         current_score    = v_total,
         peak_score       = greatest(coalesce(peak_score, 0), v_total),
         last_signal_at   = v_sig_at,
         last_signal_type = v_sig_type,
         last_event_at    = coalesce(v_last_event, last_event_at),
         score_updated_at = now(),
         stage            = case when v_force_perdido then 'perdido' else stage end
  where  id = p_lead_id;

  -- Aviso de lead caliente: sólo tiene sentido sobre la cartera viva. Avisar de
  -- uno que ya está en proceso o cerrado es ruido.
  if v_old_current < 80 and v_total >= 80 and not v_force_perdido
     and v_lead.stage in ('nuevo', 'nutricion') then
    insert into notifications (tenant_id, type, lead_id, agent_id, message)
    values (
      v_lead.tenant_id,
      'hot_lead',
      p_lead_id,
      v_lead.agent_id,
      v_lead.first_name || ' ' || v_lead.last_name || ' alcanzó score ' || v_total
    );
  end if;
end;
$function$;

-- ── 6) Historial: registra cambios de ETAPA ──────────────────────────────────
-- La tabla conserva su nombre y sus columnas (from_status / to_status) para no
-- arrastrar un rename por medio repo; lo que guardan ahora son etapas. Las
-- filas viejas siguen con el vocabulario anterior y por eso los conteos
-- históricos aceptan ambos.
comment on table public.lead_status_history is
  'Bitácora de cambios de ETAPA (leads.stage). Las filas anteriores a la '
  'migración 082 guardan los valores del antiguo leads.status.';

drop trigger if exists trg_lead_status_history on public.leads;

create or replace function public.record_lead_status_history()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_source text;
begin
  -- recompute_lead_score() marca app.history_source = 'trigger' antes de su
  -- UPDATE. Un cambio hecho por la app deja la variable vacía → 'agent'.
  v_source := coalesce(nullif(current_setting('app.history_source', true), ''), 'agent');

  insert into lead_status_history (lead_id, tenant_id, from_status, to_status, source)
  values (NEW.id, NEW.tenant_id, OLD.stage, NEW.stage, v_source);

  return NEW;
end;
$function$;

create trigger trg_lead_status_history
  after update of stage on public.leads
  for each row
  when (old.stage is distinct from new.stage)
  execute function public.record_lead_status_history();

-- ── 7) Cancelar secuencias al salir del embudo ───────────────────────────────
drop trigger if exists trg_cancel_runs_on_lead_status on public.leads;
drop function if exists public.cancel_runs_on_lead_status_change();

create function public.cancel_runs_on_lead_stage_change()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if NEW.stage in ('en_proceso', 'cerrado', 'perdido')
     and OLD.stage is distinct from NEW.stage then
    update lead_sequence_runs
    set    status           = 'cancelled',
           cancelled_reason = 'lead_closed',
           completed_at     = now()
    where  lead_id = NEW.id
      and  status  = 'active';
  end if;
  return NEW;
end;
$function$;

create trigger trg_cancel_runs_on_lead_stage
  after update of stage on public.leads
  for each row
  execute function public.cancel_runs_on_lead_stage_change();

-- ── 8) El cron de decaimiento habla de etapas ────────────────────────────────
-- Sigue recorriendo sólo la cartera viva: en un lead ya cerrado el decaimiento
-- del score interno no cambia ninguna decisión.
drop function if exists public.decay_lead_scores(boolean);

create function public.decay_lead_scores(p_dry_run boolean default false)
returns table(
  affected_lead_id text,
  lead_tenant_id   text,
  old_score        integer,
  new_score        integer,
  old_stage        text,
  new_stage        text,
  stage_changed    boolean
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r leads%rowtype;
begin
  for r in
    select * from leads
    where  stage in ('nuevo', 'nutricion')
      and  last_event_at is not null
      and  last_event_at < now() - interval '14 days'
    order  by last_event_at asc
  loop
    affected_lead_id := r.id;
    lead_tenant_id   := r.tenant_id;
    old_score        := coalesce(r.current_score, 0);
    old_stage        := r.stage;
    if p_dry_run then
      new_score := old_score; new_stage := old_stage; stage_changed := false;
    else
      perform recompute_lead_score(r.id);
      select current_score, stage into new_score, new_stage from leads where id = r.id;
      stage_changed := new_stage is distinct from old_stage;
    end if;
    return next;
  end loop;
end;
$function$;

revoke all on function public.decay_lead_scores(boolean) from public, anon, authenticated;
grant execute on function public.decay_lead_scores(boolean) to service_role;

-- ── 9) Puente temporal mientras el código viejo siga desplegado ──────────────
-- `status` sobrevive a esta migración a propósito: borrarla aquí rompería la
-- app en el hueco entre migrar y desplegar. Pero el código anterior no sólo la
-- LEE — también la escribe al marcar un lead como cerrado o perdido, y esa
-- escritura se perdería porque los triggers nuevos miran `stage`.
--
-- Este puente la propaga: mientras dure la ventana, cerrar un lead desde la app
-- vieja mueve la etapa igual. Es BEFORE UPDATE, así que el cambio de `stage`
-- viaja en el mismo UPDATE y dispara el historial y la cancelación de
-- secuencias con normalidad. La 083 lo retira junto con la columna.
-- `status` es NOT NULL y no tenía default: en cuanto el código deja de
-- escribirlo, cualquier alta de lead falla. Un default lo mantiene insertable
-- durante la ventana. El valor no significa nada — nadie lo lee ya.
alter table public.leads alter column status set default 'new';

create function public.mirror_status_to_stage()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  NEW.stage := case
    when NEW.status = 'new'                            then 'nuevo'
    when NEW.status in ('nurturing', 'warm', 'hot')    then 'nutricion'
    when NEW.status = 'process_started'                then 'en_proceso'
    when NEW.status in ('process_completed', 'closed') then 'cerrado'
    when NEW.status = 'lost'                           then 'perdido'
    else NEW.stage
  end;
  return NEW;
end;
$function$;

create trigger trg_mirror_status_to_stage
  before update of status on public.leads
  for each row
  when (old.status is distinct from new.status)
  execute function public.mirror_status_to_stage();

-- ── 10) La vista lee la etapa de la columna ──────────────────────────────────
create view public.leads_list
with (security_invoker = on) as
select
  l.*,
  jsonb_exists(coalesce(l.metadata, '{}'::jsonb), 'imported') as is_imported,

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

  -- URGENCIA — sólo la cartera viva compite por el día. Manda el briefing de IA
  -- mientras siga vigente; si caducó o no existe, la última señal positiva.
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

-- ── 11) Los agregados ────────────────────────────────────────────────────────
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
    select l.id, l.agent_id, l.stage, l.quality_band, l.urgency, l.is_imported,
           coalesce(l.quality_score, 0) as quality
    from public.leads_list l
    where (p_tenant_id is null or l.tenant_id = p_tenant_id)
      and (p_agent_id  is null or l.agent_id  = p_agent_id)
  ),
  -- Sólo los leads que SÍ recorrieron el embudo dentro del CRM.
  by_stage as (select stage, count(*)::int as c from scoped where not is_imported group by stage),
  by_agent as (
    select agent_id,
           count(*)::int                                              as total,
           (count(*) filter (where quality_band = 'alta'))::int        as high_quality,
           (count(*) filter (where stage = 'cerrado'))::int            as closed
    from scoped
    group by agent_id
  )
  select jsonb_build_object(
    'total',        (select count(*)::int from scoped),
    'active',       (select count(*)::int from scoped where stage in ('nuevo','nutricion')),
    'high_quality', (select count(*)::int from scoped where stage in ('nuevo','nutricion') and quality_band = 'alta'),
    'urgent_today', (select count(*)::int from scoped where urgency = 'hoy'),
    'imported',     (select count(*)::int from scoped where is_imported),
    -- Cuándo se CERRÓ, no cuándo entró. Las filas anteriores a la 082 guardan
    -- el vocabulario viejo, así que se aceptan los dos.
    'closed_this_month', (
      select count(distinct h.lead_id)::int
      from public.lead_status_history h
      where h.lead_id in (select id from scoped)
        and h.to_status in ('cerrado', 'closed', 'process_completed')
        and h.changed_at >= date_trunc('month', (now() at time zone 'utc')) at time zone 'utc'
    ),
    'by_stage', coalesce((select jsonb_object_agg(stage, c) from by_stage), '{}'::jsonb),
    'by_agent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'agent_id', agent_id, 'total', total,
        'high_quality', high_quality, 'closed', closed
      ))
      from by_agent
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.lead_dashboard_stats(text, text) from public, anon, authenticated;
grant execute on function public.lead_dashboard_stats(text, text) to service_role;

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
      l.agent_id, l.stage, l.quality_band, l.is_imported,
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
           count(*)::int            as total,
           round(avg(quality))::int as avg_quality
    from scoped
    group by channel_type, traffic_source
  ),
  by_agent as (
    select
      agent_id,
      count(*)::int                                          as total,
      (count(*) filter (where quality_band = 'alta'))::int    as high_quality,
      (count(*) filter (where stage = 'cerrado'))::int        as closed,
      round(avg(quality))::int                               as avg_quality
    from scoped
    group by agent_id
  ),
  agent_stages as (
    select agent_id, jsonb_object_agg(stage, c) as stages
    from (select agent_id, stage, count(*)::int as c from scoped group by agent_id, stage) s
    group by agent_id
  ),
  monthly as (
    select
      to_char(s.created_month, 'YYYY-MM')                          as month,
      count(*)::int                                                as leads,
      (count(*) filter (where s.stage = 'nuevo'))::int             as nuevo,
      (count(*) filter (where s.stage = 'nutricion'))::int         as nutricion,
      (count(*) filter (where s.stage = 'en_proceso'))::int        as en_proceso,
      (count(*) filter (where s.stage = 'cerrado'))::int           as cerrado,
      (count(*) filter (where s.stage = 'perdido'))::int           as perdido
    from scoped s, bounds b
    where s.created_month >= b.window_start
    group by s.created_month
  ),
  by_quality as (select quality_band, count(*)::int as c from scoped group by quality_band),
  by_stage   as (select stage, count(*)::int as c from scoped group by stage)
  select jsonb_build_object(
    'total',  (select count(*)::int from scoped),
    'closed', (select count(*)::int from scoped where stage = 'cerrado'),
    'active', (select count(*)::int from scoped where stage in ('nuevo','nutricion')),
    -- Denominador y numerador de la CONVERSIÓN: sólo lo captado por ITMANO.
    'attributed_total',  (select count(*)::int from scoped where not is_imported),
    'attributed_closed', (select count(*)::int from scoped where not is_imported and stage = 'cerrado'),
    'imported', (select count(*)::int from scoped where is_imported),
    'quality_distribution', coalesce((select jsonb_object_agg(quality_band, c) from by_quality where quality_band is not null), '{}'::jsonb),
    'by_stage', coalesce((select jsonb_object_agg(stage, c) from by_stage), '{}'::jsonb),
    'this_month', jsonb_build_object(
      'leads', (select count(*)::int from scoped s, bounds b where s.created_month = b.month_start),
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
        'high_quality', a.high_quality,
        'closed',    a.closed,
        'avg_quality', a.avg_quality,
        'stages',    coalesce(sg.stages, '{}'::jsonb)
      ))
      from by_agent a
      left join agent_stages sg on sg.agent_id = a.agent_id
    ), '[]'::jsonb),
    'monthly', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', month, 'leads', leads,
        'nuevo', nuevo, 'nutricion', nutricion,
        'en_proceso', en_proceso, 'cerrado', cerrado, 'perdido', perdido
      ))
      from monthly
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.lead_analytics_stats(text, text, int) from public, anon, authenticated;
grant execute on function public.lead_analytics_stats(text, text, int) to service_role;
