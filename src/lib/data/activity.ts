import { createAdminClient } from '@/lib/supabase/admin'
import { resolveActorNames, authorOf } from '@/lib/data/activity-authors'
import type { ActivityViewer } from '@/lib/activity/visibility'

// Recent activity feed — sourced from lead_events (same source the dashboard
// block has always used). The shape mirrors the dashboard exactly.
export interface ActivityItem {
  id:          string
  type:        string
  description: string
  createdAt:   string
  tenantId:    string
  tenantName:  string | null   // populated only for super_admin (multi-tenant view)
  author:      string          // resolved actor display ("Sistema" / agent name / email)
}

// tenantId = null → super_admin (no tenant filter, sees all tenants)
// tenantId = ''   → missing/invalid tenant → empty
// viewer: role-based visibility — an 'agent' only sees system + own activities
// (filter applied in SQL here; mirrors isEventVisibleToViewer).
// ownerAgentId != null → scope to events on leads owned by that agent (dashboard
//   "ve solo sus leads" model). When set it SUPERSEDES the author-based viewer
//   filter. The full /activity page leaves it null and keeps the author model.
async function fetchActivity(
  tenantId: string | null,
  limit: number,
  offset: number,
  viewer: ActivityViewer | null,
  ownerAgentId: string | null = null,
): Promise<ActivityItem[]> {
  if (tenantId === '') return []

  const supabase = createAdminClient()
  const selectCols = ownerAgentId
    ? 'id, type, description, created_at, tenant_id, actor_user_id, leads!inner(agent_id)'
    : 'id, type, description, created_at, tenant_id, actor_user_id'
  let q = supabase
    .from('lead_events')
    .select(selectCols)
    .order('created_at', { ascending: false })
  if (tenantId) q = q.eq('tenant_id', tenantId)
  if (ownerAgentId) {
    // Agent dashboard: events on the agent's own leads (supersedes the actor filter).
    q = q.eq('leads.agent_id', ownerAgentId)
  } else if (viewer && viewer.role === 'agent') {
    q = q.or(`actor_user_id.is.null,actor_user_id.eq.${viewer.userId}`)
  }
  q = q.range(offset, offset + limit - 1)

  const { data, error } = await q
  if (error || !data) return []

  // Tenant names only matter for the super_admin multi-tenant view
  let tenantNames: Record<string, string> = {}
  if (tenantId === null) {
    const { data: tenants } = await supabase.from('tenants').select('id, name')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tenantNames = Object.fromEntries((tenants ?? []).map((t: any) => [t.id, t.name]))
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = data as any[]
  const names = await resolveActorNames(rows.map(r => r.actor_user_id))

  return rows.map(r => ({
    id:          r.id,
    type:        r.type,
    description: r.description,
    createdAt:   r.created_at,
    tenantId:    r.tenant_id,
    tenantName:  tenantId === null ? (tenantNames[r.tenant_id] ?? r.tenant_id) : null,
    author:      authorOf(r.actor_user_id, names),
  }))
}

// Dashboard block — mirrors the original inline query (limit 10, newest first).
// ownerAgentId (role 'agent') scopes to events on that agent's own leads.
export function getRecentActivity(
  tenantId: string | null,
  viewer: ActivityViewer | null,
  limit = 10,
  ownerAgentId: string | null = null,
): Promise<ActivityItem[]> {
  return fetchActivity(tenantId, limit, 0, viewer, ownerAgentId)
}

// Full activity page — paginated by offset.
export function getAllActivity(
  tenantId: string | null,
  viewer: ActivityViewer | null,
  opts: { limit?: number; offset?: number } = {},
): Promise<ActivityItem[]> {
  return fetchActivity(tenantId, opts.limit ?? 30, opts.offset ?? 0, viewer)
}
