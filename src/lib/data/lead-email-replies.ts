import { createAdminClient } from '@/lib/supabase/admin'

export interface LeadEmailReply {
  id:         string
  fromEmail:  string
  subject:    string | null
  bodyText:   string | null
  receivedAt: string
}

// Replies from the lead, most recent first.
// tenantId = null → super_admin (no tenant filter); otherwise scope to tenant.
export async function getLeadEmailReplies(
  leadId:   string,
  tenantId: string | null,
): Promise<LeadEmailReply[]> {
  const db = createAdminClient()

  let q = db
    .from('lead_email_replies')
    .select('id, from_email, subject, body_text, received_at')
    .eq('lead_id', leadId)
    .order('received_at', { ascending: false })

  if (tenantId) q = q.eq('tenant_id', tenantId)

  const { data, error } = await q
  if (error || !data) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map(r => ({
    id:         r.id        as string,
    fromEmail:  r.from_email as string,
    subject:    (r.subject   as string | null) ?? null,
    bodyText:   (r.body_text as string | null) ?? null,
    receivedAt: r.received_at as string,
  }))
}
