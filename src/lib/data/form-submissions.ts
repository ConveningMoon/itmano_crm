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
  score:            number | null
  stage:            string
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

// A submission shown on the lead profile. No contact join (the lead's data is
// already in the profile header); instead carries the channel name + type so we
// can label the form and decide whether the responded toggle applies.
export interface LeadSubmissionRow {
  id:          string
  channelName: string
  channelType: string
  answers:     SubmissionAnswer[]
  responded:   boolean
  submittedAt: string
}

// Submissions for one lead, newest first, joined to the channel (name + type).
// tenantId = null → super_admin (no tenant filter); otherwise scope to tenant.
export async function getSubmissionsForLead(
  leadId: string,
  tenantId: string | null
): Promise<LeadSubmissionRow[]> {
  const supabase = createAdminClient()

  let q = supabase
    .from('form_submissions')
    .select('id, answers, responded, submitted_at, acquisition_channels(name, channel_type)')
    .eq('lead_id', leadId)
    .order('submitted_at', { ascending: false })
  if (tenantId) q = q.eq('tenant_id', tenantId)

  const { data, error } = await q
  if (error || !data) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map(r => {
    const ch = Array.isArray(r.acquisition_channels) ? r.acquisition_channels[0] : r.acquisition_channels
    return {
      id:          r.id,
      channelName: ch?.name ?? 'Formulario',
      channelType: ch?.channel_type ?? '',
      answers:     Array.isArray(r.answers) ? (r.answers as SubmissionAnswer[]) : [],
      responded:   r.responded,
      submittedAt: r.submitted_at,
    }
  })
}

// Submissions for a channel, newest first, joined to the lead.
export async function getSubmissionsForChannel(
  channelId: string,
  tenantId: string | null
): Promise<SubmissionRow[]> {
  return fetchChannelSubmissions({ channelId }, tenantId)
}

// Los mismos envíos, resolviendo el canal por su slug dentro de la consulta
// (join !inner). Existe para que /sources/[slug] no tenga que esperar la fila
// del canal antes de pedir sus envíos: las dos lecturas van en la misma ola.
export async function getSubmissionsForChannelSlug(
  slug: string,
  tenantId: string | null
): Promise<SubmissionRow[]> {
  return fetchChannelSubmissions({ slug }, tenantId)
}

async function fetchChannelSubmissions(
  by: { channelId: string } | { slug: string },
  tenantId: string | null
): Promise<SubmissionRow[]> {
  const supabase = createAdminClient()

  const withChannel = 'slug' in by
  let q = supabase
    .from('form_submissions')
    .select(
      'id, channel_id, lead_id, answers, responded, responded_at, submitted_at, leads(first_name, last_name, email, phone, current_score, stage)'
      + (withChannel ? ', acquisition_channels!inner(slug)' : ''),
    )
    .order('submitted_at', { ascending: false })
  q = 'channelId' in by ? q.eq('channel_id', by.channelId) : q.eq('acquisition_channels.slug', by.slug)
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
            score:            leadRaw.current_score ?? null,
            stage:            leadRaw.stage ?? '',
          }
        : null,
    }
  })
}
