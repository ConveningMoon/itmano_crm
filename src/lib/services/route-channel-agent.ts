import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'

// ── Channel → agent routing ─────────────────────────────────────────────────────
//
// Attribution rule for a lead arriving through an acquisition channel (intake form
// or contact submission).
//
//   1. channel.agent_id is set and that agent is ACTIVE → attribute to that agent.
//   2. Otherwise ("Toda la agencia", or the linked agent is inactive/missing) →
//      assign to the tenant's OWNER agent (the agents row linked to the login that
//      holds role 'agent_owner'), if active.
//   3. If no active owner agent exists → first active agent by id (defensive
//      fallback for tenants whose owner has no agents row).
//
// El paso 2 era un id literal, 'agent-adriana': la propietaria de A&J. Acertaba
// en el tenant piloto y en ninguno más — cualquier otro caía al paso 3, que
// reparte por orden alfabético de id. Desde que la comisión del agente asignado
// decide el valor potencial que muestra el CRM, ese reparto arbitrario dejó de
// ser cosmético: cambia el dinero que se le enseña al cliente.
//
// The legacy metadata.default_agent_id is no longer consulted — channels.agent_id
// (seeded from it during migration 035) is the source of truth.

type AdminClient = ReturnType<typeof createAdminClient>

export interface RoutingAgent {
  id:        string
  active:    boolean
  /** Vinculado al login con rol 'agent_owner' de su tenant. */
  isOwner:   boolean
}

// Pure selection rule — unit-tested in isolation. Returns the chosen agent id, or
// null if no eligible agent exists (caller treats null as a configuration error).
export function resolveRoutedAgent(
  channelAgentId: string | null,
  agents: RoutingAgent[],
): string | null {
  // Orden estable por id: el desempate no puede depender de cómo vino el query.
  const porId = [...agents].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  // 1. Explicit channel agent, only if active.
  if (channelAgentId) {
    const linked = porId.find(a => a.id === channelAgentId)
    if (linked && linked.active) return linked.id
    // Inactive / missing → fall through to the owner.
  }

  // 2. "Toda la agencia": el propietario del equipo. Puede haber más de un
  //    agent_owner (setAgentAsOwner no lo impide), así que gana el primero por id.
  const owner = porId.find(a => a.isOwner && a.active)
  if (owner) return owner.id

  // 3. Defensive fallback: first active agent sorted by id (deterministic).
  return porId.find(a => a.active)?.id ?? null
}

// Loads the tenant's agents, then applies resolveRoutedAgent. Logs a warning when
// an explicitly-linked agent is skipped because it is inactive.
export async function resolveChannelAgent(
  db: AdminClient,
  tenantId: string,
  channelAgentId: string | null,
): Promise<string | null> {
  const [{ data: agentRows }, { data: ownerRows }] = await Promise.all([
    db.from('agents').select('id, active, user_id').eq('tenant_id', tenantId),
    db.from('user_profiles').select('id').eq('tenant_id', tenantId).eq('role', 'agent_owner'),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (agentRows ?? []) as any[]
  if (rows.length === 0) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ownerUserIds = new Set(((ownerRows ?? []) as any[]).map(o => o.id as string))

  const agents: RoutingAgent[] = rows.map(a => ({
    id:      a.id as string,
    active:  a.active as boolean,
    // agents.user_id es null en la mayoría de las filas (miembros del equipo sin
    // login): esos nunca son owner, y el Set nunca contiene null.
    isOwner: a.user_id !== null && ownerUserIds.has(a.user_id as string),
  }))

  // Warn when an explicit link is being skipped for inactivity.
  if (channelAgentId) {
    const linked = agents.find(a => a.id === channelAgentId)
    if (linked && !linked.active) {
      console.warn(JSON.stringify({
        service: 'route-channel-agent', tenant_id: tenantId,
        warning: 'linked_agent_inactive_fallback_owner', agent_id: channelAgentId,
      }))
    }
  }

  // Sin owner activo el ruteo sigue funcionando (paso 3), pero es un hueco de
  // configuración que nadie ve: dejarlo en el log es la única forma de enterarse.
  if (!agents.some(a => a.isOwner && a.active)) {
    console.warn(JSON.stringify({
      service: 'route-channel-agent', tenant_id: tenantId,
      warning: 'no_active_owner_agent_fallback_first_active',
    }))
  }

  return resolveRoutedAgent(channelAgentId, agents)
}
