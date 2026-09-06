-- Migration 015: columns required by the sequence orchestrator
--
-- email_from_address on tenants: the "From:" address used when sending emails
-- for this tenant via Resend. Format: "Display Name <email@domain.com>".
-- NULL = not configured; the orchestrator pauses any run for unconfigured tenants.
--
-- resend_template_id on email_sequence_steps: the Resend template ID to render
-- when sending this step. Resend owns the email content; this is the pointer.
-- NULL = not configured; the orchestrator pauses the run for unconfigured steps.

alter table tenants
  add column if not exists email_from_address text;

update tenants
set    email_from_address = 'Adriana <adriana@mail.ajrealestateva.com>'
where  slug = 'aj-real-estate';

alter table email_sequence_steps
  add column if not exists resend_template_id text;
