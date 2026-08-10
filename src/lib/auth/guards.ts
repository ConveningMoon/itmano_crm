import 'server-only'
import type { TenantContext } from './tenant-context'

// Centralized authorization guards for server actions (Option A: code-level
// gating; RLS is defense-in-depth, tightened in a later prompt).
//
// Permission model:
//   - super_admin: global, no restrictions.
//   - agent_owner: CRUD across their whole tenant.
//   - agent:       CRUD only on leads assigned to them (leads.agent_id =
//                  ctx.agent_id); READ-ONLY on everything else (sources, email,
//                  settings, agents).
//
// Guards return a denial object to `return` from the action (matching the
// existing `{ ok: false, error }` pattern) or `null` when the write is allowed.
// They never throw — a denial must not crash the page.

export interface AuthDenial {
  ok: false
  error: string
}

/**
 * Gate for resources where an 'agent' is read-only (sources, email, settings,
 * agents). super_admin and agent_owner may write.
 *
 * @returns an AuthDenial to return from the action, or null if allowed.
 */
export function requireWriteAccess(ctx: TenantContext): AuthDenial | null {
  if (ctx.role === 'agent') {
    return { ok: false, error: 'Tu rol es de solo lectura para esta sección.' }
  }
  return null
}

/**
 * Gate de escritura para FUENTES de adquisición.
 *
 * A diferencia de `requireWriteAccess`, admite al rol 'agent': un agente crea
 * sus propias fuentes y gestiona las que le pertenecen. Lo que no puede es
 * tocar la de un colega ni una de "Toda la agencia" — de eso se ocupa
 * `assertCanWriteChannel`, y en la creación, forzar el propietario a él mismo.
 *
 * @returns an AuthDenial to return from the action, or null if allowed.
 */
export function requireChannelWriteAccess(ctx: TenantContext): AuthDenial | null {
  // getCurrentTenantContext ya lanza si un 'agent' no tiene fila de agente, así
  // que esto no debería ocurrir; sin la comprobación, un agent_id null haría que
  // la fuente naciera como "Toda la agencia" — justo lo contrario de la regla.
  if (ctx.role === 'agent' && !ctx.agent_id) {
    return { ok: false, error: 'Tu cuenta no está vinculada a un agente.' }
  }
  return null
}

/**
 * Channel-level write gate.
 *   - super_admin → any channel, any tenant.
 *   - agent_owner → any channel within their tenant.
 *   - agent       → only channels attributed to them.
 *
 * Una fuente de "Toda la agencia" tiene `agent_id` null y por lo tanto queda
 * fuera del alcance de cualquier agente: no es de nadie en particular, y sólo
 * el propietario del equipo (o ITMANO) la administra.
 *
 * @returns an AuthDenial to return from the action, or null if allowed.
 */
export function assertCanWriteChannel(
  ctx: TenantContext,
  channel: { tenant_id: string; agent_id: string | null },
): AuthDenial | null {
  if (ctx.role === 'super_admin') return null

  if (channel.tenant_id !== ctx.tenant_id) {
    return { ok: false, error: 'No tienes permiso sobre esta fuente' }
  }

  if (ctx.role === 'agent' && channel.agent_id !== ctx.agent_id) {
    return { ok: false, error: 'No tienes permiso sobre esta fuente' }
  }

  return null
}

/**
 * Gate para los campos que un agente escribe SOBRE SÍ MISMO: su descripción y su
 * firma de correo. Los edita su dueño, o el propietario del equipo.
 *
 * `requireWriteAccess` no sirve aquí: bloquea al rol 'agent' por completo, así
 * que la firma y la descripción de cada agente las redactaba el propietario en
 * tercera persona. Y el propietario sigue pudiendo editarlas porque la mayoría
 * de las filas de `agents` tienen `user_id` null — son miembros del equipo sin
 * login, y si sólo su dueño pudiera editarlas quedarían congeladas para siempre.
 *
 * @returns an AuthDenial to return from the action, or null if allowed.
 */
export function requireSelfOrManager(ctx: TenantContext, agentId: string): AuthDenial | null {
  if (ctx.role !== 'agent') return null
  // ctx.agent_id es non-null para el rol 'agent' (getCurrentTenantContext lanza
  // si el usuario no está vinculado a un agente).
  if (ctx.agent_id === agentId) return null
  return { ok: false, error: 'Sólo puedes editar tu propio perfil.' }
}

/**
 * Lead-level write gate.
 *   - super_admin → any lead.
 *   - agent_owner → leads within their tenant.
 *   - agent       → leads within their tenant AND assigned to them.
 *
 * Closes the cross-tenant hole (a non-super context can only touch its own
 * tenant's leads) in addition to per-agent attribution.
 *
 * @returns an AuthDenial to return from the action, or null if allowed.
 */
export function assertCanWriteLead(
  ctx: TenantContext,
  lead: { tenant_id: string; agent_id: string },
): AuthDenial | null {
  // super_admin (tenant_id null) bypasses both checks.
  if (ctx.role === 'super_admin') return null

  // Cross-tenant: an agent_owner / agent can never touch another tenant's lead.
  if (lead.tenant_id !== ctx.tenant_id) {
    return { ok: false, error: 'No tienes permiso sobre este lead' }
  }

  // Per-agent attribution: an agent only owns the leads assigned to them.
  // ctx.agent_id is guaranteed non-null for role 'agent' (getCurrentTenantContext
  // throws on an unlinked agent), so a mismatch is a real ownership failure.
  if (ctx.role === 'agent' && lead.agent_id !== ctx.agent_id) {
    return { ok: false, error: 'No tienes permiso sobre este lead' }
  }

  return null
}

/**
 * Property-level write gate.
 *   - super_admin → any property, any tenant.
 *   - agent_owner → any property within their tenant.
 *   - agent       → only properties they created (created_by_user_id === ctx.user_id).
 *
 * If created_by_user_id is null (property created by super_admin), agents are
 * blocked — the property has no individual owner to match against.
 *
 * @returns an AuthDenial to return from the action, or null if allowed.
 */
export function assertCanWriteProperty(
  ctx: TenantContext,
  property: { tenant_id: string; created_by_user_id: string | null },
): AuthDenial | null {
  if (ctx.role === 'super_admin') return null

  if (property.tenant_id !== ctx.tenant_id) {
    return { ok: false, error: 'No tienes permiso sobre esta propiedad' }
  }

  if (ctx.role === 'agent' && property.created_by_user_id !== ctx.user_id) {
    return { ok: false, error: 'No tienes permiso sobre esta propiedad' }
  }

  return null
}

/**
 * Resolves the target tenant for a write: owner/agent → their context tenant;
 * super_admin → the explicitly chosen tenant (no implicit fallback). Returns the
 * tenant id, or an { error } to surface from the action.
 */
export function resolveTargetTenant(
  ctx: TenantContext,
  chosenTenantId?: string,
): string | { error: string } {
  if (ctx.role === 'super_admin') {
    // Con tenant seleccionado (actuando como tenant) los formularios ya no
    // muestran picker: el destino cae al tenant del contexto.
    const target = chosenTenantId ?? ctx.tenant_id
    if (!target) return { error: 'Selecciona un tenant desde el centro de control' }
    return target
  }
  if (!ctx.tenant_id) return { error: 'Acceso no autorizado' }
  return ctx.tenant_id
}
