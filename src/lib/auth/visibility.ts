import 'server-only'
import type { TenantContext } from '@/lib/auth/tenant-context'

// ── Visibility scope — the single, reusable read-visibility criterion ───────────
//
// This is the code mirror of the (pending) RLS policies. EVERY read query on the
// agent-visible surfaces (leads, acquisition_channels, email_sequences and what
// derives from them) must pass through here instead of sprinkling `if role===...`.
//
// Rules:
//   • super_admin → no filter (sees all tenants).
//   • agent_owner → tenant filter only (manages the whole tenant).
//   • agent       → tenant filter AND <column> = agent_id. This naturally EXCLUDES
//                   "Toda la agencia" rows (agent_id IS NULL) because `eq` never
//                   matches NULL — exactly the desired behaviour for channels and
//                   sequences. Every lead has an agent_id, so leads filter cleanly too.

export interface VisibilityScope {
  // null → super_admin (no tenant filter). Otherwise the tenant to filter by.
  tenantId: string | null
  // non-null only for role 'agent' → restrict rows to this agent_id.
  agentId: string | null
}

// Derives the scope from the auth context. agentId is set ONLY for role 'agent'
// (super_admin / agent_owner see their whole scope and are not filtered by agent).
export function scopeFor(ctx: Pick<TenantContext, 'role' | 'tenant_id' | 'agent_id'>): VisibilityScope {
  return {
    tenantId: ctx.tenant_id,
    agentId:  ctx.role === 'agent' ? ctx.agent_id : null,
  }
}

// True when the viewer is an agent (so the caller can hide per-agent UI blocks).
export function isAgentScoped(scope: VisibilityScope): boolean {
  return scope.agentId !== null
}

// Shallow, self-returning view of the PostgREST filter builder's chainable .eq.
// We cast to this internally so TypeScript does not try to deeply re-instantiate
// the (very large) PostgREST builder generics on every chained call (TS2589).
interface ScopableQuery {
  eq(column: string, value: unknown): ScopableQuery
}

// Applies the scope to a Supabase query builder. `column` is the per-table agent
// column (default 'agent_id'). Q is a passthrough — the caller's builder type is
// preserved for downstream chaining/await.
export function applyVisibilityScope<Q>(
  query: Q,
  scope: VisibilityScope,
  opts: { column?: string } = {},
): Q {
  const column = opts.column ?? 'agent_id'
  let q = query as unknown as ScopableQuery
  if (scope.tenantId) q = q.eq('tenant_id', scope.tenantId)
  if (scope.agentId)  q = q.eq(column, scope.agentId)
  return q as unknown as Q
}

// In-memory guard for a single fetched row (detail pages that select by id, where
// applying the filter to the query would still return the row to a non-owner).
// Returns true when the row is visible under the scope.
export function isRowVisible(
  scope: VisibilityScope,
  row: { tenant_id?: string | null; agent_id?: string | null } | null | undefined,
  opts: { column?: 'agent_id' } = {},
): boolean {
  if (!row) return false
  if (scope.tenantId && row.tenant_id !== scope.tenantId) return false
  if (scope.agentId) {
    const col = opts.column ?? 'agent_id'
    if ((row as Record<string, unknown>)[col] !== scope.agentId) return false
  }
  return true
}
