-- Migration 029: scoring engine rewrite — three-component model.
--
-- total = clamp(0,100, fit + engagement_decayed + manual)
--   fit         — trait-based, recomputed from leads.fit_profile (latest-wins, no decay)
--   engagement  — events, accumulate; POSITIVE engagement decays by per-event age,
--                 NEGATIVE engagement persists at full value (a dead email doesn't heal)
--   manual      — events, accumulate, no decay
-- Status bands + hot_lead rising-edge ≥80 + freeze are PRESERVED exactly.
-- recompute_lead_score is the single source of truth; the lead_events trigger and
-- the decay cron both call it.

-- ── 1) Extend lead_score_rules ────────────────────────────────────────────────
alter table lead_score_rules alter column event_type drop not null;
alter table lead_score_rules add column if not exists category   text;
alter table lead_score_rules add column if not exists dimension  text;
alter table lead_score_rules add column if not exists match_value text;
alter table lead_score_rules add column if not exists decays     boolean not null default false;
alter table lead_score_rules add column if not exists is_active  boolean not null default true;
alter table lead_score_rules add column if not exists label      text;

-- Re-seed from scratch (old rules were global and mostly never materialized).
delete from lead_score_rules;

alter table lead_score_rules add constraint lead_score_rules_category_check
  check (category in ('fit','engagement','manual'));
alter table lead_score_rules alter column category  set not null;
alter table lead_score_rules alter column dimension set not null;

-- Replace the old unique (tenant_id, event_type) with the new key.
alter table lead_score_rules drop constraint if exists lead_score_rules_uq;
create unique index lead_score_rules_uq
  on lead_score_rules (tenant_id, category, dimension, coalesce(match_value, ''))
  nulls not distinct;

-- ── 2) leads: fit profile + cached sub-scores ─────────────────────────────────
alter table leads add column if not exists fit_profile      jsonb not null default '{}'::jsonb;
alter table leads add column if not exists fit_score        integer;
alter table leads add column if not exists engagement_score integer;
alter table leads add column if not exists manual_score     integer;

-- ── 3) Seed (global rules, tenant_id null) ────────────────────────────────────
-- FIT (decays=false; match_value set; event_type null)
insert into lead_score_rules (tenant_id, category, dimension, match_value, points, decays, is_active, label) values
  (null,'fit','timeline','under_3_months',30,false,true,'Compra en <3 meses'),
  (null,'fit','timeline','3_6_months',15,false,true,'Compra en 3–6 meses'),
  (null,'fit','timeline','6_12_months',5,false,true,'Compra en 6–12 meses'),
  (null,'fit','timeline','over_12_explorando',0,false,true,'Explorando (>12 meses)'),
  (null,'fit','financing','cash',25,false,true,'Pago en efectivo'),
  (null,'fit','financing','preapproved',20,false,true,'Pre-aprobado'),
  (null,'fit','financing','in_process',10,false,true,'Financiamiento en proceso'),
  (null,'fit','financing','not_started',0,false,true,'Sin iniciar financiamiento'),
  (null,'fit','budget_tier','premium',20,false,true,'Presupuesto premium'),
  (null,'fit','budget_tier','mid',12,false,true,'Presupuesto medio'),
  (null,'fit','budget_tier','entry',5,false,true,'Presupuesto de entrada'),
  (null,'fit','budget_tier','undefined',0,false,true,'Presupuesto sin definir'),
  (null,'fit','agent_status','sin_agente',5,false,true,'Sin agente'),
  (null,'fit','agent_status','con_agente',-15,false,true,'Ya tiene agente'),
  (null,'fit','sell_motivation','alta',35,false,true,'Motivación de venta alta'),
  (null,'fit','sell_motivation','media',15,false,true,'Motivación de venta media'),
  (null,'fit','sell_motivation','baja',0,false,true,'Motivación de venta baja'),
  (null,'fit','listing_status','no_listado_sin_agente',5,false,true,'No listado, sin agente'),
  (null,'fit','listing_status','ya_listado_con_agente',-15,false,true,'Ya listado con agente');

-- ENGAGEMENT (match_value null; event_type = dimension). Positive → decays=true.
insert into lead_score_rules (tenant_id, category, dimension, event_type, points, decays, is_active, side_effect, label) values
  (null,'engagement','form_baseline','form_baseline',10,true,true,null,'Formulario enviado'),
  (null,'engagement','second_lm','second_lm',8,true,true,null,'2º lead magnet'),
  (null,'engagement','third_lm','third_lm',12,true,true,null,'3º+ lead magnet'),
  (null,'engagement','contact_us_question','contact_us_question',20,true,true,null,'Pregunta de contacto'),
  (null,'engagement','email_clicked','email_clicked',10,true,true,null,'Click en email'),
  (null,'engagement','email_replied','email_replied',20,true,true,null,'Respuesta a email'),
  (null,'engagement','email_hard_bounce','email_hard_bounce',-30,false,true,'mark_email_invalid','Hard bounce'),
  (null,'engagement','email_unsubscribed','email_unsubscribed',-40,false,true,'block_email','Desuscripción'),
  (null,'engagement','email_spam_complaint','email_spam_complaint',-100,false,true,'force_perdido','Queja de spam');

