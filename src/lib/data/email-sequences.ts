import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SequenceChannel {
  id:          string
  name:        string
  slug:        string
  // lead_magnet | event | contact_form | manychat_flow | manual
  channelType: string
}

export interface SequenceStep {
  id:               string
  stepOrder:        number
  delayHours:       number
  subject:          string | null
  active:           boolean
  resendTemplateId: string | null
  // Contenido CRM del composer ({ v, paragraphs, cta, include_signature }) o
  // null cuando el step usa un template de Resend (modo legacy).
  bodyJson:         unknown
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
  id:                string
  tenantId:          string
  tenantName:        string | null   // populated when queried as super_admin (null tenantId filter)
  name:              string
  language:          string
  description:       string | null
  active:            boolean
  activationType:    'form' | 'manual'
  agentId:           string | null   // organizational owner (null = "Toda la agencia")
  agentName:         string | null   // resolved display
  channels:          SequenceChannel[]
  steps:             SequenceStep[]
  stepCount:         number
  activeRunCount:    number
  completedRunCount: number
  cancelledRunCount: number
  createdAt:         string
}

// ─── Data access ──────────────────────────────────────────────────────────────

// tenantId = null → super_admin: no tenant filter, fetches all tenants
// tenantId = ''   → edge-case: returns empty (no valid tenant)
// agentId != null → role 'agent': only sequences owned by that agent (excludes the
//                   "Toda la agencia" rows where agent_id IS NULL).
export async function listSequences(
  tenantId: string | null,
  agentId: string | null = null,
): Promise<EmailSequence[]> {
  if (tenantId === '') return []

  const supabase = createAdminClient()

  let seqQ = supabase
    .from('email_sequences')
    .select('id, tenant_id, name, language, description, active, activation_type, agent_id, created_at')
    .order('created_at')
  if (tenantId) seqQ = seqQ.eq('tenant_id', tenantId)
  if (agentId)  seqQ = seqQ.eq('agent_id', agentId)

  let stepQ = supabase
    .from('email_sequence_steps')
    .select('id, sequence_id, step_order, delay_hours, subject, resend_template_id, body_json, active')
    .eq('active', true)
    .order('step_order')
  if (tenantId) stepQ = stepQ.eq('tenant_id', tenantId)

  let runQ = supabase
    .from('lead_sequence_runs')
    .select('sequence_id, status')
  if (tenantId) runQ = runQ.eq('tenant_id', tenantId)

  let channelQ = supabase
    .from('acquisition_channels')
    .select('id, name, slug, channel_type, email_sequence_id')
    .not('email_sequence_id', 'is', null)
  if (tenantId) channelQ = channelQ.eq('tenant_id', tenantId)

  const [
    { data: seqRows },
    { data: stepRows },
    { data: runRows },
    { data: channelRows },
  ] = await Promise.all([seqQ, stepQ, runQ, channelQ])

  // For super_admin: look up tenant names
  const tenantNameMap = new Map<string, string>()
  if (!tenantId && seqRows && seqRows.length > 0) {
    const tids = [...new Set((seqRows as { tenant_id: string }[]).map(s => s.tenant_id))]
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id, name')
      .in('id', tids)
    for (const t of tenants ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tenantNameMap.set((t as any).id, (t as any).name)
    }
  }

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
      bodyJson:         row.body_json ?? null,
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

  const channelsBySeq = new Map<string, SequenceChannel[]>()
  for (const c of channelRows ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = c as any
    const sid = row.email_sequence_id as string
    if (!channelsBySeq.has(sid)) channelsBySeq.set(sid, [])
    channelsBySeq.get(sid)!.push({ id: row.id, name: row.name, slug: row.slug, channelType: row.channel_type })
  }

  // Resolve sequence agent names in one batch.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentIds = [...new Set((seqRows ?? []).map((s: any) => s.agent_id).filter(Boolean))] as string[]
  const agentNameMap = new Map<string, string>()
  if (agentIds.length > 0) {
    const { data: ag } = await supabase.from('agents').select('id, name').in('id', agentIds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of (ag ?? []) as any[]) agentNameMap.set(a.id, a.name)
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
      tenantName:        tenantNameMap.get(row.tenant_id) ?? null,
      name:              row.name,
      language:          row.language ?? 'es',
      description:       row.description ?? null,
      active:            row.active,
      activationType:    (row.activation_type ?? 'form') as 'form' | 'manual',
      agentId:           row.agent_id ?? null,
      agentName:         row.agent_id ? (agentNameMap.get(row.agent_id) ?? null) : null,
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
  tenantId: string | null,
  sequenceId: string,
  agentId: string | null = null,
): Promise<(EmailSequence & { runs: SequenceRun[] }) | null> {
  if (tenantId === '') return null

  const supabase = createAdminClient()

  let seqQ = supabase
    .from('email_sequences')
    .select('id, tenant_id, name, language, description, active, activation_type, agent_id, created_at')
    .eq('id', sequenceId)
  if (tenantId) seqQ = seqQ.eq('tenant_id', tenantId)
  // Agent visibility: a non-owned (or "Toda la agencia") sequence resolves to null → 404.
  if (agentId)  seqQ = seqQ.eq('agent_id', agentId)

  const [
    { data: seqRow },
    { data: stepRows },
    { data: runRows },
    { data: channelRows },
  ] = await Promise.all([
    seqQ.single(),

    supabase
      .from('email_sequence_steps')
      .select('id, sequence_id, step_order, delay_hours, subject, resend_template_id, body_json, active')
      .eq('sequence_id', sequenceId)
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
      .order('started_at', { ascending: false })
      .limit(50),

    supabase
      .from('acquisition_channels')
      .select('id, name, slug, channel_type')
      .eq('email_sequence_id', sequenceId),
  ])

  if (!seqRow) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = seqRow as any
  const id  = row.id as string

  // Tenant name for super_admin
  let tenantName: string | null = null
  if (!tenantId) {
    const { data: t } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', row.tenant_id)
      .single()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tenantName = (t as any)?.name ?? null
  }

  // Sequence agent name (null = whole agency)
  let agentName: string | null = null
  if (row.agent_id) {
    const { data: a } = await supabase.from('agents').select('name').eq('id', row.agent_id).maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agentName = (a as any)?.name ?? null
  }

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
      bodyJson:         sr.body_json ?? null,
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

  return {
    id,
    tenantId:          row.tenant_id,
    tenantName,
    name:              row.name,
    language:          row.language ?? 'es',
    description:       row.description ?? null,
    active:            row.active,
    activationType:    (row.activation_type ?? 'form') as 'form' | 'manual',
    agentId:           row.agent_id ?? null,
    agentName:         agentName,
    channels:          (channelRows ?? []).map(c => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cr = c as any
      return { id: cr.id, name: cr.name, slug: cr.slug, channelType: cr.channel_type }
    }),
    steps,
    stepCount:         steps.length,
    activeRunCount:    counts.active,
    completedRunCount: counts.completed,
    cancelledRunCount: counts.cancelled,
    createdAt:         row.created_at,
    runs,
  }
}
