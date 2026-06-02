import { createAdminClient } from '@/lib/supabase/admin'

// One answer item from the form_submissions snapshot (see CLAUDE.md → answers contract).
export interface SubmissionAnswer {
  key:       string
  question?: string
  value:     unknown
  label?:    string
}

export interface SubmissionLead {
  firstName:        string
  lastName:         string
  email:            string
  phone:            string | null
  temperatureScore: number | null
  status:           string
}

export interface SubmissionRow {
  id:          string
  channelId:   string
  leadId:      string
  answers:     SubmissionAnswer[]
  responded:   boolean
  respondedAt: string | null
  submittedAt: string
  lead:        SubmissionLead | null
}

// Submissions for a channel, newest first, joined to the lead.
// tenantId = null → super_admin (no tenant filter); otherwise scope to tenant.
export async function getSubmissionsForChannel(
  channelId: string,
  tenantId: string | null
): Promise<SubmissionRow[]> {
  const supabase = createAdminClient()

  let q = supabase
    .from('form_submissions')
    .select('id, channel_id, lead_id, answers, responded, responded_at, submitted_at, leads(first_name, last_name, email, phone, temperature_score, status)')
    .eq('channel_id', channelId)
    .order('submitted_at', { ascending: false })
  if (tenantId) q = q.eq('tenant_id', tenantId)

  const { data, error } = await q
  if (error || !data) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map(r => {
    // PostgREST returns the embedded to-one relation as an object (or array in
    // some versions) — normalize to a single lead.
    const leadRaw = Array.isArray(r.leads) ? r.leads[0] : r.leads
    return {
      id:          r.id,
      channelId:   r.channel_id,
      leadId:      r.lead_id,
      answers:     Array.isArray(r.answers) ? (r.answers as SubmissionAnswer[]) : [],
      responded:   r.responded,
      respondedAt: r.responded_at,
      submittedAt: r.submitted_at,
      lead: leadRaw
        ? {
            firstName:        leadRaw.first_name ?? '',
            lastName:         leadRaw.last_name ?? '',
            email:            leadRaw.email ?? '',
            phone:            leadRaw.phone ?? null,
            temperatureScore: leadRaw.temperature_score ?? null,
            status:           leadRaw.status ?? '',
          }
        : null,
    }
  })
}
