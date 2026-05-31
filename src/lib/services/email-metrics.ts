import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SequenceMetrics {
  totalSends:      number
  uniqueLeads:     number
  openRate:        number  // 0–100, distinct-lead-based
  clickRate:       number
  replyRate:       number
  bounceRate:      number
  unsubscribeRate: number
}

export interface StepMetric {
  stepOrder:  number
  totalSends: number
  openRate:   number
  clickRate:  number
  replyRate:  number
}

export interface SequenceSummary {
  sequenceId:      string
  sequenceName:    string
  totalSends:      number
  openRate:        number
  clickRate:       number
  replyRate:       number
  bounceRate:      number
  unsubscribeRate: number
}

export interface GlobalEmailMetrics {
  totalSends:      number
  uniqueLeads:     number
  openRate:        number
  clickRate:       number
  replyRate:       number
  bounceRate:      number
  unsubscribeRate: number
  bySequence:      SequenceSummary[]
}

// ─── Internal helpers ──────────────────────────────────────────────────────

type SendRow   = { lead_id: string; step_order: number; sent_at: string }
type EventRow  = { lead_id: string; type: string; created_at: string }

function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0
  return Math.round((numerator / denominator) * 100)
}

// Distinct leads who had an event of `type` after any send in the set.
// Deduplication: if a lead appears in multiple sends, one event after the
// EARLIEST send for that lead suffices.
function distinctLeadsWithEvent(sends: SendRow[], events: EventRow[], eventType: string): number {
  const firstSendByLead = new Map<string, number>() // lead_id → earliest sent_at ms
  for (const s of sends) {
    const t = new Date(s.sent_at).getTime()
    const existing = firstSendByLead.get(s.lead_id)
    if (existing === undefined || t < existing) firstSendByLead.set(s.lead_id, t)
  }

  const matched = new Set<string>()
  for (const e of events) {
    if (e.type !== eventType) continue
    const sentAt = firstSendByLead.get(e.lead_id)
    if (sentAt === undefined) continue
    if (new Date(e.created_at).getTime() >= sentAt) matched.add(e.lead_id)
  }
  return matched.size
}

function buildMetrics(sends: SendRow[], events: EventRow[]): Omit<SequenceMetrics, 'totalSends' | 'uniqueLeads'> {
  const uniqueLeads = new Set(sends.map(s => s.lead_id)).size
  return {
    openRate:        pct(distinctLeadsWithEvent(sends, events, 'email_opened'),       uniqueLeads),
    clickRate:       pct(distinctLeadsWithEvent(sends, events, 'email_clicked'),      uniqueLeads),
    replyRate:       pct(distinctLeadsWithEvent(sends, events, 'email_replied'),      uniqueLeads),
    bounceRate:      pct(distinctLeadsWithEvent(sends, events, 'email_hard_bounce'),  uniqueLeads),
    unsubscribeRate: pct(distinctLeadsWithEvent(sends, events, 'email_unsubscribed'), uniqueLeads),
  }
}

const EMAIL_EVENT_TYPES = [
  'email_opened', 'email_clicked', 'email_replied',
  'email_hard_bounce', 'email_unsubscribed',
]

// ─── Fetch helpers ─────────────────────────────────────────────────────────

async function fetchRunIdsForSequence(db: ReturnType<typeof createAdminClient>, sequenceId: string): Promise<string[]> {
  const { data } = await db
    .from('lead_sequence_runs')
    .select('id')
    .eq('sequence_id', sequenceId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => r.id as string)
}

async function fetchSendsForRuns(db: ReturnType<typeof createAdminClient>, runIds: string[]): Promise<SendRow[]> {
  if (runIds.length === 0) return []
  const { data } = await db
    .from('email_sends')
    .select('lead_id, step_order, sent_at')
    .in('sequence_run_id', runIds)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any[]
}

