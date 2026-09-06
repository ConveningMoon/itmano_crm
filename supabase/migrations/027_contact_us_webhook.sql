-- Migration 027: Contact Us webhook support
--
-- The Contact Us form lives on A&J's Webflow site, piped through Zapier. We give
-- it a dedicated CRM endpoint (/api/contact/[publicId]/submit) that creates a lead,
-- logs a high-intent 'contact_us_question' event, and notifies Telegram.
--
-- (1) Allow the 'contact_us' notification type (historical types kept so the
--     ALTER does not fail on existing rows).
-- (2) Seed the global scoring rule for 'contact_us_question' (+20 — leaving a
--     concrete question is a strong intent signal).
-- (3) Seed the dedicated Contact Us acquisition channel for the A&J tenant.

-- (1) Expand notifications type CHECK ───────────────────────────────────────────
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'score_threshold',        -- historical (no longer emitted)
    'contact_form_question',  -- intake contact-form question
    'lead_created',           -- historical (no longer emitted)
    'hot_lead',               -- lead crossed score >=80 (rising edge)
    'lead_deleted',           -- a lead was deleted
    'event_added',            -- an event channel was created
    'event_deleted',          -- an event channel was archived
    'lm_added',               -- a lead-magnet channel was created
    'lm_deleted',             -- a lead-magnet channel was archived
    'contact_us'              -- a Contact Us question came in from the website
  ]::text[]));

-- (2) Global scoring rule for the Contact Us question event ──────────────────────
INSERT INTO lead_score_rules (tenant_id, event_type, points)
VALUES (NULL, 'contact_us_question', 20)
ON CONFLICT (tenant_id, event_type) DO UPDATE SET points = EXCLUDED.points;

-- (3) Dedicated Contact Us channel for A&J ───────────────────────────────────────
-- public_id is the stable external key Zapier targets; id is left to default.
-- email_sequence_id stays NULL — Contact Us does not enroll in a sequence.
INSERT INTO acquisition_channels (tenant_id, public_id, channel_type, name, slug, active, email_sequence_id)
VALUES ('tenant-aj', 'chn_qv8uhxg9qizl', 'contact_form', 'Contact Us - Web', 'contact-us-web', true, NULL)
ON CONFLICT (public_id) DO NOTHING;
