-- Migration 009: scoring tables
-- Creates lead_score_rules, lead_status_history, notifications.
-- Adds peak_score / current_score / last_event_at / score_updated_at to leads.
-- Adds dedup_key / metadata to lead_events (prerequisite for the scoring trigger).
-- Backfills peak_score and current_score from the existing temperature_score column.

-- ─── 1. Extend leads with scoring columns ────────────────────────────────────

alter table leads
  add column if not exists peak_score       integer,
  add column if not exists current_score    integer,
  add column if not exists last_event_at    timestamptz,
  add column if not exists score_updated_at timestamptz;

-- Backfill from temperature_score so existing rows are consistent.
update leads
set    peak_score    = temperature_score,
       current_score = temperature_score
where  temperature_score is not null
  and  peak_score    is null;

create index if not exists idx_leads_tenant_current_score
  on leads (tenant_id, current_score desc nulls last);

-- ─── 2. Extend lead_events with dedup_key and metadata ───────────────────────

alter table lead_events
  add column if not exists dedup_key text,
  add column if not exists metadata  jsonb;

-- Nullable unique: two events with no dedup_key are not considered duplicates.
create unique index if not exists lead_events_dedup_uq
  on lead_events (lead_id, dedup_key)
  where dedup_key is not null;

-- ─── 3. lead_score_rules ─────────────────────────────────────────────────────

create table lead_score_rules (
  id          uuid    primary key default gen_random_uuid(),
  tenant_id   text    references tenants(id) on delete cascade,  -- NULL = global default
  event_type  text    not null,
  points      integer not null,
  side_effect text    check (
    side_effect in ('block_email', 'mark_email_invalid', 'force_perdido', 'pause_sequences')
    or side_effect is null
  ),
  -- One rule per (tenant_id, event_type). NULLs treated as distinct values so a
  -- global rule (tenant_id IS NULL) and a per-tenant override can coexist.
  constraint lead_score_rules_uq unique nulls not distinct (tenant_id, event_type)
);

alter table lead_score_rules enable row level security;

-- Tenants can read global rules (tenant_id IS NULL) and their own overrides.
create policy "lead_score_rules_select"
  on lead_score_rules for select
  using (is_super_admin() or tenant_id is null or tenant_id = get_my_tenant_id());

-- Only super_admin may mutate rules (per-tenant overrides deferred to Phase 5).
create policy "lead_score_rules_write_super_admin"
  on lead_score_rules for all
  using (is_super_admin());

-- ─── 4. lead_status_history ──────────────────────────────────────────────────

create table lead_status_history (
  id          uuid        primary key default gen_random_uuid(),
  lead_id     text        not null references leads(id) on delete cascade,
  tenant_id   text        not null references tenants(id),
  from_status text,         -- NULL on the very first recorded status
  to_status   text        not null,
  source      text        not null default 'system'
                check (source in ('system', 'trigger', 'agent')),
  changed_at  timestamptz not null default now()
);

create index lead_status_history_lead_id_idx    on lead_status_history (lead_id, changed_at desc);
create index lead_status_history_tenant_id_idx  on lead_status_history (tenant_id);

alter table lead_status_history enable row level security;

create policy "lead_status_history_select"
  on lead_status_history for select
  using (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "lead_status_history_insert"
  on lead_status_history for insert
  with check (is_super_admin() or tenant_id = get_my_tenant_id());

-- History rows are immutable — no UPDATE or DELETE policies.

-- ─── 5. notifications ────────────────────────────────────────────────────────

create table notifications (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  text        not null references tenants(id),
  type       text        not null
               check (type in ('score_threshold', 'contact_form_question', 'lead_created')),
  lead_id    text        references leads(id) on delete set null,
  message    text        not null,
  read       boolean     not null default false,
  created_at timestamptz not null default now()
);

create index notifications_tenant_unread_idx on notifications (tenant_id, created_at desc) where read = false;
create index notifications_lead_id_idx       on notifications (lead_id);

alter table notifications enable row level security;

create policy "notifications_select"
  on notifications for select
  using (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "notifications_insert"
  on notifications for insert
  with check (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "notifications_update"
  on notifications for update
  using (is_super_admin() or tenant_id = get_my_tenant_id());

-- ─── 6. Seed global lead_score_rules ─────────────────────────────────────────
-- tenant_id = NULL → global default, applies to every tenant.
-- Event type names match what the scoring trigger and intake endpoints will emit.

insert into lead_score_rules (tenant_id, event_type, points, side_effect) values
  -- Nuclear signals (deliberate, hard to fake)
  (null, 'consultation_scheduled',   50, null),
  (null, 'consultation_attended',    30, null),
  (null, 'avm_request',              40, null),
  (null, 'property_inquiry',         30, null),
  (null, 'email_replied',            30, null),
  (null, 'phone_call_answered',      25, null),
  -- Medium signals (deliberate engagement)
  (null, 'email_clicked',            15, null),
  (null, 'lm_downloaded_2nd',        20, null),
  (null, 'lm_downloaded_3rd_plus',   25, null),
  (null, 'services_page_visit',      15, null),
  (null, 'newsletter_subscribed',    10, null),
  -- Low signals (logged, barely scored)
  (null, 'email_opened',              2, null),
  (null, 'page_visit',                3, null),
  -- Negative signals
  (null, 'email_unsubscribed',      -50, 'block_email'),
  (null, 'email_hard_bounce',       -30, 'mark_email_invalid'),
  (null, 'email_spam_complaint',   -100, 'force_perdido'),
  (null, 'opt_out_message',         -40, 'pause_sequences')
on conflict (tenant_id, event_type) do nothing;