-- MANUAL (match_value null; decays=false; event_type = dimension)
insert into lead_score_rules (tenant_id, category, dimension, event_type, points, decays, is_active, side_effect, label) values
  (null,'manual','appointment_scheduled','appointment_scheduled',15,false,true,null,'Cita agendada'),
  (null,'manual','visit_attended','visit_attended',25,false,true,null,'Visita atendida'),
  (null,'manual','proposal_sent','proposal_sent',20,false,true,null,'Propuesta enviada'),
  (null,'manual','no_show_no_answer','no_show_no_answer',-10,false,true,null,'No-show / sin respuesta'),
  (null,'manual','manual_disqualify','manual_disqualify',0,false,true,'force_perdido','Descalificación manual');

-- ── 4) recompute_lead_score — single source of truth ──────────────────────────
create or replace function public.recompute_lead_score(p_lead_id text)
returns void
language plpgsql
security definer
as $function$
declare
  v_lead          leads%rowtype;
  v_fit           integer;
  v_eng           integer;
  v_man           integer;
  v_total         integer;
  v_old_current   integer;
  v_new_status    text;
  v_force_perdido boolean;
  v_last_event    timestamptz;
begin
  select * into v_lead from leads where id = p_lead_id;
  if not found then return; end if;

  -- Respect freeze: post-funnel / agent-driven statuses never recompute.
  if v_lead.status in ('process_started','process_completed','closed','lost') then
    return;
  end if;

  v_old_current := coalesce(v_lead.current_score, 0);

  -- FIT — sum active fit rules matching each (dimension,value) in fit_profile.
  -- distinct on (dimension) lets a tenant-specific rule override the global one.
  select coalesce(sum(points), 0) into v_fit
  from (
    select distinct on (r.dimension) r.points
    from   lead_score_rules r
    where  r.category = 'fit' and r.is_active
      and  (r.tenant_id = v_lead.tenant_id or r.tenant_id is null)
      and  v_lead.fit_profile ->> r.dimension = r.match_value
    order  by r.dimension, r.tenant_id nulls last
  ) f;

  -- ENGAGEMENT — per event. Positive (decays) decays by the event's own age
  -- (half-life 0.5^((days-14)/30) after a 14-day grace); negative persists full.
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

  -- MANUAL — per event, no decay.
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

  -- force_perdido (spam complaint, manual disqualify) → 0 / lost.
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

  -- Tag the status-history trigger as system/trigger-sourced.
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

  -- hot_lead notification — rising edge crossing ≥80 (preserved exactly).
  if v_old_current < 80 and v_total >= 80 and not v_force_perdido then
    insert into notifications (tenant_id, type, lead_id, message)
    values (v_lead.tenant_id, 'hot_lead', p_lead_id,
            v_lead.first_name || ' ' || v_lead.last_name || ' alcanzó score ' || v_total);
  end if;
end;
$function$;

-- recalc_lead_score is kept as a thin alias delegating to recompute_lead_score,
-- so the single source of truth is recompute (no duplicated logic).
create or replace function public.recalc_lead_score(p_lead_id text)
returns void
language plpgsql
security definer
as $function$
begin
  perform recompute_lead_score(p_lead_id);
end;
$function$;

-- ── 5) lead_events trigger body → recompute ───────────────────────────────────
create or replace function public.apply_lead_event_scoring()
returns trigger
language plpgsql
security definer
as $function$
begin
  perform recompute_lead_score(NEW.lead_id);
  return NEW;
end;
$function$;

-- ── 6) decay cron → recompute per inactive lead ───────────────────────────────
create or replace function public.decay_lead_scores(p_dry_run boolean default false)
returns table(affected_lead_id text, lead_tenant_id text, old_score integer, new_score integer, old_status text, new_status text, status_changed boolean)
language plpgsql
security definer
as $function$
declare
  r leads%rowtype;
begin
  for r in
    select * from leads
    where  status not in ('process_started','process_completed','closed','lost')
      and  last_event_at is not null
      and  last_event_at < now() - interval '14 days'
    order  by last_event_at asc
  loop
    affected_lead_id := r.id;
    lead_tenant_id   := r.tenant_id;
    old_score        := coalesce(r.current_score, 0);
    old_status       := r.status;
    if p_dry_run then
      new_score := old_score; new_status := old_status; status_changed := false;
    else
      perform recompute_lead_score(r.id);
      select current_score, status into new_score, new_status from leads where id = r.id;
      status_changed := new_status is distinct from old_status;
    end if;
    return next;
  end loop;
end;
$function$;
