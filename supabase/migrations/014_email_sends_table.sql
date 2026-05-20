-- Migration 014: email_sends table
--
-- Stores one row per outbound email we send via Resend. The webhook receiver
-- (src/app/api/webhooks/resend/route.ts) joins on resend_email_id to resolve
-- which lead a Resend event belongs to — without this table, the webhook has
-- no way to map a Resend email_id back to a CRM lead_id.
--
-- Populated by: the sequence orchestrator cron (Phase 3 PR 3) after calling
-- resend.emails.send() and storing the returned id.
-- Read by: the webhook receiver (this PR) and future analytics queries.

-- ─── Table ───────────────────────────────────────────────────────────────────

create table if not exists email_sends (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           text        not null references tenants(id),
  lead_id             text        not null references leads(id) on delete cascade,
  sequence_run_id     uuid        references lead_sequence_runs(id) on delete set null,
  step_order          integer,
  resend_email_id     text        not null,
  resend_template_id  text,
  sent_at             timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  constraint email_sends_resend_email_id_uq unique (resend_email_id)
);

-- ─── Indices ─────────────────────────────────────────────────────────────────

-- Webhook hot path: lookup by resend_email_id (covered by the unique constraint
-- above, but naming it explicitly for clarity in EXPLAIN output).

create index if not exists idx_email_sends_lead_id
  on email_sends(lead_id);

-- Partial index: most rows have a sequence_run_id; skip the NULLs.
create index if not exists idx_email_sends_sequence_run_id
  on email_sends(sequence_run_id)
  where sequence_run_id is not null;

-- Analytics: per-tenant send volume over time.
create index if not exists idx_email_sends_tenant_sent_at
  on email_sends(tenant_id, sent_at desc);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- The webhook receiver uses createAdminClient() (service_role, bypasses RLS).
-- These policies protect the table for authenticated reads: emails UI, sequence
-- orchestrator running as the tenant's session.

alter table email_sends enable row level security;

create policy "email_sends_select"
  on email_sends for select
  using (is_super_admin() or tenant_id = get_my_tenant_id());

-- INSERT check: tenant_id must match the caller's tenant, AND the lead must
-- belong to the same tenant (prevents inserting a cross-tenant lead_id).
create policy "email_sends_insert"
  on email_sends for insert
  with check (
    is_super_admin()
    or (
      tenant_id = get_my_tenant_id()
      and lead_id in (select id from leads where tenant_id = get_my_tenant_id())
    )
  );

create policy "email_sends_update"
  on email_sends for update
  using (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "email_sends_delete"
  on email_sends for delete
  using (is_super_admin() or tenant_id = get_my_tenant_id());
