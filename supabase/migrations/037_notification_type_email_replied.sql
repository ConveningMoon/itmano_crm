-- Add 'email_replied' to notifications.type allowed values.
-- Fired when a lead replies to a sequence email (inbound email.received from Resend).

ALTER TABLE notifications
  DROP CONSTRAINT notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type = ANY (ARRAY[
      'score_threshold'::text,
      'contact_form_question'::text,
      'lead_created'::text,
      'hot_lead'::text,
      'lead_deleted'::text,
      'event_added'::text,
      'event_deleted'::text,
      'lm_added'::text,
      'lm_deleted'::text,
      'contact_us'::text,
      'event_submission'::text,
      'email_replied'::text
    ])
  );
