-- Migration 031: auth schema foundations — login-capable agents.
--
-- Purely additive groundwork for the "agents with login" model. No row uses the
-- new 'agent' role yet, agents.user_id is nullable, and invitations is a new table —
-- so this is non-breaking. The ONE behavior change is leads.agent_id ON DELETE:
-- CASCADE -> RESTRICT, so deleting an agent that still owns leads now fails loudly
-- (forcing reassignment) instead of silently deleting the pipeline. No app path
-- deletes agents today, so nothing current breaks.
--
-- App code that USES any of this (invite flow, agent<->login linking) lands in
-- later prompts; this migration is schema-only.

-- ─── 1. user_profiles.role — allow 'agent' ────────────────────────────────────
alter table user_profiles drop constraint if exists user_profiles_role_check;
alter table user_profiles add constraint user_profiles_role_check
  check (role in ('super_admin', 'agent_owner', 'agent'));

-- ─── 2. agents.user_id — optional link to a login (auth.users) ─────────────────
-- Nullable: most team members never log in. UNIQUE: one login maps to at most one
-- agent record. ON DELETE SET NULL: removing the login leaves the team record
-- intact, just unlinked.
alter table agents
  add column if not exists user_id uuid unique references auth.users(id) on delete set null;

-- ─── 3. invitations — pending team-member / owner invites ──────────────────────
create table if not exists invitations (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   text        not null references tenants(id) on delete cascade,
  email       text        not null,
  role        text        not null check (role in ('agent_owner', 'agent')),
  agent_id    text        references agents(id) on delete set null,
  status      text        not null default 'pending'
              check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by  uuid        references auth.users(id) on delete set null,
  created_at  timestamptz default now(),
  accepted_at timestamptz,
  expires_at  timestamptz
);

-- One pending invitation per (tenant, email). Accepted/revoked/expired rows do not
-- block a fresh invite.
create unique index if not exists invitations_pending_email
  on invitations (tenant_id, email) where status = 'pending';

create index if not exists idx_invitations_tenant on invitations(tenant_id);

alter table invitations enable row level security;

-- SELECT = defense-in-depth tenant isolation (writes go through service_role; the
-- full write policy set arrives with the permissions-redesign migration).
create policy "invitations_select" on invitations
  for select using (is_super_admin() or tenant_id = get_my_tenant_id());

-- ─── 4. leads.agent_id — CASCADE -> RESTRICT ──────────────────────────────────
-- Deleting an agent with leads now fails on purpose; reassign the leads first.
-- Prevents silent pipeline loss.
alter table leads drop constraint if exists leads_agent_id_fkey;
alter table leads add constraint leads_agent_id_fkey
  foreign key (agent_id) references agents(id) on delete restrict;