async function fetchEventsForLeads(db: ReturnType<typeof createAdminClient>, leadIds: string[]): Promise<EventRow[]> {
  if (leadIds.length === 0) return []
  const { data } = await db
    .from('lead_events')
    .select('lead_id, type, created_at')
    .in('lead_id', leadIds)
    .in('type', EMAIL_EVENT_TYPES)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any[]
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function getSequenceMetrics(sequenceId: string): Promise<SequenceMetrics> {
  const db     = createAdminClient()
  const runIds = await fetchRunIdsForSequence(db, sequenceId)
  const sends  = await fetchSendsForRuns(db, runIds)

  if (sends.length === 0) {
    return { totalSends: 0, uniqueLeads: 0, openRate: 0, clickRate: 0, replyRate: 0, bounceRate: 0, unsubscribeRate: 0 }
  }

  const leadIds = [...new Set(sends.map(s => s.lead_id))]
  const events  = await fetchEventsForLeads(db, leadIds)

  return {
    totalSends:  sends.length,
    uniqueLeads: leadIds.length,
    ...buildMetrics(sends, events),
  }
}

export async function getStepMetrics(sequenceId: string): Promise<StepMetric[]> {
  const db     = createAdminClient()
  const runIds = await fetchRunIdsForSequence(db, sequenceId)
  const sends  = await fetchSendsForRuns(db, runIds)

  if (sends.length === 0) return []

  const leadIds = [...new Set(sends.map(s => s.lead_id))]
  const events  = await fetchEventsForLeads(db, leadIds)

  // Group sends by step_order
  const byStep = new Map<number, SendRow[]>()
  for (const s of sends) {
    if (!byStep.has(s.step_order)) byStep.set(s.step_order, [])
    byStep.get(s.step_order)!.push(s)
  }

  return [...byStep.entries()]
    .sort(([a], [b]) => a - b)
    .map(([stepOrder, stepSends]) => {
      const uniqueLeads = new Set(stepSends.map(s => s.lead_id)).size
      return {
        stepOrder,
        totalSends: stepSends.length,
        openRate:   pct(distinctLeadsWithEvent(stepSends, events, 'email_opened'),  uniqueLeads),
        clickRate:  pct(distinctLeadsWithEvent(stepSends, events, 'email_clicked'), uniqueLeads),
        replyRate:  pct(distinctLeadsWithEvent(stepSends, events, 'email_replied'), uniqueLeads),
      }
    })
}

// tenantId = null → super_admin: aggregate across all tenants
export async function getGlobalEmailMetrics(tenantId: string | null): Promise<GlobalEmailMetrics> {
  const db = createAdminClient()

  // Fetch all sequences for this tenant (or all tenants)
  let seqQ = db.from('email_sequences').select('id, name')
  if (tenantId) seqQ = seqQ.eq('tenant_id', tenantId)
  const { data: seqRows } = await seqQ

  if (!seqRows || seqRows.length === 0) {
    return { totalSends: 0, uniqueLeads: 0, openRate: 0, clickRate: 0, replyRate: 0, bounceRate: 0, unsubscribeRate: 0, bySequence: [] }
  }

  // For each sequence, get runs → sends → events
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seqList = seqRows as any[]
  const allSummaries: SequenceSummary[] = []
  const allSends:  SendRow[]  = []
  const allLeadIds = new Set<string>()

  for (const seq of seqList) {
    const runIds = await fetchRunIdsForSequence(db, seq.id)
    const sends  = await fetchSendsForRuns(db, runIds)
    if (sends.length === 0) {
      allSummaries.push({ sequenceId: seq.id, sequenceName: seq.name, totalSends: 0, openRate: 0, clickRate: 0, replyRate: 0, bounceRate: 0, unsubscribeRate: 0 })
      continue
    }
    sends.forEach(s => allLeadIds.add(s.lead_id))
    allSends.push(...sends)

    const leadIds = [...new Set(sends.map(s => s.lead_id))]
    const events  = await fetchEventsForLeads(db, leadIds)

    allSummaries.push({
      sequenceId:      seq.id,
      sequenceName:    seq.name,
      totalSends:      sends.length,
      ...buildMetrics(sends, events),
    })
  }

  // Global aggregate
  const allLeadIdsArr = [...allLeadIds]
  const globalEvents  = allLeadIdsArr.length > 0 ? await fetchEventsForLeads(db, allLeadIdsArr) : []

  return {
    totalSends:  allSends.length,
    uniqueLeads: allLeadIds.size,
    ...buildMetrics(allSends, globalEvents),
    bySequence:  allSummaries,
  }
}
