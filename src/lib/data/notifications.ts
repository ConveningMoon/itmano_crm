import { createAdminClient } from '@/lib/supabase/admin'

// Notifications are the single source of truth for the bell AND the Telegram
// channel — Telegram is just an outbound fan-out of the same rows. The bell/page
// read these rows directly.

export interface NotificationRow {
  id:         string
  tenantId:   string
  tenantName: string | null   // populated only for super_admin (multi-tenant view)
  type:       string
  leadId:     string | null
  agentId:    string | null
  message:    string
  read:       boolean
  createdAt:  string
}

// tenantId = null  → super_admin (no tenant filter, sees all tenants)
// tenantId = ''    → missing/invalid tenant → 0 / empty
// agentId non-null → role='agent': restrict to their own notifications
// agentId null     → no agent filter (agent_owner / super_admin see all)
export async function getUnreadCount(
  tenantId: string | null,
  agentId?: string | null,
): Promise<number> {
  if (tenantId === '') return 0

  const supabase = createAdminClient()
  let q = supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('read', false)
  if (tenantId) q = q.eq('tenant_id', tenantId)
  if (agentId)  q = q.eq('agent_id', agentId)

  const { count } = await q
  return count ?? 0
}

export async function getNotifications(
  tenantId: string | null,
  opts?: { type?: string | null; agentId?: string | null },
): Promise<NotificationRow[]> {
  if (tenantId === '') return []

  const supabase = createAdminClient()
  let q = supabase
    .from('notifications')
    .select('id, tenant_id, type, lead_id, agent_id, message, read, created_at')
    .order('created_at', { ascending: false })
  if (tenantId)      q = q.eq('tenant_id', tenantId)
  if (opts?.type)    q = q.eq('type', opts.type)
  if (opts?.agentId) q = q.eq('agent_id', opts.agentId)

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
  return (data as any[]).map(r => ({
    id:         r.id,
    tenantId:   r.tenant_id,
    tenantName: tenantId === null ? (tenantNames[r.tenant_id] ?? r.tenant_id) : null,
    type:       r.type,
    leadId:     r.lead_id,
    agentId:    r.agent_id ?? null,
    message:    r.message,
    read:       r.read,
    createdAt:  r.created_at,
  }))
}
