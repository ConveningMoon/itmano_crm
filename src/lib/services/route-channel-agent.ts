import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'

// ── Channel → agent routing ─────────────────────────────────────────────────────
//
// Attribution rule for a lead arriving through an acquisition channel (intake form
// or contact submission).
//
//   1. channel.agent_id is set and that agent is ACTIVE → attribute to that agent.
//   2. Otherwise ("Toda la agencia", or the linked agent is inactive/missing) →
//      assign to agent-adriana (the tenant owner / team lead) if she is active.
//   3. If agent-adriana is absent or inactive → first active agent by id (defensive
//      fallback for tenants that don't have an 'agent-adriana' record).
//
// The legacy metadata.default_agent_id is no longer consulted — channels.agent_id
// (seeded from it during migration 035) is the source of truth.

type AdminClient = ReturnType<typeof createAdminClient>

// The preferred default agent for "Toda la agencia" channels.
const DEFAULT_AGENT_ID = 'agent-adriana'

export interface RoutingAgent {
  id:        string
  active:    boolean
}

// Pure selection rule — unit-tested in isolation. Returns the chosen agent id, or
// null if no eligible agent exists (caller treats null as a configuration error).
export function resolveRoutedAgent(
  channelAgentId: string | null,
  agents: RoutingAgent[],
): string | null {
  // 1. Explicit channel agent, only if active.
  if (channelAgentId) {
    const linked = agents.find(a => a.id === channelAgentId)
    if (linked && linked.active) return linked.id
    // Inactive / missing → fall through to default.
  }

  // 2. "Toda la agencia": always try the default agent first.
  const preferred = agents.find(a => a.id === DEFAULT_AGENT_ID && a.active)
  if (preferred) return preferred.id

  // 3. Defensive fallback: first active agent sorted by id (deterministic).
  const active = agents.filter(a => a.active).sort((a, b) => (a.id < b.id ? -1 : 1))
  return active[0]?.id ?? null
}

// Loads the tenant's agents, then applies resolveRoutedAgent. Logs a warning when
// an explicitly-linked agent is skipped because it is inactive.
export async function resolveChannelAgent(
  db: AdminClient,
  tenantId: string,
  channelAgentId: string | null,
): Promise<string | null> {
  const { data: agentRows } = await db
    .from('agents')
    .select('id, active')
    .eq('tenant_id', tenantId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (agentRows ?? []) as any[]
  if (rows.length === 0) return null

  const agents: RoutingAgent[] = rows.map(a => ({
    id:     a.id as string,
    active: a.active as boolean,
  }))

  // Warn when an explicit link is being skipped for inactivity.
  if (channelAgentId) {
    const linked = agents.find(a => a.id === channelAgentId)
    if (linked && !linked.active) {
      console.warn(JSON.stringify({
        service: 'route-channel-agent', tenant_id: tenantId,
        warning: 'linked_agent_inactive_fallback_default', agent_id: channelAgentId,
      }))
    }
  }

  return resolveRoutedAgent(channelAgentId, agents)
}
