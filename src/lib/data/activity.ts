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
async function fetchActivity(
  tenantId: string | null,
  limit: number,
  offset: number,
  viewer: ActivityViewer | null,
): Promise<ActivityItem[]> {
  if (tenantId === '') return []

  const supabase = createAdminClient()
  let q = supabase
    .from('lead_events')
    .select('id, type, description, created_at, tenant_id, actor_user_id')
    .order('created_at', { ascending: false })
  if (tenantId) q = q.eq('tenant_id', tenantId)
  if (viewer && viewer.role === 'agent') {
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
export function getRecentActivity(
  tenantId: string | null,
  viewer: ActivityViewer | null,
  limit = 10,
): Promise<ActivityItem[]> {
  return fetchActivity(tenantId, limit, 0, viewer)
}

// Full activity page — paginated by offset.
export function getAllActivity(
  tenantId: string | null,
  viewer: ActivityViewer | null,
  opts: { limit?: number; offset?: number } = {},
): Promise<ActivityItem[]> {
  return fetchActivity(tenantId, opts.limit ?? 30, opts.offset ?? 0, viewer)
}
