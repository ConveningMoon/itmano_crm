-- ─── Purchase process email templates ────────────────────────────────────────
-- One row per (tenant, milestone, language). Editable from the /emails UI.
-- resend_template_id is the Resend template UUID to use for that combination.

create table purchase_email_templates (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           text        not null references tenants(id) on delete cascade,
  milestone           text        not null check (milestone in ('start', 'pre_close', 'completed')),
  language            text        not null check (language   in ('es', 'en', 'pt')),
  resend_template_id  text        not null default '',
  updated_at          timestamptz not null default now(),
  unique (tenant_id, milestone, language)
);

create index idx_purchase_email_templates_tenant on purchase_email_templates(tenant_id);

-- RLS: tenants can read their own rows; writes go via service_role (admin client)
-- so no insert/update policies are needed for anon/authenticated callers.
alter table purchase_email_templates enable row level security;

create policy "pet_select"
  on purchase_email_templates for select
  using (is_super_admin() or tenant_id = get_my_tenant_id());

-- ─── Idempotency flags on purchase_processes ──────────────────────────────────
-- One boolean per lifecycle email. Set to true after a successful (or skipped)
-- send so the orchestrator never fires the same email twice.

alter table purchase_processes
  add column if not exists email_start_sent     boolean not null default false,
  add column if not exists email_preclose_sent  boolean not null default false,
  add column if not exists email_completed_sent boolean not null default false;

-- ─── Seed: A&J Real Estate Group — 9 placeholder rows ────────────────────────
-- Replace the resend_template_id values from the /emails → "Emails de cierre"
-- UI (or directly via SQL) before going live.

insert into purchase_email_templates (tenant_id, milestone, language, resend_template_id)
values
  ('tenant-aj', 'start',     'es', 'REPLACE_ME_start_es'),
  ('tenant-aj', 'start',     'en', 'REPLACE_ME_start_en'),
  ('tenant-aj', 'start',     'pt', 'REPLACE_ME_start_pt'),
  ('tenant-aj', 'pre_close', 'es', 'REPLACE_ME_pre_close_es'),
  ('tenant-aj', 'pre_close', 'en', 'REPLACE_ME_pre_close_en'),
  ('tenant-aj', 'pre_close', 'pt', 'REPLACE_ME_pre_close_pt'),
  ('tenant-aj', 'completed', 'es', 'REPLACE_ME_completed_es'),
  ('tenant-aj', 'completed', 'en', 'REPLACE_ME_completed_en'),
  ('tenant-aj', 'completed', 'pt', 'REPLACE_ME_completed_pt')
on conflict (tenant_id, milestone, language) do nothing;
