import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'

// ── Channel → agent routing ─────────────────────────────────────────────────────
//
// Attribution rule for a lead arriving through an acquisition channel (intake form
// or contact submission). The LANGUAGE of the lead is NO LONGER a routing criterion
// (it was, historically — see the deprecated paths replaced by this module).
//
//   1. channel.agent_id is set and that agent is ACTIVE → attribute to that agent.
//   2. Otherwise ("Toda la agencia", or the linked agent is inactive/missing) →
//      round-robin among the tenant's ACTIVE agents, excluding the manual-only
//      'first_buyer' specialty (Melanie). Deterministic: the eligible agent whose
//      most recent channel-routed lead is OLDEST wins; never-routed agents go first;
//      ties broken by agent id.
//
// The legacy metadata.default_agent_id is no longer consulted — channels.agent_id
// (seeded from it during migration 035) is the source of truth.

type AdminClient = ReturnType<typeof createAdminClient>

// Specialty excluded from automatic round-robin (assigned manually only).
const MANUAL_ONLY_SPECIALTY = 'first_buyer'

export interface RoutingAgent {
  id: string
  active: boolean
  specialty: string | null
  // ISO timestamp of this agent's most recent channel-routed lead, or null if none.
  lastRoutedAt: string | null
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
    // Inactive / missing → fall through to round-robin.
  }

  // 2. Round-robin among active, non-first_buyer agents.
  const eligible = agents.filter(a => a.active && a.specialty !== MANUAL_ONLY_SPECIALTY)
  if (eligible.length === 0) return null

  eligible.sort((a, b) => {
    if (a.lastRoutedAt === b.lastRoutedAt) return a.id < b.id ? -1 : 1
    if (a.lastRoutedAt === null) return -1 // never routed → most starved → first
    if (b.lastRoutedAt === null) return 1
    return a.lastRoutedAt < b.lastRoutedAt ? -1 : 1 // oldest assignment first
  })

  return eligible[0].id
}

// Loads the tenant's agents + their last channel-routed assignment, then applies
// resolveRoutedAgent. Logs a warning when an explicitly-linked agent is skipped
// because it is inactive. Returns the chosen agent id, or null on misconfiguration.
export async function resolveChannelAgent(
  db: AdminClient,
  tenantId: string,
  channelAgentId: string | null,
): Promise<string | null> {
  const { data: agentRows } = await db
    .from('agents')
    .select('id, active, specialty')
    .eq('tenant_id', tenantId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (agentRows ?? []) as any[]
  if (rows.length === 0) return null

  // Most recent channel-routed lead per agent (acquisition_channel_id IS NOT NULL =
  // arrived through routing, excludes manual/import direct entries). Small tenant
  // scale — fetch + reduce in-process.
  const { data: routed } = await db
    .from('leads')
    .select('agent_id, created_at')
    .eq('tenant_id', tenantId)
    .not('acquisition_channel_id', 'is', null)

  const lastRoutedByAgent = new Map<string, string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const l of (routed ?? []) as any[]) {
    const aid = l.agent_id as string | null
    const ts  = l.created_at as string | null
    if (!aid || !ts) continue
    const prev = lastRoutedByAgent.get(aid)
    if (!prev || ts > prev) lastRoutedByAgent.set(aid, ts)
  }

  const agents: RoutingAgent[] = rows.map(a => ({
    id:           a.id as string,
    active:       a.active as boolean,
    specialty:    (a.specialty ?? null) as string | null,
    lastRoutedAt: lastRoutedByAgent.get(a.id as string) ?? null,
  }))

  // Warn when an explicit link is being skipped for inactivity.
  if (channelAgentId) {
    const linked = agents.find(a => a.id === channelAgentId)
    if (linked && !linked.active) {
      console.warn(JSON.stringify({
        service: 'route-channel-agent', tenant_id: tenantId,
        warning: 'linked_agent_inactive_fallback_round_robin', agent_id: channelAgentId,
      }))
    }
  }

  return resolveRoutedAgent(channelAgentId, agents)
}
