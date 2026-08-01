import { channelTypesForKind, trafficSourcesForKind } from './source'
import type { Stage, QualityBand, Urgency } from '@/lib/scoring/priority'
import type { Language, LeadStatus } from '@/lib/types'

// Contrato de la lista de leads: tipos, parseo de searchParams y traducción del
// filtro de fuente a condiciones sobre columnas.
//
// Vive aparte de src/lib/data/leads.ts porque esto es puro y lo comparten el
// servidor y el cliente; el módulo de datos importa Supabase y es server-only.

export const LEADS_PAGE_SIZE = 20

// Tope de tarjetas por columna del kanban. El conteo de la cabecera es el real:
// el tope acota el payload, no la verdad.
export const KANBAN_COLUMN_LIMIT = 50

export type LeadSortMode = 'recientes' | 'atencion' | 'prioridad'
export type LeadsView    = 'table' | 'kanban'

// Fila de la lista — sólo lo que la tabla, el kanban y el CSV renderizan.
// Deliberadamente NO incluye notes, metadata, fit_profile ni los sub-scores.
export interface LeadListItem {
  id:                   string
  agentId:              string
  acquisitionChannelId: string | null
  trafficSource:        string | null
  firstName:            string
  lastName:             string
  email:                string
  phone:                string | null
  language:             Language
  status:               LeadStatus
  score:                number | null
  attentionWhen:        'hoy' | 'esta_semana' | 'sin_apuro' | null
  // Los tres ejes del rediseno (migracion 076). `null` solo en filas heredadas
  // que aun no pasaron por el trigger.
  stage:                Stage | null
  qualityBand:          QualityBand | null
  qualityScore:         number | null
  urgency:              Urgency | null
  urgencyRank:          number
  createdAt:            string
}

export interface LeadListFilters {
  q:         string
  agentId:   string  // 'all' | agents.id
  status:    string  // 'all' | LeadStatus
  source:    string  // 'all' | kind de getLeadSource
  channelId: string  // 'all' | acquisition_channels.id
  language:  string  // 'all' | es | en | pt
  quality:   string  // 'all' | QualityBand
  sort:      LeadSortMode
  view:      LeadsView
  page:      number
}

// Canal tal como lo necesita el resolvedor del filtro de fuente.
export interface ChannelRef {
  id:          string
  channelType: string
}

export interface KanbanColumn {
  key:   string
  total: number
  items: LeadListItem[]
}

export interface LeadsListData {
  items:               LeadListItem[]
  kanban:              KanbanColumn[] | null
  total:               number
  // Leads de calidad ALTA en el filtro actual. Sustituye al viejo conteo por
  // `current_score >= 70`, umbral que ya no significa nada en el modelo nuevo.
  highQualityCount:    number
  attentionTodayCount: number
  page:                number
  totalPages:          number
}

// Columnas del kanban → estados que agrupa cada una. Compartido con la UI para
// que el conteo del servidor y las tarjetas no puedan divergir.
export const KANBAN_COLUMN_STATUSES: Record<string, LeadStatus[]> = {
  new:             ['new'],
  nurturing:       ['nurturing'],
  warm:            ['warm'],
  hot:             ['hot'],
  process_started: ['process_started'],
  finished:        ['closed', 'process_completed', 'lost'],
}

// ─── searchParams → filtros ───────────────────────────────────────────────────

type RawParams = Record<string, string | string[] | undefined>

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

const SORT_MODES: LeadSortMode[] = ['recientes', 'atencion', 'prioridad']

export function parseLeadListFilters(params: RawParams): LeadListFilters {
  const rawSort = one(params.sort) as LeadSortMode | undefined
  const sort: LeadSortMode = rawSort && SORT_MODES.includes(rawSort) ? rawSort : 'recientes'
  const view = one(params.view) === 'kanban'   ? 'kanban'   : 'table'
  const rawPage = Number.parseInt(one(params.page) ?? '1', 10)

  return {
    q:         (one(params.q) ?? '').trim(),
    agentId:   one(params.agent)     || 'all',
    status:    one(params.status)    || 'all',
    source:    one(params.source)    || 'all',
    channelId: one(params.channelId) || 'all',
    language:  one(params.lang)      || 'all',
    quality:   one(params.quality)   || 'all',
    sort,
    view,
    page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
  }
}

// El inverso: filtros → query string canónico (omite los valores por defecto para
// que /leads sin parámetros sea la URL limpia).
export function leadListFiltersToQuery(filters: LeadListFilters): string {
  const p = new URLSearchParams()
  if (filters.q)                         p.set('q',         filters.q)
  if (filters.agentId   !== 'all')       p.set('agent',     filters.agentId)
  if (filters.status    !== 'all')       p.set('status',    filters.status)
  if (filters.source    !== 'all')       p.set('source',    filters.source)
  if (filters.channelId !== 'all')       p.set('channelId', filters.channelId)
  if (filters.language  !== 'all')       p.set('lang',      filters.language)
  if (filters.quality   !== 'all')       p.set('quality',   filters.quality)
  if (filters.sort      !== 'recientes') p.set('sort',      filters.sort)
  if (filters.view      !== 'table')     p.set('view',      filters.view)
  if (filters.page > 1)                  p.set('page',      String(filters.page))
  return p.toString()
}

export function hasActiveLeadFilters(f: LeadListFilters): boolean {
  return f.q !== '' ||
    f.agentId   !== 'all' ||
    f.status    !== 'all' ||
    f.source    !== 'all' ||
    f.channelId !== 'all' ||
    f.language  !== 'all' ||
    f.quality   !== 'all'
}

// ─── Filtro de fuente ─────────────────────────────────────────────────────────

// El filtro de fuente es compuesto (tipo de canal si el lead tiene canal, si no
// su traffic_source). Se resuelve contra los canales del tenant.
export interface SourceFilterPlan {
  channelIds:     string[]
  trafficSources: string[]
  // true cuando el kind no puede casar con nada → la lista es vacía sin ir a la BD.
  impossible:     boolean
}

export function planSourceFilter(kind: string, channels: ChannelRef[]): SourceFilterPlan {
  const types          = channelTypesForKind(kind)
  const trafficSources = trafficSourcesForKind(kind)
  const channelIds     = channels.filter(c => types.includes(c.channelType)).map(c => c.id)
  return {
    channelIds,
    trafficSources,
    impossible: channelIds.length === 0 && trafficSources.length === 0,
  }
}

// Escapa los comodines de LIKE para que un '%' escrito por el usuario busque un
// '%' literal y no toda la tabla.
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, m => `\\${m}`)
}
