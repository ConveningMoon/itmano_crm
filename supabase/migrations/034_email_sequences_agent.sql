-- Migration 034: email_sequences.agent_id — organizational link to an agent.
--
-- null = "Toda la agencia" (whole agency). This is an ORGANIZATIONAL/display label
-- only — the functional use (sender / signature per agent) is future work and this
-- column does NOT affect email sending (send-sequence-email is untouched).
-- ON DELETE SET NULL so removing an agent doesn't delete their sequences.

alter table email_sequences
  add column if not exists agent_id text references agents(id) on delete set null;

comment on column email_sequences.agent_id is
  'Organizational owner of the sequence (null = whole agency). Display-only for now; '
  'functional use (sender/signature) is future. Does NOT affect email sending.';
