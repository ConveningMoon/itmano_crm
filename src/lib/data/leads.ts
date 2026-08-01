import { createAdminClient } from '@/lib/supabase/admin'
import { applyVisibilityScope, type VisibilityScope } from '@/lib/auth/visibility'
import {
  KANBAN_COLUMN_LIMIT, KANBAN_COLUMN_STATUSES, LEADS_PAGE_SIZE,
  escapeLike, planSourceFilter,
  type ChannelRef, type KanbanColumn, type LeadListFilters, type LeadListItem,
  type LeadSortMode, type LeadsListData,
} from '@/lib/leads/list-filters'
import { OUT_OF_QUEUE_RANK, ACTIVE_STAGES } from '@/lib/scoring/priority'
import type { Stage, QualityBand, Urgency } from '@/lib/scoring/priority'
import type { Language, LeadStatus } from '@/lib/types'

// Acceso a datos de la lista de leads. Todo el filtrado, la búsqueda, el orden y
// la paginación ocurren en Postgres: la página sólo serializa la página pedida,
// no el tenant entero.
//
// Se consulta la vista `leads_list` (migración 072) en vez de la tabla: agrega
// `attention_when` y `attention_rank` ya calculados, lo que permite ordenar por
// premura en el servidor sin mandar la columna `metadata` completa al cliente.

const LIST_COLUMNS =
  'id, agent_id, acquisition_channel_id, traffic_source, first_name, last_name, ' +
  'email, phone, language, status, current_score, created_at, attention_when, ' +
  // Los tres ejes del rediseno (migracion 076). Llegan ya resueltos por la vista.
  'stage, quality_band, urgency, urgency_rank, quality_score'

// reason: el cliente de Supabase no está tipado con el esquema generado
/* eslint-disable @typescript-eslint/no-explicit-any */

// Aplica scope de visibilidad + todos los filtros salvo el estado (que el kanban
// necesita sobreescribir por columna).
function applyFilters(
  query: any,
  scope: VisibilityScope,
  filters: LeadListFilters,
  channels: ChannelRef[],
): any {
  let q = applyVisibilityScope(query, scope)

  if (filters.q) q = q.ilike('search_text', `%${escapeLike(filters.q.toLowerCase())}%`)
  if (filters.agentId   !== 'all') q = q.eq('agent_id', filters.agentId)
  if (filters.language  !== 'all') q = q.eq('language', filters.language)
  if (filters.channelId !== 'all') q = q.eq('acquisition_channel_id', filters.channelId)

  if (filters.source !== 'all') {
    const plan = planSourceFilter(filters.source, channels)
    const ors: string[] = []
    if (plan.channelIds.length > 0) {
      ors.push(`acquisition_channel_id.in.(${plan.channelIds.join(',')})`)
    }
    if (plan.trafficSources.length > 0) {
      ors.push(`and(acquisition_channel_id.is.null,traffic_source.in.(${plan.trafficSources.join(',')}))`)
    }
    if (ors.length > 0) q = q.or(ors.join(','))
  }

  return q
}

function applySort(query: any, sort: LeadSortMode): any {
  // `id` desempata siempre: sin él dos leads con el mismo created_at pueden saltar
  // de página entre peticiones.
  //
  // 'prioridad' es el orden LEXICOGRÁFICO del rediseño: primero lo que caduca
  // (urgency_rank), dentro de eso lo mejor (quality_score). Deliberadamente NO se
  // pondera un eje contra el otro — eso exigiría inventar cuántos puntos de
  // calidad vale un día de urgencia. Espeja compareByPriority de scoring/priority.
  if (sort === 'prioridad') {
    return query
      .order('urgency_rank',  { ascending: true })
      .order('quality_score', { ascending: false, nullsFirst: false })
      .order('id',            { ascending: false })
  }
  if (sort === 'atencion') {
    return query
      .order('attention_rank', { ascending: true })
      .order('current_score',  { ascending: false, nullsFirst: false })
      .order('created_at',     { ascending: false })
      .order('id',             { ascending: false })
  }
  return query
    .order('created_at', { ascending: false })
    .order('id',         { ascending: false })
}

