import { createAdminClient } from '@/lib/supabase/admin'

// One recorded status transition (lead_status_history row). `source` is the actor:
// 'trigger' (automatic score-driven promotion/demotion), 'agent' (manual action),
// or 'system'. There is no per-user actor column — source is the audit dimension.
export interface StatusChange {
  id:         string
  fromStatus: string | null   // null on the first recorded status
  toStatus:   string
  source:     string
  changedAt:  string
}

// Status history for one lead, oldest → newest (chronological, reads as a progression).
// tenantId = null → super_admin (no tenant filter); otherwise scope to tenant —
// same pattern as getSubmissionsForLead. The lead_status_history RLS select policy
// is the DB-level backstop.
export async function getLeadStatusHistory(
  leadId: string,
  tenantId: string | null
): Promise<StatusChange[]> {
  const supabase = createAdminClient()

  let q = supabase
    .from('lead_status_history')
    .select('id, from_status, to_status, source, changed_at')
    .eq('lead_id', leadId)
    .order('changed_at', { ascending: true })
    .order('id', { ascending: true }) // stable tiebreak for same-instant rows
  if (tenantId) q = q.eq('tenant_id', tenantId)

  const { data, error } = await q
  if (error || !data) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map(r => ({
    id:         r.id,
    fromStatus: r.from_status,
    toStatus:   r.to_status,
    source:     r.source,
    changedAt:  r.changed_at,
  }))
}
