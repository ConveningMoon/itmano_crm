-- Migration 024: add activation_type to email_sequences
--
-- 'form'   → sequence auto-enrolls leads when they submit a linked acquisition channel form.
-- 'manual' → sequence is enrollment-only; a super_admin or agent adds leads explicitly.
--            enrollLeadInSequence skips any sequence with activation_type = 'manual'.

ALTER TABLE email_sequences
  ADD COLUMN IF NOT EXISTS activation_type text NOT NULL DEFAULT 'form'
  CONSTRAINT email_sequences_activation_type_check
    CHECK (activation_type IN ('form', 'manual'));

COMMENT ON COLUMN email_sequences.activation_type IS
  'form = auto-enrolled on channel form submit; manual = explicit enrollment only';
