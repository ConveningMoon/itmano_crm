-- Migration 038: email_blocked flag on leads + hard-bounce run cancellation.
--
-- Adds email_blocked (bool) + email_blocked_reason (text) to leads so the
-- application layer has a persistent, queryable gate before every email send
-- and sequence enrollment.
--
-- The side_effect 'block_email' has existed in lead_score_rules since the
-- beginning but was never materialised in the schema. This migration
-- closes that gap WITHOUT touching the scoring engine (recompute_lead_score,
-- lead_events trigger, decay cron — all untouched).

-- ── 1. New columns ────────────────────────────────────────────────────────────

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS email_blocked        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_blocked_reason text;

ALTER TABLE leads
  ADD CONSTRAINT leads_email_blocked_reason_check
    CHECK (email_blocked_reason IN ('unsubscribed', 'hard_bounce', 'spam_complaint'));

-- ── 2. Backfill — leads that already have a blocking event ───────────────────
-- Priority: spam_complaint > hard_bounce > unsubscribed.
-- If a lead has multiple types, the most severe wins.

UPDATE leads l
SET
  email_blocked        = true,
  email_blocked_reason = (
    SELECT CASE
      WHEN EXISTS (
        SELECT 1 FROM lead_events
        WHERE lead_id = l.id AND type = 'email_spam_complaint'
      ) THEN 'spam_complaint'
      WHEN EXISTS (
        SELECT 1 FROM lead_events
        WHERE lead_id = l.id AND type = 'email_hard_bounce'
      ) THEN 'hard_bounce'
      ELSE 'unsubscribed'
    END
  )
WHERE EXISTS (
  SELECT 1 FROM lead_events le
  WHERE le.lead_id = l.id
    AND le.type IN ('email_unsubscribed', 'email_hard_bounce', 'email_spam_complaint')
);

-- ── 3. Extend cancel_runs_on_lead_event to include hard bounce ────────────────
-- Previously: email_unsubscribed + email_replied → cancelled runs.
-- Now also:   email_hard_bounce → cancelled (the address doesn't exist;
--             retrying would only hurt deliverability).
-- Scoring trigger is separate (trg_lead_event_scoring) and untouched.

CREATE OR REPLACE FUNCTION cancel_runs_on_lead_event()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_reason text;
BEGIN
  IF    NEW.type = 'email_unsubscribed' THEN v_reason := 'unsubscribed';
  ELSIF NEW.type = 'email_replied'      THEN v_reason := 'replied';
  ELSIF NEW.type = 'email_hard_bounce'  THEN v_reason := 'hard_bounce';
  ELSE  RETURN NEW;
  END IF;

  UPDATE lead_sequence_runs
  SET    status           = 'cancelled',
         cancelled_reason = v_reason,
         completed_at     = now()
  WHERE  lead_id = NEW.lead_id
    AND  status  = 'active';

  RETURN NEW;
END;
$$;
