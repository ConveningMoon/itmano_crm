import { cache } from 'react'
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
  activationType:    'form' | 'manual' | 'tag'
  // Etiqueta que dispara la secuencia (117); null salvo activationType 'tag'.
  triggerTagId:      string | null
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

// ─── Lecturas compartidas ─────────────────────────────────────────────────────
//
// Los pasos activos y las corridas de un tenant los necesitan DOS superficies
// de la misma página (/emails): la lista de secuencias y el panel de cobertura
// por etiqueta. Cada una los pedía por su cuenta con filtros distintos, así
// que eran cuatro round-trips por las mismas dos tablas. Aquí se leen una vez
// por request (cache()) y cada llamador filtra en memoria: son filas de un id
// y un estado, y el tenant más grande tiene decenas de secuencias.

export interface StepRow {
  id: string; sequence_id: string; step_order: number; delay_hours: number
  subject: string | null; resend_template_id: string | null; body_json: unknown; active: boolean
}
export interface RunRow { sequence_id: string; status: string }

/** Pasos ACTIVOS del tenant, ordenados. tenantId null = super_admin (todos). */
export const getActiveStepsFor = cache(async function getActiveStepsFor(
  tenantId: string | null,
): Promise<StepRow[]> {
  const supabase = createAdminClient()
  let q = supabase
    .from('email_sequence_steps')
    .select('id, sequence_id, step_order, delay_hours, subject, resend_template_id, body_json, active')
    .eq('active', true)
    .order('step_order')
  if (tenantId) q = q.eq('tenant_id', tenantId)
  const { data } = await q
  return (data ?? []) as unknown as StepRow[]
})

/** Corridas del tenant (sequence_id + status). tenantId null = todos. */
export const getSequenceRunsFor = cache(async function getSequenceRunsFor(
  tenantId: string | null,
): Promise<RunRow[]> {
  const supabase = createAdminClient()
  let q = supabase.from('lead_sequence_runs').select('sequence_id, status')
  if (tenantId) q = q.eq('tenant_id', tenantId)
  const { data } = await q
  return (data ?? []) as unknown as RunRow[]
})

// ─── Data access ──────────────────────────────────────────────────────────────

// PostgREST devuelve una relación to-one embebida como objeto (o como arreglo
// de uno en algunas versiones): se normaliza a un solo nombre.
function embeddedName(rel: unknown): string | null {
  const r = Array.isArray(rel) ? rel[0] : rel
  return (r as { name?: string } | null | undefined)?.name ?? null
}

// Qué secuencias devuelve la lista:
//   'all'     → todas (analítica: una secuencia de etiqueta también envía).
//   'channel' → las que NO dispara una etiqueta. Es lo que /emails muestra en su
//               pestaña de secuencias y lo único enganchable a una fuente: las
//               de etiqueta tienen su propia pestaña y su propio disparador.
//   'tag'     → sólo las disparadas por etiqueta.
export type SequenceKind = 'all' | 'channel' | 'tag'

// tenantId = null → super_admin: no tenant filter, fetches all tenants
// tenantId = ''   → edge-case: returns empty (no valid tenant)
// agentId != null → role 'agent': only sequences owned by that agent (excludes the
//                   "Toda la agencia" rows where agent_id IS NULL).
export async function listSequences(
  tenantId: string | null,
  agentId: string | null = null,
  kind: SequenceKind = 'all',
): Promise<EmailSequence[]> {
  if (tenantId === '') return []

  const supabase = createAdminClient()

  // El nombre del agente dueño y el del tenant (super_admin) vienen embebidos
  // por FK en el mismo viaje: antes eran dos consultas más, en serie, después
  // de esta ola.
  let seqQ = supabase
    .from('email_sequences')
    .select('id, tenant_id, name, language, description, active, activation_type, agent_id, trigger_tag_id, created_at, agents(name), tenants(name)')
    .order('created_at')
  if (tenantId) seqQ = seqQ.eq('tenant_id', tenantId)
  if (agentId)  seqQ = seqQ.eq('agent_id', agentId)
  if (kind === 'channel') seqQ = seqQ.is('trigger_tag_id', null)
  if (kind === 'tag')     seqQ = seqQ.not('trigger_tag_id', 'is', null)

  let channelQ = supabase
    .from('acquisition_channels')
    .select('id, name, slug, channel_type, email_sequence_id')
    .not('email_sequence_id', 'is', null)
  if (tenantId) channelQ = channelQ.eq('tenant_id', tenantId)

  // Pasos y corridas salen de los getters compartidos: en /emails el panel de
  // cobertura por etiqueta pide exactamente lo mismo.
  const [
    { data: seqRows },
    stepRows,
    runRows,
    { data: channelRows },
  ] = await Promise.all([
    seqQ,
    getActiveStepsFor(tenantId),
    getSequenceRunsFor(tenantId),
    channelQ,
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

  return (seqRows ?? []).map(s => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row    = s as any
    const id     = row.id as string
    const counts = runCountsBySeq.get(id) ?? { active: 0, completed: 0, cancelled: 0 }
    const steps  = stepsBySeq.get(id) ?? []
    return {
      id,
      tenantId:          row.tenant_id,
      tenantName:        tenantId ? null : (embeddedName(row.tenants) ?? null),
      name:              row.name,
      language:          row.language ?? 'es',
      description:       row.description ?? null,
      active:            row.active,
      activationType:    (row.activation_type ?? 'form') as 'form' | 'manual' | 'tag',
      triggerTagId:      row.trigger_tag_id ?? null,
      agentId:           row.agent_id ?? null,
      agentName:         row.agent_id ? (embeddedName(row.agents) ?? null) : null,
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
    .select('id, tenant_id, name, language, description, active, activation_type, agent_id, trigger_tag_id, created_at, agents(name), tenants(name)')
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

  // Nombres embebidos por FK en la misma consulta (ver listSequences).
  const tenantName: string | null = tenantId ? null : (embeddedName(row.tenants) ?? null)
  const agentName:  string | null = row.agent_id ? (embeddedName(row.agents) ?? null) : null

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
    activationType:    (row.activation_type ?? 'form') as 'form' | 'manual' | 'tag',
    triggerTagId:      row.trigger_tag_id ?? null,
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
