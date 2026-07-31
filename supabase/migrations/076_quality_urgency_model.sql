-- 076 — Modelo calidad + urgencia (Fase A).
--
-- Spec: docs/superpowers/specs/2026-07-31-calidad-urgencia-design.md
--
-- Separa el score en dos ejes con semántica propia:
--   CALIDAD  — evidencia acumulada de que el lead puede y quiere transaccionar.
--              NO decae. Un comprador con efectivo de hace tres meses sigue
--              teniendo efectivo.
--   URGENCIA — cuán reciente es la última señal accionable. Decae, y NO se
--              almacena: se deriva al leer. Por eso el cron de decay deja de ser
--              necesario para este eje.
--
-- ADITIVA: no toca `status`, ni `current_score`, ni el congelado. Todo lo viejo
-- sigue funcionando igual mientras la UI migra.

-- ── 1) Columnas nuevas ───────────────────────────────────────────────────────
-- quality_score:    fit + manual + engagement SIN decaimiento, acotado 0..100.
-- last_signal_at:   momento de la última señal POSITIVA (no cualquier evento:
--                   un email_delivered no hace urgente a un lead).
-- last_signal_type: qué señal fue — distingue "respondió" (actúa hoy) de
--                   "hizo clic" (esta semana).
alter table leads add column if not exists quality_score    integer;
alter table leads add column if not exists last_signal_at   timestamptz;
alter table leads add column if not exists last_signal_type text;

-- Orden por prioridad y cálculo de posición dentro de la cartera activa.
create index if not exists idx_leads_tenant_quality
  on leads (tenant_id, quality_score desc, id desc);

create index if not exists idx_leads_tenant_signal
  on leads (tenant_id, last_signal_at desc);

-- ── 2) recompute_lead_score — añade calidad y última señal ───────────────────
-- Cambio respecto de la versión anterior: el bloque de CALIDAD se calcula ANTES
-- del retorno por congelado, así que un lead cerrado también tiene calidad. Es
-- deliberado: el congelado protege la decisión del AGENTE sobre `status`, no es
-- una razón para dejar de medir al lead. Sin esto, "calidad media por fuente" en
-- analytics ignoraría justo los leads que cerraron, que son los que más importan.
--
-- El resto de la función es idéntico al comportamiento actual.
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
  v_new_status    text;
  v_force_perdido boolean;
  v_last_event    timestamptz;
  v_sig_at        timestamptz;
  v_sig_type      text;
begin
  select * into v_lead from leads where id = p_lead_id;
  if not found then return; end if;

  -- FIT — una vez por dimensión; un override del tenant gana sobre el global.
  select coalesce(sum(points), 0) into v_fit
  from (
    select distinct on (r.dimension) r.points
    from   lead_score_rules r
    where  r.category = 'fit' and r.is_active
      and  (r.tenant_id = v_lead.tenant_id or r.tenant_id is null)
      and  v_lead.fit_profile ->> r.dimension = r.match_value
    order  by r.dimension, r.tenant_id nulls last
  ) f;

  -- MANUAL — acciones del agente, sin decaimiento.
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

  -- ENGAGEMENT SIN DECAIMIENTO — para la calidad. Haber hecho clic es un hecho
  -- que ocurrió; no se deshace con el tiempo. Lo que envejece es la oportunidad
  -- de responder, y eso lo mide la urgencia.
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

  -- Última señal POSITIVA — la que alimenta la urgencia al leer.
  select e.created_at, e.type into v_sig_at, v_sig_type
  from   lead_events e
  join   lead_score_rules r
         on  r.dimension = e.type and r.is_active and r.points > 0
         and r.category in ('engagement', 'manual')
         and (r.tenant_id = e.tenant_id or r.tenant_id is null)
  where  e.lead_id = p_lead_id
  order  by e.created_at desc
  limit  1;

  -- La calidad se guarda SIEMPRE, incluso en estados congelados.
  update leads
  set    quality_score    = v_quality,
         last_signal_at   = v_sig_at,
         last_signal_type = v_sig_type
  where  id = p_lead_id;

  -- ── A partir de aquí, comportamiento idéntico al anterior ──────────────────
  -- Congelado: los estados post-embudo no recalculan score ni estado.
  if v_lead.status in ('process_started','process_completed','closed','lost') then
    return;
  end if;

  v_old_current := coalesce(v_lead.current_score, 0);

  -- ENGAGEMENT CON DECAIMIENTO — sigue alimentando current_score, que se
  -- mantiene intacto durante la Fase A para no romper nada que aún lo lea.
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

  if v_force_perdido then
    v_total      := 0;
    v_new_status := 'lost';
  else
    v_total := greatest(0, least(100, v_fit + v_eng + v_man));
    v_new_status := case
      when v_total >= 60 then 'hot'
      when v_total >= 35 then 'warm'
      when v_total >= 15 then 'nurturing'
      else                    'new'
    end;
  end if;

  select max(created_at) into v_last_event from lead_events where lead_id = p_lead_id;

  perform set_config('app.history_source', 'trigger', true);

  update leads
  set    fit_score        = v_fit,
         engagement_score = v_eng,
         manual_score     = v_man,
         current_score    = v_total,
         peak_score       = greatest(coalesce(peak_score, 0), v_total),
         status           = v_new_status,
         last_event_at    = coalesce(v_last_event, last_event_at),
         score_updated_at = now()
  where  id = p_lead_id;

  if v_old_current < 80 and v_total >= 80 and not v_force_perdido then
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

