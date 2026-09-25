import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ─────────────────────────────────────────────────────────────────
//
// Open rate is intentionally NOT tracked. Apple Mail Privacy Protection
// pre-fetches tracking pixels, inflating open rates by >50% in many cases,
// making the metric unreliable. Click rate is our primary engagement proxy:
// every ITMANO email carries a CTA link, so a click is a real signal.
//
// Las métricas las agrega Postgres (`sequence_email_metrics`, migración de la
// fase 2 de rendimiento). Antes salían de una cadena de tres consultas en
// serie (runs → envíos → eventos) que /emails pagaba DESPUÉS de tener la lista
// de secuencias, y que /analytics/emails repetía por cada secuencia. Ahora es
// una sola consulta por tenant, que además no depende de ninguna otra lectura
// y puede ir en la misma ola que todo lo demás de la página.
//
// La definición es la misma que tenía el código: un lead cuenta como "hizo
// click" si tiene un evento de ese tipo con fecha igual o posterior a su
// PRIMER envío dentro de la secuencia (o del paso, en el desglose por paso).

export interface SequenceMetrics {
  totalSends:      number
  uniqueLeads:     number
  clickRate:       number
  replyRate:       number
  bounceRate:      number
  unsubscribeRate: number
}

export interface StepMetric {
  stepOrder:  number
  totalSends: number
  clickRate:  number
  replyRate:  number
}

export interface SequenceSummary {
  sequenceId:      string
  sequenceName:    string
  totalSends:      number
  clickRate:       number
  replyRate:       number
  bounceRate:      number
  unsubscribeRate: number
}

export interface GlobalEmailMetrics {
  totalSends:      number
  uniqueLeads:     number
  clickRate:       number
  replyRate:       number
  bounceRate:      number
  unsubscribeRate: number
  bySequence:      SequenceSummary[]
}

// ─── RPC ───────────────────────────────────────────────────────────────────

interface RawMetrics {
  total_sends?:      number
  unique_leads?:     number
  click_rate?:       number
  reply_rate?:       number
  bounce_rate?:      number
  unsubscribe_rate?: number
  steps?: { step_order: number; total_sends: number; click_rate: number; reply_rate: number }[]
}

interface MetricsBundle {
  sequences: Map<string, { metrics: SequenceMetrics; steps: StepMetric[] }>
  total:     SequenceMetrics
}

const EMPTY: SequenceMetrics = {
  totalSends: 0, uniqueLeads: 0, clickRate: 0, replyRate: 0, bounceRate: 0, unsubscribeRate: 0,
}

function toMetrics(raw: RawMetrics | undefined): SequenceMetrics {
  return {
    totalSends:      raw?.total_sends      ?? 0,
    uniqueLeads:     raw?.unique_leads     ?? 0,
    clickRate:       raw?.click_rate       ?? 0,
    replyRate:       raw?.reply_rate       ?? 0,
    bounceRate:      raw?.bounce_rate      ?? 0,
    unsubscribeRate: raw?.unsubscribe_rate ?? 0,
  }
}

/**
 * Una llamada a la RPC por (tenant, conjunto de secuencias) y por request.
 *
 * Deduplicada con cache(): en /emails/[id] la tarjeta de métricas (dentro de
 * Suspense) y el desglose por paso de la página piden lo mismo. `sequenceIds`
 * null = todas las del tenant; tenantId null = todos los tenants (super_admin).
 */
const fetchMetricsBundle = cache(async function fetchMetricsBundle(
  tenantId: string | null,
  // Ids separados por coma (o null = todas): cache() compara argumentos por
  // identidad, y un string se compara por valor; un arreglo nuevo cada vez no.
  sequenceIdsKey: string | null,
): Promise<MetricsBundle> {
  const db = createAdminClient()
  const { data, error } = await db.rpc('sequence_email_metrics', {
    p_tenant_id:    tenantId,
    p_sequence_ids: sequenceIdsKey === null ? null : sequenceIdsKey.split(','),
  })
  if (error) {
    console.error(JSON.stringify({ service: 'email-metrics', error: error.message }))
  }

  const raw = (data ?? {}) as { sequences?: Record<string, RawMetrics>; total?: RawMetrics }
  const sequences = new Map<string, { metrics: SequenceMetrics; steps: StepMetric[] }>()
  for (const [id, m] of Object.entries(raw.sequences ?? {})) {
    sequences.set(id, {
      metrics: toMetrics(m),
      steps: (m.steps ?? []).map(s => ({
        stepOrder:  s.step_order,
        totalSends: s.total_sends,
        clickRate:  s.click_rate,
        replyRate:  s.reply_rate,
      })),
    })
  }
  return { sequences, total: raw.total ? toMetrics(raw.total) : EMPTY }
})

// ─── Public API ────────────────────────────────────────────────────────────

export async function getSequenceMetrics(tenantId: string | null, sequenceId: string): Promise<SequenceMetrics> {
  const bundle = await fetchMetricsBundle(tenantId, sequenceId)
  return bundle.sequences.get(sequenceId)?.metrics ?? EMPTY
}

export async function getStepMetrics(tenantId: string | null, sequenceId: string): Promise<StepMetric[]> {
  const bundle = await fetchMetricsBundle(tenantId, sequenceId)
  return bundle.sequences.get(sequenceId)?.steps ?? []
}

/**
 * Métricas de TODAS las secuencias del tenant, para la lista de /emails.
 *
 * No recibe ids a propósito: así la lectura arranca en paralelo con la lista
 * de secuencias en vez de esperarla. Una secuencia que no esté en el mapa no
 * envió nunca; el llamador la muestra en cero.
 */
export async function getMetricsForSequences(tenantId: string | null): Promise<Map<string, SequenceMetrics>> {
  const bundle = await fetchMetricsBundle(tenantId, null)
  return new Map([...bundle.sequences].map(([id, s]) => [id, s.metrics]))
}

// tenantId = null → super_admin: aggregate across all tenants
export async function getGlobalEmailMetrics(tenantId: string | null): Promise<GlobalEmailMetrics> {
  const db = createAdminClient()

  let seqQ = db.from('email_sequences').select('id, name').order('created_at')
  if (tenantId) seqQ = seqQ.eq('tenant_id', tenantId)

  const [{ data: seqRows }, bundle] = await Promise.all([seqQ, fetchMetricsBundle(tenantId, null)])

  const bySequence: SequenceSummary[] = ((seqRows ?? []) as { id: string; name: string }[]).map(seq => {
    const m = bundle.sequences.get(seq.id)?.metrics ?? EMPTY
    return {
      sequenceId:      seq.id,
      sequenceName:    seq.name,
      totalSends:      m.totalSends,
      clickRate:       m.clickRate,
      replyRate:       m.replyRate,
      bounceRate:      m.bounceRate,
      unsubscribeRate: m.unsubscribeRate,
    }
  })

  return { ...bundle.total, bySequence }
}
