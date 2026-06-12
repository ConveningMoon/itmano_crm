-- 035_acquisition_channels_agent.sql
-- Channel ↔ agent ownership + routing source of truth.
--
-- A channel can now be linked to an agent. This drives lead attribution on intake
-- and contact submissions (see route-channel-agent.ts):
--   • agent_id set   → the lead is attributed to that agent (round-robin fallback
--                      only if the agent is inactive).
--   • agent_id null  → "Toda la agencia": round-robin among the tenant's active
--                      agents (excluding the manual-only first_buyer specialty).
--
-- The legacy metadata.default_agent_id is DEPRECATED as a routing input — routing
-- now reads this column. The metadata value is preserved (not deleted) for audit,
-- and is used here ONCE to seed agent_id during backfill.

alter table acquisition_channels
  add column if not exists agent_id text references agents(id) on delete set null;

comment on column acquisition_channels.agent_id is
  'Owning agent for routing/attribution. null = "Toda la agencia" (round-robin among active non-first_buyer agents). Supersedes the deprecated metadata.default_agent_id.';

-- ── Backfill (all channels, incl. contact + archived) ─────────────────────────
-- Precedence: a valid metadata.default_agent_id (same tenant) → else the tenant's
-- login-owner agent (user_id set, lowest id) → else any agent of the tenant.
-- For A&J this resolves every existing channel to agent-adriana.
update acquisition_channels c
set agent_id = coalesce(
  (select a.id from agents a
     where a.id = c.metadata->>'default_agent_id' and a.tenant_id = c.tenant_id),
  (select a.id from agents a
     where a.tenant_id = c.tenant_id and a.user_id is not null
     order by a.id limit 1),
  (select a.id from agents a
     where a.tenant_id = c.tenant_id
     order by a.id limit 1)
)
where c.agent_id is null;
