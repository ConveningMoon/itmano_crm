import { z } from 'zod'
import { STAGES } from '@/lib/scoring/priority'
import { planTagFilter, type TagRef } from '@/lib/leads/tags'
import type { LeadListFilters } from '@/lib/leads/list-filters'
import { MAX_BROADCAST_RECIPIENTS } from './model'

// A quién le llega un correo grupal. PURO. Se guarda como FILTRO y no como
// lista: la lista real se congela al enviar, con los datos de ese momento.
//
//   segment — los criterios de /leads, más varias etiquetas y varias etapas.
//   manual  — leads elegidos uno por uno.

const Filter = z.string().trim().min(1).max(100)

const SegmentSchema = z.object({
  mode:            z.literal('segment'),
  tagIds:          z.array(z.string().uuid()).max(30).default([]),
  tagMatch:        z.enum(['any', 'all']).default('any'),
  stages:          z.array(z.enum(STAGES)).max(STAGES.length).default([]),
  agentId:         Filter.default('all'),
  channelId:       Filter.default('all'),
  source:          Filter.default('all'),
  language:        Filter.default('all'),
  quality:         Filter.default('all'),
  q:               z.string().trim().max(100).default(''),
  excludeImported: z.boolean().default(false),
  excludedLeadIds: z.array(z.string().min(1).max(100)).max(MAX_BROADCAST_RECIPIENTS).default([]),
})

const ManualSchema = z.object({
  mode:    z.literal('manual'),
  leadIds: z.array(z.string().min(1).max(100)).max(MAX_BROADCAST_RECIPIENTS).default([]),
})

export const BroadcastAudienceSchema = z.discriminatedUnion('mode', [SegmentSchema, ManualSchema])

export type BroadcastAudience = z.infer<typeof BroadcastAudienceSchema>
export type SegmentAudience   = z.infer<typeof SegmentSchema>
export type ManualAudience    = z.infer<typeof ManualSchema>

export const EMPTY_SEGMENT: SegmentAudience = {
  mode: 'segment', tagIds: [], tagMatch: 'any', stages: [], agentId: 'all', channelId: 'all',
  source: 'all', language: 'all', quality: 'all', q: '', excludeImported: false, excludedLeadIds: [],
}

/** Lo guardado en la base; lo que no valide no selecciona a nadie. */
export function parseBroadcastAudience(raw: unknown): BroadcastAudience {
  const parsed = BroadcastAudienceSchema.safeParse(raw)
  return parsed.success ? parsed.data : EMPTY_SEGMENT
}

/**
 * "Sin criterios" nunca puede significar "todos los leads": una audiencia así
 * no selecciona a nadie. Excluir no es un criterio, porque no acota por sí solo.
 */
export function hasAudienceCriteria(a: BroadcastAudience): boolean {
  if (a.mode === 'manual') return a.leadIds.length > 0
  return a.tagIds.length > 0 || a.stages.length > 0 || a.q !== '' ||
    [a.agentId, a.channelId, a.source, a.language, a.quality].some(v => v !== 'all')
}

/** Los filtros activos de /leads como audiencia de un correo grupal. */
export function segmentFromLeadFilters(filters: LeadListFilters, tags: TagRef[]): SegmentAudience {
  const tag = planTagFilter(filters.tag, tags)
  return {
    ...EMPTY_SEGMENT,
    tagIds:    tag.tagId ? [tag.tagId] : [],
    stages:    (STAGES as readonly string[]).includes(filters.stage) ? [filters.stage as SegmentAudience['stages'][number]] : [],
    agentId:   filters.agentId,
    channelId: filters.channelId,
    source:    filters.source,
    language:  filters.language,
    quality:   filters.quality,
    q:         filters.q,
  }
}