function mapRow(r: any): LeadListItem {
  return {
    id:                   r.id as string,
    agentId:              r.agent_id as string,
    acquisitionChannelId: (r.acquisition_channel_id ?? null) as string | null,
    trafficSource:        (r.traffic_source ?? null) as string | null,
    firstName:            r.first_name as string,
    lastName:             r.last_name as string,
    email:                r.email as string,
    phone:                (r.phone ?? null) as string | null,
    language:             r.language as Language,
    status:               r.status as LeadStatus,
    // current_score es el score canónico del motor (temperature_score es la
    // columna legacy que ya no se escribe).
    score:                (r.current_score ?? null) as number | null,
    attentionWhen:        (r.attention_when ?? null) as LeadListItem['attentionWhen'],
    stage:                (r.stage ?? null) as LeadListItem['stage'],
    qualityBand:          (r.quality_band ?? null) as LeadListItem['qualityBand'],
    qualityScore:         (r.quality_score ?? null) as number | null,
    urgency:              (r.urgency ?? null) as LeadListItem['urgency'],
    urgencyRank:          (r.urgency_rank ?? OUT_OF_QUEUE_RANK) as number,
    createdAt:            r.created_at as string,
  }
}

// ─── Lista ────────────────────────────────────────────────────────────────────

// Una sola entrada para /leads: página (o columnas del kanban) + los conteos que
// muestra la cabecera. `channels` son los canales del tenant, necesarios sólo
// para resolver el filtro de fuente.
export async function getLeadsListData(
  scope: VisibilityScope,
  filters: LeadListFilters,
  channels: ChannelRef[],
): Promise<LeadsListData> {
  const supabase = createAdminClient()

  // Kind de fuente que no casa con ningún canal ni traffic_source del tenant:
  // no hay nada que consultar.
  if (filters.source !== 'all' && planSourceFilter(filters.source, channels).impossible) {
    return {
      items: [],
      kanban: filters.view === 'kanban' ? emptyKanban() : null,
      total: 0,
      hotCount: 0,
      attentionTodayCount: await getAttentionTodayCount(scope),
      page: 1,
      totalPages: 1,
    }
  }

  const statusFiltered = (q: any) =>
    filters.status !== 'all' ? q.eq('status', filters.status) : q

  const countQuery = () => statusFiltered(applyFilters(
    supabase.from('leads_list').select('id', { count: 'exact', head: true }),
    scope, filters, channels,
  ))

  const [totalRes, hotRes, attentionTodayCount] = await Promise.all([
    countQuery(),
    countQuery().gte('current_score', 70),
    getAttentionTodayCount(scope),
  ])

  const total      = (totalRes.count ?? 0) as number
  const hotCount   = (hotRes.count   ?? 0) as number
  const totalPages = Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE))

  if (filters.view === 'kanban') {
    const kanban = await fetchKanbanColumns(supabase, scope, filters, channels)
    return { items: [], kanban, total, hotCount, attentionTodayCount, page: 1, totalPages }
  }

  // Una URL con `page` fuera de rango (link viejo o editado a mano) cae a la
  // última página real en vez de mostrar una tabla vacía.
  const page = Math.min(Math.max(1, filters.page), totalPages)
  const from = (page - 1) * LEADS_PAGE_SIZE

  const { data } = await applySort(
    statusFiltered(applyFilters(
      supabase.from('leads_list').select(LIST_COLUMNS),
      scope, filters, channels,
    )),
    filters.sort,
  ).range(from, from + LEADS_PAGE_SIZE - 1)

  return {
    items: (data ?? []).map(mapRow),
    kanban: null,
    total,
    hotCount,
    attentionTodayCount,
    page,
    totalPages,
  }
}

function emptyKanban(): KanbanColumn[] {
  return Object.keys(KANBAN_COLUMN_STATUSES).map(key => ({ key, total: 0, items: [] }))
}

async function fetchKanbanColumns(
  supabase: ReturnType<typeof createAdminClient>,
  scope: VisibilityScope,
  filters: LeadListFilters,
  channels: ChannelRef[],
): Promise<KanbanColumn[]> {
  const entries = Object.entries(KANBAN_COLUMN_STATUSES)

  return Promise.all(entries.map(async ([key, statuses]) => {
    // El filtro de estado de la barra superior intersecta con los estados de la
    // columna: si no se cruzan, la columna queda vacía (igual que antes en JS).
    const effective = filters.status === 'all'
      ? statuses
      : statuses.filter(s => s === filters.status)

    if (effective.length === 0) return { key, total: 0, items: [] }

    const { data, count } = await applyFilters(
      supabase.from('leads_list').select(LIST_COLUMNS, { count: 'exact' }),
      scope, filters, channels,
    )
      .in('status', effective)
      .order('created_at', { ascending: false })
      .order('id',         { ascending: false })
      .limit(KANBAN_COLUMN_LIMIT)

    return {
      key,
      total: (count ?? 0) as number,
      items: ((data ?? []) as any[]).map(mapRow),
    }
  }))
}

