-- Migration 039: extend lead_sequence_runs.cancelled_reason to include
-- the new email-blocking cancel reasons added in migration 038.
--
-- New values:
--   'hard_bounce'     — run cancelled because lead's email address hard-bounced
--   'spam_complaint'  — run cancelled because lead filed a spam complaint
--   'email_blocked'   — fallback when email_blocked_reason is unexpectedly null

ALTER TABLE lead_sequence_runs
  DROP CONSTRAINT lead_sequence_runs_cancelled_reason_check;

ALTER TABLE lead_sequence_runs
  ADD CONSTRAINT lead_sequence_runs_cancelled_reason_check
    CHECK (
      cancelled_reason IS NULL
      OR cancelled_reason = ANY (ARRAY[
        'unsubscribed'::text,
        'replied'::text,
        'lead_closed'::text,
        'manual'::text,
        'sequence_deleted'::text,
        'hard_bounce'::text,
        'spam_complaint'::text,
        'email_blocked'::text
      ])
    );
