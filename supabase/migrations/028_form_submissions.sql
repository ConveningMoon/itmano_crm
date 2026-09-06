-- Migration 028: form_submissions — self-contained Q&A snapshot per form submit.
--
-- No form-schema table. The form sends a readable snapshot (answers jsonb array);
-- the CRM stores it verbatim for per-submission display. lead_events remains the
-- activity log + scoring source; form_submissions is the structured display record.
-- See CLAUDE.md → "form_submissions.answers contract".
--
-- NOTE: lead_id is TEXT (not uuid) because leads.id is text — an FK requires
-- matching column types. channel_id is uuid (acquisition_channels.id is uuid).

create table form_submissions (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    text        not null references tenants(id),
  channel_id   uuid        not null references acquisition_channels(id) on delete cascade,
  lead_id      text        not null references leads(id) on delete cascade,
  answers      jsonb       not null default '[]'::jsonb,
  responded    boolean     not null default false,
  responded_at timestamptz,
  submitted_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index idx_form_submissions_channel on form_submissions(channel_id);
create index idx_form_submissions_lead    on form_submissions(lead_id);
create index idx_form_submissions_tenant  on form_submissions(tenant_id, submitted_at desc);

-- ─── RLS — tenant isolation, super_admin bypass (same pattern as other tables) ──
alter table form_submissions enable row level security;

create policy "form_submissions_select" on form_submissions
  for select using (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "form_submissions_insert" on form_submissions
  for insert with check (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "form_submissions_update" on form_submissions
  for update using (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "form_submissions_delete" on form_submissions
  for delete using (is_super_admin() or tenant_id = get_my_tenant_id());

-- ─── notifications type CHECK — add 'event_submission' ─────────────────────────
-- Historical/current types kept so the ALTER does not fail on existing rows.
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type = any (array[
    'score_threshold',
    'contact_form_question',
    'lead_created',
    'hot_lead',
    'lead_deleted',
    'event_added',
    'event_deleted',
    'lm_added',
    'lm_deleted',
    'contact_us',
    'event_submission'
  ]::text[]));

-- Test-data cleanup (the "Guía para Familias Hispanas" sample leads) is performed
-- as a separate one-time controlled step against prod, not in this migration, so
-- this file stays schema-only and reproducible on a fresh database.