// Leads que la IA marcó para hoy en todo el scope (no depende de los filtros
// activos: es un recordatorio, no una vista de la selección actual).
export async function getAttentionTodayCount(scope: VisibilityScope): Promise<number> {
  const supabase = createAdminClient()
  const { count } = await applyVisibilityScope(
    supabase.from('leads_list').select('id', { count: 'exact', head: true }),
    scope,
  ).eq('attention_when', 'hoy')
  return (count ?? 0) as number
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface LeadDashboardStats {
  total:    number
  hot:      number
  byStatus: Record<string, number>
  byAgent:  Array<{ agentId: string; total: number; hot: number; closed: number }>
}

// Conteos agregados en Postgres (RPC lead_dashboard_stats, migración 072). Antes
// esto era "traer todos los leads y contarlos con .filter()".
export async function getLeadDashboardStats(scope: VisibilityScope): Promise<LeadDashboardStats> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('lead_dashboard_stats', {
    p_tenant_id: scope.tenantId,
    p_agent_id:  scope.agentId,
  })

  if (error || !data) return { total: 0, hot: 0, byStatus: {}, byAgent: [] }

  const raw = data as any
  return {
    total:    (raw.total ?? 0) as number,
    hot:      (raw.hot   ?? 0) as number,
    byStatus: (raw.by_status ?? {}) as Record<string, number>,
    byAgent:  ((raw.by_agent ?? []) as any[]).map(a => ({
      agentId: a.agent_id as string,
      total:   (a.total  ?? 0) as number,
      hot:     (a.hot    ?? 0) as number,
      closed:  (a.closed ?? 0) as number,
    })),
  }
}

// ─── Analytics ────────────────────────────────────────────────────────────────

// Ventana de la serie mensual de /analytics, contando el mes en curso.
export const ANALYTICS_MONTHS = 7

export interface LeadAnalyticsStats {
  total:  number
  // "Caliente" = status 'hot' (la banda del pipeline), igual en toda la app.
  hot:    number
  closed: number
  // Media del score sobre el pipeline vivo; null cuando no hay leads vivos.
  liveAvgScore: number | null
  thisMonth: { leads: number; hot: number }
  // Fuente compuesta en crudo: la etiqueta la resuelve getLeadSource().
  bySource: Array<{ channelType: string | null; trafficSource: string | null; total: number }>
  byAgent:  Array<{
    agentId:  string
    total:    number
    hot:      number
    closed:   number
    avgScore: number
    statuses: Record<string, number>
  }>
  // Sólo los meses con leads, en clave 'YYYY-MM' (UTC). El eje completo lo arma
  // la página, que es quien conoce las etiquetas.
  monthly: Array<{ month: string; leads: number; nurturing: number; hot: number; closed: number }>
}

// Instancia nueva en cada fallo: la página recibe arrays propios, no una
// constante compartida entre requests.
function emptyAnalytics(): LeadAnalyticsStats {
  return {
    total: 0, hot: 0, closed: 0, liveAvgScore: null,
    thisMonth: { leads: 0, hot: 0 },
    bySource: [], byAgent: [], monthly: [],
  }
}

