-- Migration 012: fix lead_status_history never being written
--
-- Root cause: lead_status_history had only ONE write path — the explicit INSERT
-- inside apply_lead_event_scoring(), which fires on lead_events INSERT. But the
-- three Server Actions that change leads.status all do so via direct
-- UPDATE leads SET status = ... first, then optionally insert a 'status_changed'
-- event as an audit note. 'status_changed' has no entry in lead_score_rules, so
-- the scoring trigger takes the early-return path and never reaches the history
-- INSERT. Result: every agent-driven status change was invisible to history.
--
-- Fix:
--   1. New trigger function record_lead_status_history() + trigger on leads AFTER
--      UPDATE OF status — captures ALL status transitions regardless of origin.
--   2. Scoring trigger signals 'trigger' source via session variable
--      app.history_source (SET LOCAL, resets per transaction); agent-driven
--      updates produce source = 'agent' because the variable is unset.
--   3. Remove the now-redundant explicit history INSERT from
--      apply_lead_event_scoring() — the leads trigger handles it, so keeping
--      both would produce duplicate rows.

-- ─── 1. New trigger: record every leads.status change ────────────────────────

create or replace function record_lead_status_history()
returns trigger language plpgsql security definer as $$
declare
  v_source text;
begin
  -- apply_lead_event_scoring() sets app.history_source = 'trigger' (SET LOCAL)
  -- before its UPDATE leads. Direct app updates leave the variable unset → 'agent'.
  v_source := coalesce(nullif(current_setting('app.history_source', true), ''), 'agent');

  insert into lead_status_history (lead_id, tenant_id, from_status, to_status, source)
  values (NEW.id, NEW.tenant_id, OLD.status, NEW.status, v_source);

  return NEW;
end;
$$;

drop trigger if exists trg_lead_status_history on leads;

create trigger trg_lead_status_history
  after update of status on leads
  for each row
  when (OLD.status is distinct from NEW.status)
  execute function record_lead_status_history();

-- ─── 2. Update apply_lead_event_scoring() ─────────────────────────────────────
-- Changes vs migration 010:
--   a) PERFORM set_config('app.history_source', 'trigger', true) before the
--      UPDATE leads — so the leads trigger above records source = 'trigger'.
--   b) Removed the explicit `if v_new_status <> v_old_status then insert into
--      lead_status_history` block — now handled by trg_lead_status_history.

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
  order  by tenant_id nulls last
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

  -- Signal to record_lead_status_history() that this update came from the
  -- scoring trigger (SET LOCAL — resets automatically at end of transaction).
  perform set_config('app.history_source', 'trigger', true);

  -- Update lead — triggers trg_lead_status_history if status changed
  update leads
  set  peak_score       = v_new_score,
       current_score    = v_new_score,
       last_event_at    = coalesce(NEW.created_at, now()),
       score_updated_at = now(),
       status           = v_new_status
  where id = NEW.lead_id;

  -- Fire ≥80 notification on rising edge only
  if v_was_below_80 and v_new_score >= 80 then
    insert into notifications (tenant_id, type, lead_id, message)
    values (
      NEW.tenant_id,
      'score_threshold',
      NEW.lead_id,
      v_lead.first_name || ' ' || v_lead.last_name || ' alcanzó score ' || v_new_score
    );
  end if;

  -- Apply pause_sequences side effect
  if v_rule.side_effect = 'pause_sequences' then
    update lead_sequence_runs
    set    status = 'paused'
    where  lead_id = NEW.lead_id
      and  status  = 'active';
  end if;

  return NEW;
end;
$$;
