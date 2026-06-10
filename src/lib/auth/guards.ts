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