// Todos los agregados de /analytics en un solo viaje (RPC lead_analytics_stats,
// migración 073). Antes la página traía la tabla de leads entera del tenant y
// calculaba KPIs, donut, serie mensual y matrices por agente con .filter() en JS.
export async function getLeadAnalyticsStats(
  scope: VisibilityScope,
  months = ANALYTICS_MONTHS,
): Promise<LeadAnalyticsStats> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('lead_analytics_stats', {
    p_tenant_id: scope.tenantId,
    p_agent_id:  scope.agentId,
    p_months:    months,
  })

  if (error || !data) return emptyAnalytics()

  const raw = data as any
  return {
    total:  (raw.total  ?? 0) as number,
    hot:    (raw.hot    ?? 0) as number,
    closed: (raw.closed ?? 0) as number,
    liveAvgScore: (raw.live_avg_score ?? null) as number | null,
    thisMonth: {
      leads: (raw.this_month?.leads ?? 0) as number,
      hot:   (raw.this_month?.hot   ?? 0) as number,
    },
    bySource: ((raw.by_source ?? []) as any[]).map(s => ({
      channelType:   (s.channel_type   ?? null) as string | null,
      trafficSource: (s.traffic_source ?? null) as string | null,
      total:         (s.total ?? 0) as number,
    })),
    byAgent: ((raw.by_agent ?? []) as any[]).map(a => ({
      agentId:  a.agent_id as string,
      total:    (a.total     ?? 0) as number,
      hot:      (a.hot       ?? 0) as number,
      closed:   (a.closed    ?? 0) as number,
      avgScore: (a.avg_score ?? 0) as number,
      statuses: (a.statuses  ?? {}) as Record<string, number>,
    })),
    monthly: ((raw.monthly ?? []) as any[]).map(m => ({
      month:     m.month as string,
      leads:     (m.leads     ?? 0) as number,
      nurturing: (m.nurturing ?? 0) as number,
      hot:       (m.hot       ?? 0) as number,
      closed:    (m.closed    ?? 0) as number,
    })),
  }
}

export interface HotLead {
  id:          string
  firstName:   string
  lastName:    string
  agentId:     string
  status:      LeadStatus
  score:       number | null
  channelName: string | null
}

// ─── Posición dentro de la cartera activa ─────────────────────────────────────

export interface LeadPriorityPosition {
  stage:       Stage
  qualityBand: QualityBand
  urgency:     Urgency | null
  /** 1-based dentro de la cartera activa del scope. */
  rank:        number
  total:       number
}

/** Los tres ejes de un lead que NO está en la cola (etapa post-embudo). */
export interface LeadAxesOnly {
  stage:       Stage
  qualityBand: QualityBand
  urgency:     null
}

/**
 * Posición del lead en la cola de prioridad, para la tarjeta del detalle.
 *
 * Se resuelve con DOS counts sobre índice, nunca trayendo la cartera para
 * ordenarla en memoria: el ranking es la parte que se vuelve cara al crecer y es
 * justo la que no debe salir de Postgres. Medido: ~2 ms hoy, y sigue en
 * milisegundos con 100k filas porque es un scan acotado por índice.
 *
 * Devuelve null si el lead no está en una etapa activa — un lead En proceso o
 * Cerrado no compite por la atención del día y mostrarle una posición mentiría.
 */
export async function getLeadPriorityPosition(
  leadId: string,
  scope: VisibilityScope,
): Promise<LeadPriorityPosition | null> {
  const supabase = createAdminClient()

  const { data: row } = await applyVisibilityScope(
    supabase.from('leads_list')
      .select('stage, quality_band, urgency, urgency_rank, quality_score')
      .eq('id', leadId),
    scope,
  ).maybeSingle()
  if (!row) return null

  const lead = row as {
    stage: Stage | null; quality_band: QualityBand | null
    urgency: Urgency | null; urgency_rank: number; quality_score: number | null
  }
  if (!lead.stage) return null

  // Fuera de la cola (En proceso / Cerrado / Perdido): se devuelven los ejes pero
  // sin posición. Un lead que el agente ya sacó del embudo no compite por la
  // atención del día, y darle un puesto en la cola sería mentir.
  if (!(ACTIVE_STAGES as string[]).includes(lead.stage)) {
    return {
      stage:       lead.stage,
      qualityBand: lead.quality_band ?? 'baja',
      urgency:     null,
      rank:        0,
      total:       0,
    }
  }

  const activeOnly = (q: any) =>
    applyVisibilityScope(q, scope).in('stage', ACTIVE_STAGES as string[])

  const quality = lead.quality_score ?? 0

  const [totalRes, aheadRes] = await Promise.all([
    activeOnly(supabase.from('leads_list').select('id', { count: 'exact', head: true })),
    // "Por delante" = el mismo criterio lexicográfico del orden: urgencia más
    // apremiante, o misma urgencia con mejor calidad.
    activeOnly(supabase.from('leads_list').select('id', { count: 'exact', head: true }))
      .or(`urgency_rank.lt.${lead.urgency_rank},and(urgency_rank.eq.${lead.urgency_rank},quality_score.gt.${quality})`),
  ])

  return {
    stage:       lead.stage,
    qualityBand: lead.quality_band ?? 'baja',
    urgency:     lead.urgency,
    rank:        ((aheadRes.count ?? 0) as number) + 1,
    total:       (totalRes.count ?? 0) as number,
  }
}

