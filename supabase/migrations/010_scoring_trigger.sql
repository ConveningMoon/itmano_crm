-- Migration 010: scoring trigger + bug-fix for migration 006
--
-- Bug fix: migration 006 used Spanish status values in cancel_runs_on_lead_status_change()
-- (en_proceso, proceso_completado, cerrado, perdido) but the leads.status check constraint
-- only accepts English values (process_started, process_completed, closed, lost).
-- The trigger existed but never fired. Fixed here.
--
-- New in this migration:
--   - BEFORE INSERT dedup guard on lead_events
--   - AFTER INSERT scoring trigger on lead_events
--   - recalc_lead_score(lead_id) for debugging / manual fixes

-- ─── Fix migration 006 status values ─────────────────────────────────────────

create or replace function cancel_runs_on_lead_status_change()
returns trigger language plpgsql as $$
begin
  if NEW.status in ('process_started', 'process_completed', 'closed', 'lost')
     and OLD.status is distinct from NEW.status then
    update lead_sequence_runs
    set    status           = 'cancelled',
           cancelled_reason = 'lead_closed',
           completed_at     = now()
    where  lead_id = NEW.id
      and  status  = 'active';
  end if;
  return NEW;
end;
$$;

-- ─── BEFORE INSERT: dedup guard ───────────────────────────────────────────────
-- Raises a clear error instead of letting the unique index produce a generic
-- constraint violation message. Only fires when dedup_key is supplied.

create or replace function guard_lead_event_dedup()
returns trigger language plpgsql as $$
begin
  if NEW.dedup_key is not null then
    if exists (
      select 1 from lead_events
      where  lead_id  = NEW.lead_id
        and  dedup_key = NEW.dedup_key
    ) then
      raise exception 'duplicate lead_event: lead_id=% dedup_key=%', NEW.lead_id, NEW.dedup_key
        using errcode = 'unique_violation';
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_lead_event_dedup
  before insert on lead_events
  for each row execute function guard_lead_event_dedup();

-- ─── AFTER INSERT: scoring trigger ───────────────────────────────────────────

create or replace function apply_lead_event_scoring()
returns trigger language plpgsql security definer as $$
declare
  v_lead          leads%rowtype;
  v_rule          lead_score_rules%rowtype;
  v_base_score    integer;
  v_new_score     integer;
  v_old_status    text;
  v_new_status    text;
  v_was_below_80  boolean;
begin
  -- Load current lead state
  select * into v_lead from leads where id = NEW.lead_id;
  if not found then return NEW; end if;

  -- Skip scoring for post-funnel (frozen) leads
  if v_lead.status in ('process_started', 'process_completed', 'closed', 'lost') then
    return NEW;
  end if;

  -- Look up the scoring rule — tenant-specific wins over global (tenant_id IS NULL)
  select * into v_rule
  from   lead_score_rules
  where  event_type = NEW.type
    and  (tenant_id = NEW.tenant_id or tenant_id is null)
  order  by tenant_id nulls last   -- non-null tenant first
  limit  1;

  -- Always update the engagement timestamp even if no rule matched
  if not found then
    update leads
    set  last_event_at    = coalesce(NEW.created_at, now()),
         score_updated_at  = now()
    where id = NEW.lead_id;
    return NEW;
  end if;

  -- Compute new score (capped 0–100)
  v_base_score := coalesce(v_lead.peak_score, v_lead.temperature_score, 0);
  v_new_score  := greatest(0, least(100, v_base_score + v_rule.points));

  -- Capture whether we are crossing the ≥80 rising edge
  v_was_below_80 := coalesce(v_lead.current_score, 0) < 80;

  -- Determine target status band
  v_old_status := v_lead.status;
  v_new_status := case
    when v_new_score >= 60 then 'hot'
    when v_new_score >= 35 then 'warm'
    when v_new_score >= 15 then 'nurturing'
    else 'new'
  end;

  -- Apply force_perdido side effect before updating status band
  if v_rule.side_effect = 'force_perdido' then
    v_new_status := 'lost';
  end if;

  -- Update lead
  update leads
  set  peak_score       = v_new_score,
       current_score    = v_new_score,
       last_event_at    = coalesce(NEW.created_at, now()),
       score_updated_at = now(),
       status           = v_new_status
  where id = NEW.lead_id;

  -- Write status history if the band changed
  if v_new_status <> v_old_status then
    insert into lead_status_history (lead_id, tenant_id, from_status, to_status, source)
    values (NEW.lead_id, NEW.tenant_id, v_old_status, v_new_status, 'trigger');
  end if;

  -- Fire ≥80 notification on rising edge only (avoid spam on repeated events)
  if v_was_below_80 and v_new_score >= 80 then
    insert into notifications (tenant_id, type, lead_id, message)
    values (
      NEW.tenant_id,
      'score_threshold',
      NEW.lead_id,
      v_lead.first_name || ' ' || v_lead.last_name || ' alcanzó score ' || v_new_score
    );
  end if;

  -- Apply pause_sequences side effect (distinct from cancel — preserves state for resume)
  if v_rule.side_effect = 'pause_sequences' then
    update lead_sequence_runs
    set    status = 'paused'
    where  lead_id = NEW.lead_id
      and  status  = 'active';
  end if;

  return NEW;
end;
$$;

create trigger trg_lead_event_scoring
  after insert on lead_events
  for each row execute function apply_lead_event_scoring();

-- ─── recalc_lead_score(lead_id) ──────────────────────────────────────────────
-- Utility for debugging and manual fixes: reapplies the decay formula to
-- produce current_score from peak_score and last_event_at.
-- Does NOT reprocess event history — use for decay recomputation only.

create or replace function recalc_lead_score(p_lead_id text)
returns void language plpgsql security definer as $$
declare
  v_lead          leads%rowtype;
  v_days_since    float;
  v_current_score integer;
begin
  select * into v_lead from leads where id = p_lead_id;
  if not found then return; end if;
  if v_lead.peak_score is null or v_lead.last_event_at is null then return; end if;

  v_days_since := extract(epoch from (now() - v_lead.last_event_at)) / 86400.0;

  if v_days_since <= 14 then
    v_current_score := v_lead.peak_score;
  else
    -- Half-life decay: halves every 30 days after the 14-day grace period
    v_current_score := greatest(
      0,
      round(v_lead.peak_score::numeric * power(0.5, (v_days_since - 14.0) / 30.0))::integer
    );
  end if;

  update leads
  set  current_score    = v_current_score,
       score_updated_at  = now()
  where id = p_lead_id;
end;
$$;
