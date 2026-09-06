-- Migration 017: leads.metadata + default_agent_id in acquisition_channels
--
-- leads.metadata: free-form JSONB for per-lead data not covered by typed columns.
-- Used by the intake endpoint to store quiz_answers submitted via lead-magnet forms.
--
-- default_agent_id in acquisition_channels.metadata: controls language-based routing
-- for intake form submissions. The intake endpoint reads
-- channel.metadata->>'default_agent_id' first; if absent, falls back to querying
-- agents by (tenant_id, language, specialty != 'first_buyer').
-- Uses jsonb || merge to preserve any existing metadata keys.

alter table leads
  add column if not exists metadata jsonb;

-- Seed routing for all A&J channels: spanish lead magnets route to agent-adriana.
-- Other tenants can set their own default_agent_id via the CRM settings (Phase 5).
update acquisition_channels
set    metadata = metadata || '{"default_agent_id": "agent-adriana"}'::jsonb
where  tenant_id = 'tenant-aj';
