-- Migration 026: final notification type set + rename score_threshold → hot_lead
--
-- (1) Expand the notifications type CHECK to the final set. Historical types
--     (score_threshold, lead_created) stay in the allowed list so the ALTER
--     does not fail on existing rows — they're simply no longer emitted.
-- (2) The scoring trigger's temperature notification is renamed from
--     'score_threshold' to 'hot_lead'. Threshold unchanged: rising-edge ≥80.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'score_threshold',        -- historical (no longer emitted; replaced by hot_lead)
    'contact_form_question',  -- intake contact-form question
    'lead_created',           -- historical (no longer emitted)
    'hot_lead',               -- lead crossed score ≥80 (rising edge)
    'lead_deleted',           -- a lead was deleted
    'event_added',            -- an event channel was created
    'event_deleted',          -- an event channel was archived
    'lm_added',               -- a lead-magnet channel was created
    'lm_deleted'              -- a lead-magnet channel was archived
  ]::text[]));

-- Recreate the scoring trigger function: only change is the notification type
-- string 'score_threshold' → 'hot_lead'. All scoring logic is identical.
CREATE OR REPLACE FUNCTION public.apply_lead_event_scoring()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

  -- Fire hot_lead notification on the ≥80 rising edge only
  if v_was_below_80 and v_new_score >= 80 then
    insert into notifications (tenant_id, type, lead_id, message)
    values (
      NEW.tenant_id,
      'hot_lead',
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
$function$;
