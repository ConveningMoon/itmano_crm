-- Decouple email_sequences from acquisition_channels (many-to-one relationship).
--
-- The authoritative FK lives on acquisition_channels.email_sequence_id (a channel
-- optionally points to a sequence). The reverse FK (email_sequences.acquisition_channel_id)
-- is redundant and forces 1:1 coupling — sequences could not exist independently of a
-- channel, and two channels could not share the same sequence.
--
-- Changes:
--   email_sequences:
--     - DROP UNIQUE + FK on acquisition_channel_id, then DROP the column
--     - ADD language text NOT NULL DEFAULT 'es'
--     - ADD description text (nullable)
--
--   email_sequence_steps:
--     - DROP NOT NULL on subject and body_html (legacy compose-in-CRM columns;
--       orchestrator uses resend_template_id only)
--
--   lead_sequence_runs:
--     - Extend cancelled_reason CHECK to include 'sequence_deleted'
--     - Add index on sequence_id for analytics joins
--
-- Idempotent: each change is guarded by IF EXISTS / IF NOT EXISTS.

-- ── 1. email_sequences: drop reverse FK + column ─────────────────────────────

ALTER TABLE email_sequences
  DROP CONSTRAINT IF EXISTS email_sequences_acquisition_channel_id_key;

ALTER TABLE email_sequences
  DROP CONSTRAINT IF EXISTS email_sequences_acquisition_channel_id_fkey;

ALTER TABLE email_sequences
  DROP COLUMN IF EXISTS acquisition_channel_id;

ALTER TABLE email_sequences
  ADD COLUMN IF NOT EXISTS language    text NOT NULL DEFAULT 'es',
  ADD COLUMN IF NOT EXISTS description text;

-- ── 2. email_sequence_steps: drop NOT NULL on legacy columns ─────────────────

ALTER TABLE email_sequence_steps
  ALTER COLUMN subject   DROP NOT NULL;

ALTER TABLE email_sequence_steps
  ALTER COLUMN body_html DROP NOT NULL;

-- ── 3. lead_sequence_runs: extend cancelled_reason CHECK ─────────────────────

ALTER TABLE lead_sequence_runs
  DROP CONSTRAINT IF EXISTS lead_sequence_runs_cancelled_reason_check;

ALTER TABLE lead_sequence_runs
  ADD CONSTRAINT lead_sequence_runs_cancelled_reason_check
  CHECK (
    cancelled_reason IS NULL OR
    cancelled_reason = ANY (ARRAY[
      'unsubscribed', 'replied', 'lead_closed', 'manual', 'sequence_deleted'
    ])
  );

-- ── 4. lead_sequence_runs: index on sequence_id for analytics joins ───────────

CREATE INDEX IF NOT EXISTS idx_lead_sequence_runs_sequence_id
  ON lead_sequence_runs (sequence_id);
