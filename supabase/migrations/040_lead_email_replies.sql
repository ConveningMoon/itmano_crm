-- Migration 040: lead_email_replies table
-- Stores the full plain-text body of inbound emails (replies from leads).
-- Separate from email_sends (outbound) — these are inbound messages FROM the lead.
-- body_text is stored plain-text only; HTML is never persisted (XSS prevention).

CREATE TABLE IF NOT EXISTS lead_email_replies (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            text        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id              text        NOT NULL REFERENCES leads(id)   ON DELETE CASCADE,
  from_email           text        NOT NULL,
  subject              text,
  body_text            text,
  received_at          timestamptz NOT NULL,
  provider_message_id  text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Dedup: same provider_message_id for same lead must not insert twice
CREATE UNIQUE INDEX IF NOT EXISTS lead_email_replies_dedup
  ON lead_email_replies (lead_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS lead_email_replies_lead_id_idx
  ON lead_email_replies (lead_id, received_at DESC);

-- RLS — mirrors the lead_events / notifications pattern
ALTER TABLE lead_email_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_email_replies_select" ON lead_email_replies
  FOR SELECT
  USING (is_super_admin() OR tenant_id = get_my_tenant_id());

-- Writes are performed exclusively via createAdminClient() (service_role),
-- which bypasses RLS. No authenticated-user insert policy is intentional.