// Los N leads más calientes del scope, resueltos por el índice
// (tenant_id, current_score desc) en vez de ordenando la tabla entera en JS.
export async function getHotLeads(scope: VisibilityScope, limit = 6): Promise<HotLead[]> {
  const supabase = createAdminClient()
  const { data } = await applyVisibilityScope(
    supabase
      .from('leads')
      .select('id, first_name, last_name, agent_id, status, current_score, acquisition_channels!acquisition_channel_id(name)'),
    scope,
  )
    // "Caliente" = la banda del pipeline (status 'hot', que el trigger mantiene
    // en score >= 60). Antes filtraba por score >= 70, así que esta lista podía
    // mostrar 2 leads mientras el contador de al lado —que ya cuenta la banda—
    // decía 5. El número y la lista tienen que salir del mismo criterio.
    .eq('status', 'hot')
    .order('current_score', { ascending: false, nullsFirst: false })
    .order('id',            { ascending: false })
    .limit(limit)

  return ((data ?? []) as any[]).map(r => ({
    id:          r.id as string,
    firstName:   r.first_name as string,
    lastName:    r.last_name as string,
    agentId:     r.agent_id as string,
    status:      r.status as LeadStatus,
    score:       (r.current_score ?? null) as number | null,
    channelName: (r.acquisition_channels?.name ?? null) as string | null,
  }))
}

// ─── Picker de secuencias manuales ────────────────────────────────────────────

export interface EligibleLead {
  id:        string
  firstName: string
  lastName:  string
  email:     string
  status:    string
  agentId:   string | null
  language:  string | null
}

export interface EligibleLeadsResult {
  items:     EligibleLead[]
  // Elegibles totales del scope (sin aplicar búsqueda ni filtros).
  total:     number
  // Elegibles que casan con la búsqueda y los filtros actuales.
  matched:   number
  statuses:  string[]
  languages: string[]
}

export interface EligibleLeadsFilters {
  q?:        string
  status?:   string
  language?: string
  // Filtro del desplegable del picker — distinto del scope de visibilidad.
  agentId?:  string
  limit?:    number
}

// Leads que aún pueden entrar a una secuencia manual: anti-join contra los runs
// activos en Postgres (RPC sequence_eligible_leads, migración 072) en vez de
// traer todos los leads del scope y descartarlos en JS.
export async function getEligibleLeadsForSequence(
  sequenceId: string,
  scope: VisibilityScope,
  filters: EligibleLeadsFilters = {},
): Promise<EligibleLeadsResult> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('sequence_eligible_leads', {
    p_sequence_id: sequenceId,
    p_tenant_id:   scope.tenantId,
    p_agent_id:    scope.agentId,
    p_search:      filters.q?.trim() || null,
    p_status:       filters.status   && filters.status   !== 'all' ? filters.status   : null,
    p_language:     filters.language && filters.language !== 'all' ? filters.language : null,
    p_agent_filter: filters.agentId  && filters.agentId  !== 'all' ? filters.agentId  : null,
    p_limit:        filters.limit ?? 50,
  })

  if (error || !data) return { items: [], total: 0, matched: 0, statuses: [], languages: [] }

  const raw = data as any
  return {
    total:     (raw.total   ?? 0) as number,
    matched:   (raw.matched ?? 0) as number,
    statuses:  ((raw.statuses  ?? []) as string[]).slice().sort(),
    languages: ((raw.languages ?? []) as string[]).slice().sort(),
    items: ((raw.items ?? []) as any[]).map(l => ({
      id:        l.id as string,
      firstName: l.first_name as string,
      lastName:  l.last_name as string,
      email:     l.email as string,
      status:    l.status as string,
      agentId:   (l.agent_id ?? null) as string | null,
      language:  (l.language ?? null) as string | null,
    })),
  }
}
