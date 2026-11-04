import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { applyLeadListFilters } from '@/lib/data/leads'
import { chunk, summarizeAudience, decideRecipient, type AudienceSummary } from '@/lib/open-houses/audience'
import { loadAudienceLeads } from '@/lib/services/open-house-audience'
import { columns } from '@/lib/supabase/columns'
import { hasAudienceCriteria, type BroadcastAudience, type SegmentAudience } from '@/lib/broadcasts/audience'
import { MAX_BROADCAST_RECIPIENTS } from '@/lib/broadcasts/model'
import { LEADS_PAGE_SIZE, planSourceFilter, type LeadListFilters } from '@/lib/leads/list-filters'

// Resuelve la audiencia de un correo grupal contra la base. Corre con el admin
// client, así que el tenant y el alcance del agente van siempre en la consulta.
//
// `scopeAgentId` es el alcance de quien creó el envío: un agente sólo puede
// escribir a sus leads, y se vuelve a aplicar aquí aunque el filtro guardado
// diga otra cosa.

/* eslint-disable @typescript-eslint/no-explicit-any */

const PAGE = 1000
const IDS_PER_QUERY = 200

const CHANNEL_COLUMNS = columns('acquisition_channels', ['id', 'channel_type'])

export interface ResolvedAudience {
  ids:      string[]
  /** La audiencia pasa del tope por envío; `ids` está truncada. */
  overflow: boolean
}

function filtersOf(a: SegmentAudience): LeadListFilters {
  return {
    q: a.q, agentId: a.agentId, stage: 'all', source: a.source, channelId: a.channelId,
    language: a.language, quality: a.quality, tag: 'all', sort: 'recientes', view: 'table', page: 1,
  }
}

async function resolveSegment(
  db: SupabaseClient,
  tenantId: string,
  scopeAgentId: string | null,
  a: SegmentAudience,
): Promise<ResolvedAudience> {
  let channels: { id: string; channelType: string }[] = []
  if (a.source !== 'all') {
    const { data, error } = await db.from('acquisition_channels').select(CHANNEL_COLUMNS).eq('tenant_id', tenantId)
    if (error) throw new Error(error.message)
    channels = ((data ?? []) as any[]).map(c => ({ id: c.id as string, channelType: c.channel_type as string }))
    if (planSourceFilter(a.source, channels).impossible) return { ids: [], overflow: false }
  }

  const excluded = new Set(a.excludedLeadIds)
  const limit = MAX_BROADCAST_RECIPIENTS + 1
  const ids: string[] = []
  for (let from = 0; ids.length < limit; from += PAGE) {
    let q = applyLeadListFilters(
      db.from('leads_list').select('id'),
      { tenantId, agentId: scopeAgentId },
      filtersOf(a),
      channels,
      [],
    )
    if (a.stages.length > 0) q = q.in('stage', a.stages)
    if (a.tagIds.length > 0) q = a.tagMatch === 'all' ? q.contains('tag_ids', a.tagIds) : q.overlaps('tag_ids', a.tagIds)
    // `neq` a secas dejaría fuera a los leads sin traffic_source.
    if (a.excludeImported) q = q.or('traffic_source.is.null,traffic_source.neq.import')
    const { data, error } = await q.order('id').range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as { id: string }[]
    for (const r of rows) if (!excluded.has(r.id)) ids.push(r.id)
    if (rows.length < PAGE) break
  }
  return { ids: ids.slice(0, MAX_BROADCAST_RECIPIENTS), overflow: ids.length > MAX_BROADCAST_RECIPIENTS }
}

export async function resolveBroadcastLeadIds(
  db: SupabaseClient,
  tenantId: string,
  scopeAgentId: string | null,
  audience: BroadcastAudience,
): Promise<ResolvedAudience> {
  // Sin criterios no se selecciona a nadie: nunca "todos los leads".
  if (!hasAudienceCriteria(audience)) return { ids: [], overflow: false }
  if (audience.mode === 'segment') return resolveSegment(db, tenantId, scopeAgentId, audience)

  const ids: string[] = []
  for (const part of chunk([...new Set(audience.leadIds)], IDS_PER_QUERY)) {
    let q = db.from('leads').select('id').eq('tenant_id', tenantId).in('id', part)
    if (scopeAgentId) q = q.eq('agent_id', scopeAgentId)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    ids.push(...((data ?? []) as { id: string }[]).map(r => r.id))
  }
  return { ids, overflow: false }
}

export interface AudiencePreviewRow {
  id:     string
  name:   string
  email:  string | null
  send:   boolean
  reason: string | null
}

export interface BroadcastAudiencePreview {
  summary:  AudienceSummary
  overflow: boolean
  /** Leads traídos de otro CRM: pueden no haber dado su consentimiento. */
  imported: number
  /** Los primeros de la lista, para revisarlos y quitar a quien no toque. */
  rows:     AudiencePreviewRow[]
}

const PREVIEW_ROWS = 200

async function countImported(db: SupabaseClient, tenantId: string, ids: string[]): Promise<number> {
  let total = 0
  for (const part of chunk(ids, IDS_PER_QUERY)) {
    const { count, error } = await db
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('traffic_source', 'import')
      .in('id', part)
    if (error) throw new Error(error.message)
    total += count ?? 0
  }
  return total
}

export async function previewBroadcastRecipients(
  db: SupabaseClient,
  tenantId: string,
  scopeAgentId: string | null,
  audience: BroadcastAudience,
  languages: readonly string[],
): Promise<BroadcastAudiencePreview> {
  const { ids, overflow } = await resolveBroadcastLeadIds(db, tenantId, scopeAgentId, audience)
  const [leads, imported] = await Promise.all([
    loadAudienceLeads(db, tenantId, ids),
    countImported(db, tenantId, ids),
  ])
  return {
    summary: summarizeAudience(leads, languages),
    overflow,
    imported,
    rows: leads.slice(0, PREVIEW_ROWS).map(lead => {
      const d = decideRecipient(lead, languages)
      return { id: lead.id, name: lead.firstName, email: lead.email, send: d.send, reason: d.send ? null : d.reason }
    }),
  }
}

// Reexportado para que la pantalla de búsqueda manual pagine igual que /leads.
export const LEAD_SEARCH_LIMIT = Math.min(20, LEADS_PAGE_SIZE)
