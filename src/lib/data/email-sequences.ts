import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SequenceChannel {
  id:   string
  name: string
  slug: string
}

export interface SequenceStep {
  id:         string
  stepOrder:  number
  delayHours: number
  subject:    string | null
  active:     boolean
  resendTemplateId: string | null
}

export interface SequenceRun {
  id:               string
  leadId:           string
  leadName:         string
  status:           'active' | 'paused' | 'completed' | 'cancelled'
  cancelledReason:  string | null
  currentStepOrder: number
  nextSendAt:       string | null
  startedAt:        string
  lastSentAt:       string | null
  completedAt:      string | null
}

export interface EmailSequence {
  id:                 string
  tenantId:           string
  name:               string
  language:           string
  description:        string | null
  active:             boolean
  channels:           SequenceChannel[]   // 0-or-many channels pointing to this sequence
  steps:              SequenceStep[]
  stepCount:          number
  activeRunCount:     number
  completedRunCount:  number
  cancelledRunCount:  number
  createdAt:          string
}

// ─── Data access ──────────────────────────────────────────────────────────────

export async function listSequences(tenantId: string): Promise<EmailSequence[]> {
  const supabase = createAdminClient()

  const [{ data: seqRows }, { data: stepRows }, { data: runRows }, { data: channelRows }] = await Promise.all([
    supabase
      .from('email_sequences')
      .select('id, tenant_id, name, language, description, active, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at'),

    supabase
      .from('email_sequence_steps')
      .select('id, sequence_id, step_order, delay_hours, subject, resend_template_id, active')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .order('step_order'),

    supabase
      .from('lead_sequence_runs')
      .select('sequence_id, status')
      .eq('tenant_id', tenantId),

    // Channels that reference any of the tenant's sequences
    supabase
      .from('acquisition_channels')
      .select('id, name, slug, email_sequence_id')
      .eq('tenant_id', tenantId)
      .not('email_sequence_id', 'is', null),
  ])

  const stepsBySeq = new Map<string, SequenceStep[]>()
  for (const s of stepRows ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = s as any
    if (!stepsBySeq.has(row.sequence_id)) stepsBySeq.set(row.sequence_id, [])
    stepsBySeq.get(row.sequence_id)!.push({
      id:               row.id,
      stepOrder:        row.step_order,
      delayHours:       row.delay_hours,
      subject:          row.subject,
      active:           row.active,
      resendTemplateId: row.resend_template_id,
    })
  }

  const runCountsBySeq = new Map<string, { active: number; completed: number; cancelled: number }>()
  for (const r of runRows ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = r as any
    if (!runCountsBySeq.has(row.sequence_id)) {
      runCountsBySeq.set(row.sequence_id, { active: 0, completed: 0, cancelled: 0 })
    }
    const counts = runCountsBySeq.get(row.sequence_id)!
    if (row.status === 'active')    counts.active++
    if (row.status === 'completed') counts.completed++
    if (row.status === 'cancelled') counts.cancelled++
  }

  // Channels grouped by sequence id
  const channelsBySeq = new Map<string, SequenceChannel[]>()
  for (const c of channelRows ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = c as any
    const sid = row.email_sequence_id as string
    if (!channelsBySeq.has(sid)) channelsBySeq.set(sid, [])
    channelsBySeq.get(sid)!.push({ id: row.id, name: row.name, slug: row.slug })
  }

  return (seqRows ?? []).map(s => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row    = s as any
    const id     = row.id as string
    const counts = runCountsBySeq.get(id) ?? { active: 0, completed: 0, cancelled: 0 }
    const steps  = stepsBySeq.get(id) ?? []
    return {
      id,
      tenantId:          row.tenant_id,
      name:              row.name,
      language:          row.language ?? 'es',
      description:       row.description ?? null,
      active:            row.active,
      channels:          channelsBySeq.get(id) ?? [],
      steps,
      stepCount:         steps.length,
      activeRunCount:    counts.active,
      completedRunCount: counts.completed,
      cancelledRunCount: counts.cancelled,
      createdAt:         row.created_at,
    }
  })
}

export async function getSequenceWithRuns(
  tenantId: string,
  sequenceId: string,
): Promise<(EmailSequence & { runs: SequenceRun[] }) | null> {
  const supabase = createAdminClient()

  const [{ data: seqRow }, { data: stepRows }, { data: runRows }, { data: channelRows }] = await Promise.all([
    supabase
      .from('email_sequences')
      .select('id, tenant_id, name, language, description, active, created_at')
      .eq('id', sequenceId)
      .eq('tenant_id', tenantId)
      .single(),

    supabase
      .from('email_sequence_steps')
      .select('id, sequence_id, step_order, delay_hours, subject, resend_template_id, active')
      .eq('sequence_id', sequenceId)
      .eq('active', true)
      .order('step_order'),

    supabase
      .from('lead_sequence_runs')
      .select(`
        id, lead_id, status, cancelled_reason,
        current_step_order, next_send_at,
        started_at, last_sent_at, completed_at,
        leads!inner (first_name, last_name)
      `)
      .eq('sequence_id', sequenceId)
      .eq('tenant_id', tenantId)
      .order('started_at', { ascending: false })
      .limit(50),

    // Channels pointing to this sequence
    supabase
      .from('acquisition_channels')
      .select('id, name, slug')
      .eq('tenant_id', tenantId)
      .eq('email_sequence_id', sequenceId),
  ])

  if (!seqRow) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = seqRow as any
  const id  = row.id as string

  const steps: SequenceStep[] = (stepRows ?? []).map(s => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sr = s as any
    return {
      id:               sr.id,
      stepOrder:        sr.step_order,
      delayHours:       sr.delay_hours,
      subject:          sr.subject,
      active:           sr.active,
      resendTemplateId: sr.resend_template_id,
    }
  })

  const runs: SequenceRun[] = (runRows ?? []).map(r => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rr   = r as any
    const lead = rr.leads
    return {
      id:               rr.id,
      leadId:           rr.lead_id,
      leadName:         lead ? `${lead.first_name} ${lead.last_name}` : rr.lead_id,
      status:           rr.status,
      cancelledReason:  rr.cancelled_reason,
      currentStepOrder: rr.current_step_order,
      nextSendAt:       rr.next_send_at,
      startedAt:        rr.started_at,
      lastSentAt:       rr.last_sent_at,
      completedAt:      rr.completed_at,
    }
  })

  const counts = { active: 0, completed: 0, cancelled: 0 }
  for (const r of runs) {
    if (r.status === 'active')    counts.active++
    if (r.status === 'completed') counts.completed++
    if (r.status === 'cancelled') counts.cancelled++
  }

  const channels: SequenceChannel[] = (channelRows ?? []).map(c => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cr = c as any
    return { id: cr.id, name: cr.name, slug: cr.slug }
  })

  return {
    id,
    tenantId:          row.tenant_id,
    name:              row.name,
    language:          row.language ?? 'es',
    description:       row.description ?? null,
    active:            row.active,
    channels,
    steps,
    stepCount:         steps.length,
    activeRunCount:    counts.active,
    completedRunCount: counts.completed,
    cancelledRunCount: counts.cancelled,
    createdAt:         row.created_at,
    runs,
  }
}