-- ── 3) Cortes de banda por tenant ────────────────────────────────────────────
-- Las cinco bandas (alta / media_alta / media / media_baja / baja) son QUINTILES
-- de la cartera ACTIVA del tenant, no umbrales fijos. "Alta" significa el 20%
-- mejor de lo que ese equipo tiene ahora mismo — una afirmación comparativa, que
-- es exactamente la decisión del agente con tiempo para diez llamadas y cuarenta
-- leads. Así los cortes dejan de ser números inventados.
--
-- Se materializan en una tabla y se refrescan 1×/día para que la etiqueta no
-- baile dentro de la misma jornada al entrar leads nuevos.
create table if not exists tenant_quality_bands (
  tenant_id    text primary key references tenants(id) on delete cascade,
  p20          integer not null,
  p40          integer not null,
  p60          integer not null,
  p80          integer not null,
  active_leads integer not null,
  computed_at  timestamptz not null default now()
);

alter table tenant_quality_bands enable row level security;

-- Solo lectura y acotada al tenant. La escribe refresh_quality_bands (definer).
drop policy if exists "tenant_quality_bands_select" on tenant_quality_bands;
create policy "tenant_quality_bands_select" on tenant_quality_bands
  for select using (is_super_admin() or tenant_id = get_my_tenant_id());

-- Por debajo de este número de leads activos un quintil no significa nada y se
-- usan cortes fijos (que además espejan las bandas históricas 15/35/60).
create or replace function public.refresh_quality_bands()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
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
    -- Solo cartera VIVA: cerrar un buen lead no debe degradar a los demás.
    where  l.status not in ('process_started','process_completed','closed','lost')
  ) t
  group by t.tenant_id
  on conflict (tenant_id) do update
  set p20 = excluded.p20, p40 = excluded.p40, p60 = excluded.p60,
      p80 = excluded.p80, active_leads = excluded.active_leads,
      computed_at = excluded.computed_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.refresh_quality_bands() from public, anon, authenticated;
grant execute on function public.refresh_quality_bands() to service_role;

-- ── 4) Backfill ──────────────────────────────────────────────────────────────
-- Los leads existentes nunca pasaron por la nueva rama del trigger.
do $$
declare r record;
begin
  for r in select id from leads loop
    perform recompute_lead_score(r.id);
  end loop;
end $$;

select refresh_quality_bands();

-- ── 5) Vista de listado — los tres ejes derivados ────────────────────────────
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

  -- URGENCIA — derivada al leer, nunca almacenada. Manda el briefing de IA si
  -- existe; si no, una regla determinista sobre la última señal positiva, para
  -- que el orden funcione igual con la IA apagada o sin presupuesto.
  case
    when l.status in ('process_started','process_completed','closed','lost') then null
    when l.metadata #>> '{ai_fit,next_action_when}' = 'hoy'         then 'hoy'
    when l.metadata #>> '{ai_fit,next_action_when}' = 'esta_semana' then 'esta_semana'
    when l.metadata #>> '{ai_fit,next_action_when}' = 'sin_apuro'   then 'sin_apuro'
    when l.last_signal_at > now() - interval '48 hours'
     and l.last_signal_type in ('email_replied','contact_us_question') then 'hoy'
    when l.last_signal_at > now() - interval '7 days'                then 'esta_semana'
    else 'sin_apuro'
  end as urgency,

  -- Rango numérico de la urgencia, para ordenar sin repetir el CASE.
  case
    when l.status in ('process_started','process_completed','closed','lost') then 9
    when l.metadata #>> '{ai_fit,next_action_when}' = 'hoy'         then 0
    when l.metadata #>> '{ai_fit,next_action_when}' = 'esta_semana' then 1
    when l.metadata #>> '{ai_fit,next_action_when}' = 'sin_apuro'   then 2
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
left join public.tenant_quality_bands b on b.tenant_id = l.tenant_id;

revoke all on public.leads_list from anon;
grant select on public.leads_list to authenticated, service_role;
