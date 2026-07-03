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
