import { createAdminClient } from '@/lib/supabase/admin'
import { applyVisibilityScope, type VisibilityScope } from '@/lib/auth/visibility'
import {
  KANBAN_COLUMN_LIMIT, KANBAN_COLUMNS, LEADS_PAGE_SIZE,
  escapeLike, planSourceFilter,
  type ChannelRef, type KanbanColumn, type LeadListFilters, type LeadListItem,
  type LeadSortMode, type LeadsListData,
} from '@/lib/leads/list-filters'
import { columns } from '@/lib/supabase/columns'
import { getAgentActionTypes } from '@/lib/scoring/agent-actions'
import { OUT_OF_QUEUE_RANK, ACTIVE_STAGES } from '@/lib/scoring/priority'
import type { Stage, QualityBand, Urgency } from '@/lib/scoring/priority'
import type { Language } from '@/lib/types'

// Acceso a datos de la lista de leads. Todo el filtrado, la búsqueda, el orden y
// la paginación ocurren en Postgres: la página sólo serializa la página pedida,
// no el tenant entero.
//
// Se consulta la vista `leads_list` (migración 072) en vez de la tabla: agrega
// `stage`, `quality_band` y `urgency` ya resueltos, lo que permite ordenar por
// premura en el servidor sin mandar la columna `metadata` completa al cliente.

// Verificadas contra el esquema generado: pedir una columna que la vista no
// expone es error de tsc, no una página en blanco en producción.
const LIST_COLUMNS = columns('leads_list', [
  'id', 'agent_id', 'acquisition_channel_id', 'traffic_source',
  'first_name', 'last_name', 'email', 'phone', 'language',
  'current_score', 'created_at',
  // Los tres ejes. `stage` es columna propia desde la 082; calidad y urgencia
  // las sigue resolviendo la vista.
  'stage', 'quality_band', 'urgency', 'urgency_rank', 'quality_score',
])

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
  if (filters.quality   !== 'all') q = q.eq('quality_band', filters.quality)
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
    // current_score es el score canónico del motor (temperature_score es la
    // columna legacy que ya no se escribe).
    score:                (r.current_score ?? null) as number | null,
    stage:                r.stage as Stage,
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
      highQualityCount: 0,
      urgentTodayCount: await getUrgentTodayCount(scope),
      page: 1,
      totalPages: 1,
    }
  }

  const stageFiltered = (q: any) =>
    filters.stage !== 'all' ? q.eq('stage', filters.stage) : q

  const countQuery = () => stageFiltered(applyFilters(
    supabase.from('leads_list').select('id', { count: 'exact', head: true }),
    scope, filters, channels,
  ))

  const [totalRes, hotRes, urgentTodayCount] = await Promise.all([
    countQuery(),
    // "Alta" es la banda del modelo, no un umbral de score: se autoajusta a la
    // cartera del tenant (quintiles) en vez de fijar un 70 que no significa nada.
    countQuery().eq('quality_band', 'alta'),
    getUrgentTodayCount(scope),
  ])

  const total      = (totalRes.count ?? 0) as number
  const highQualityCount = (hotRes.count ?? 0) as number
  const totalPages = Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE))

  if (filters.view === 'kanban') {
    const kanban = await fetchKanbanColumns(supabase, scope, filters, channels)
    return { items: [], kanban, total, highQualityCount, urgentTodayCount, page: 1, totalPages }
  }

  // Una URL con `page` fuera de rango (link viejo o editado a mano) cae a la
  // última página real en vez de mostrar una tabla vacía.
  const page = Math.min(Math.max(1, filters.page), totalPages)
  const from = (page - 1) * LEADS_PAGE_SIZE

  const { data } = await applySort(
    stageFiltered(applyFilters(
      supabase.from('leads_list').select(LIST_COLUMNS),
      scope, filters, channels,
    )),
    filters.sort,
  ).range(from, from + LEADS_PAGE_SIZE - 1)

  return {
    items: (data ?? []).map(mapRow),
    kanban: null,
    total,
    highQualityCount,
    urgentTodayCount,
    page,
    totalPages,
  }
}

function emptyKanban(): KanbanColumn[] {
  return KANBAN_COLUMNS.map(key => ({ key, total: 0, items: [] }))
}

async function fetchKanbanColumns(
  supabase: ReturnType<typeof createAdminClient>,
  scope: VisibilityScope,
  filters: LeadListFilters,
  channels: ChannelRef[],
): Promise<KanbanColumn[]> {
  return Promise.all(KANBAN_COLUMNS.map(async stage => {
    // El filtro de etapa de la barra superior deja fuera al resto de columnas:
    // filtrar por "Cerrado" y ver la columna "Nuevo" llena sería incoherente.
    if (filters.stage !== 'all' && filters.stage !== stage) {
      return { key: stage, total: 0, items: [] }
    }

    const { data, count } = await applyFilters(
      supabase.from('leads_list').select(LIST_COLUMNS, { count: 'exact' }),
      scope, filters, channels,
    )
      .eq('stage', stage)
      .order('created_at', { ascending: false })
      .order('id',         { ascending: false })
      .limit(KANBAN_COLUMN_LIMIT)

    return {
      key: stage,
      total: (count ?? 0) as number,
      items: ((data ?? []) as any[]).map(mapRow),
    }
  }))
}

// Leads urgentes para hoy en todo el scope (no depende de los filtros activos:
// es un recordatorio, no una vista de la selección actual).
export async function getUrgentTodayCount(scope: VisibilityScope): Promise<number> {
  const supabase = createAdminClient()
  const { count } = await applyVisibilityScope(
    supabase.from('leads_list').select('id', { count: 'exact', head: true }),
    scope,
  ).eq('urgency', 'hoy')
  return (count ?? 0) as number
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface LeadDashboardStats {
  total:    number
  /** Cartera VIVA: etapas Nuevo y En Nutrición. Lo único que compite por la atención. */
  active:   number
  /** Calidad alta DENTRO de la cartera viva — un cerrado excelente ya no es trabajo. */
  highQuality: number
  urgentToday: number
  closedThisMonth: number
  /** Traídos de otro CRM: nunca recorrieron el embudo aquí, así que el bloque
   *  de etapas los excluye y los reporta aparte. */
  imported: number
  byStage:  Record<string, number>
  byAgent:  Array<{ agentId: string; total: number; highQuality: number; closed: number }>
}

// Conteos agregados en Postgres (RPC lead_dashboard_stats, migración 072). Antes
// esto era "traer todos los leads y contarlos con .filter()".
export async function getLeadDashboardStats(scope: VisibilityScope): Promise<LeadDashboardStats> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('lead_dashboard_stats', {
    p_tenant_id: scope.tenantId,
    p_agent_id:  scope.agentId,
  })

  if (error || !data) {
    return {
      total: 0, active: 0, highQuality: 0, urgentToday: 0,
      closedThisMonth: 0, imported: 0, byStage: {}, byAgent: [],
    }
  }

  const raw = data as any
  return {
    total:           (raw.total ?? 0) as number,
    active:          (raw.active ?? 0) as number,
    highQuality:     (raw.high_quality ?? 0) as number,
    urgentToday:     (raw.urgent_today ?? 0) as number,
    closedThisMonth: (raw.closed_this_month ?? 0) as number,
    imported:        (raw.imported ?? 0) as number,
    byStage:         (raw.by_stage  ?? {}) as Record<string, number>,
    byAgent:  ((raw.by_agent ?? []) as any[]).map(a => ({
      agentId:     a.agent_id as string,
      total:       (a.total  ?? 0) as number,
      highQuality: (a.high_quality ?? 0) as number,
      closed:      (a.closed ?? 0) as number,
    })),
  }
}

// ─── Analytics ────────────────────────────────────────────────────────────────

// Ventana de la serie mensual de /analytics, contando el mes en curso.
export const ANALYTICS_MONTHS = 7

// El RPC sigue devolviendo las claves de temperatura (hot, live_avg_score,
// statuses, avg_score) por compatibilidad, pero ninguna pantalla las lee ya:
// se dejan sin mapear a propósito para que nadie las dé por vivas.
export interface LeadAnalyticsStats {
  total:  number
  closed: number
  /** Cartera viva: etapas nuevo + nutrición. Es lo que el agente puede trabajar. */
  active: number
  /** Leads captados por ITMANO — los importados de otro CRM quedan fuera. Es el
   *  par sobre el que se mide la conversión: incluirlos daba un 98% prestado. */
  attributedTotal:  number
  attributedClosed: number
  imported: number
  thisMonth: { leads: number; highQuality: number }
  // Fuente compuesta en crudo: la etiqueta la resuelve getLeadSource().
  /** Distribución de las 5 bandas sobre TODA la cartera, cerrados incluidos:
   *  sin ellos no se ve si los buenos leads terminan cerrando. */
  qualityDistribution: Record<string, number>
  byStage: Record<string, number>
  bySource: Array<{ channelType: string | null; trafficSource: string | null; total: number; avgQuality: number | null }>
  byAgent:  Array<{
    agentId:     string
    total:       number
    highQuality: number
    closed:      number
    /** Calidad media — a diferencia del score, no la mueve el paso del tiempo. */
    avgQuality:  number
    stages:      Record<string, number>
  }>
  // Sólo los meses con leads, en clave 'YYYY-MM' (UTC). El eje completo lo arma
  // la página, que es quien conoce las etiquetas.
  //
  // Es una serie de COHORTES: el mes es el de alta y las etapas son las de HOY.
  // Por eso las cinco suman `leads` — un lead está en exactamente una etapa.
  monthly: Array<{
    month: string; leads: number
    nuevo: number; nutricion: number; enProceso: number; cerrado: number; perdido: number
  }>
}

// Instancia nueva en cada fallo: la página recibe arrays propios, no una
// constante compartida entre requests.
function emptyAnalytics(): LeadAnalyticsStats {
  return {
    total: 0, closed: 0, active: 0,
    attributedTotal: 0, attributedClosed: 0, imported: 0,
    thisMonth: { leads: 0, highQuality: 0 },
    qualityDistribution: {}, byStage: {}, bySource: [], byAgent: [], monthly: [],
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
    closed: (raw.closed ?? 0) as number,
    active: (raw.active ?? 0) as number,
    attributedTotal:  (raw.attributed_total  ?? 0) as number,
    attributedClosed: (raw.attributed_closed ?? 0) as number,
    imported:         (raw.imported ?? 0) as number,
    thisMonth: {
      leads:       (raw.this_month?.leads ?? 0) as number,
      highQuality: (raw.this_month?.high_quality ?? 0) as number,
    },
    qualityDistribution: (raw.quality_distribution ?? {}) as Record<string, number>,
    byStage:             (raw.by_stage ?? {}) as Record<string, number>,
    bySource: ((raw.by_source ?? []) as any[]).map(s => ({
      channelType:   (s.channel_type   ?? null) as string | null,
      trafficSource: (s.traffic_source ?? null) as string | null,
      total:         (s.total ?? 0) as number,
      // Calidad media del canal: responde "¿qué fuente trae MEJORES leads?", que
      // hasta ahora no se podía saber — solo cuál traía más.
      avgQuality:    (s.avg_quality ?? null) as number | null,
    })),
    byAgent: ((raw.by_agent ?? []) as any[]).map(a => ({
      agentId:     a.agent_id as string,
      total:       (a.total  ?? 0) as number,
      closed:      (a.closed ?? 0) as number,
      highQuality: (a.high_quality ?? 0) as number,
      avgQuality:  (a.avg_quality  ?? 0) as number,
      stages:      (a.stages ?? {}) as Record<string, number>,
    })),
    monthly: ((raw.monthly ?? []) as any[]).map(m => ({
      month:     m.month as string,
      leads:     (m.leads      ?? 0) as number,
      nuevo:     (m.nuevo      ?? 0) as number,
      nutricion: (m.nutricion  ?? 0) as number,
      enProceso: (m.en_proceso ?? 0) as number,
      cerrado:   (m.cerrado    ?? 0) as number,
      perdido:   (m.perdido    ?? 0) as number,
    })),
  }
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
      .select(columns('leads_list', ['stage', 'quality_band', 'urgency', 'urgency_rank', 'quality_score']))
      .eq('id', leadId),
    scope,
  ).maybeSingle()
  if (!row) return null

  // `as unknown` primero: con la lista de columnas armada por `columns()` el
  // cliente sin tipar no puede inferir la fila y la da por GenericStringError.
  // La garantía real está en la lista, que sí se valida contra el esquema.
  const lead = row as unknown as {
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

export interface QueueLead {
  id:          string
  firstName:   string
  lastName:    string
  agentId:     string
  qualityBand: QualityBand
  urgency:     Urgency | null
  channelName: string | null
}

/**
 * La cola de hoy: los N primeros por PRIORIDAD dentro de la cartera activa.
 *
 * Es lo que reemplaza a "Leads Calientes" en el dashboard. Un lead caliente que
 * ya está en proceso no es trabajo pendiente, y uno mediocre que acaba de
 * responder sí — ordenar por score no distinguía ninguno de los dos casos.
 *
 * Mismo orden lexicográfico que la lista: urgencia, luego calidad. Se resuelve
 * en Postgres con el índice, no ordenando en memoria.
 */
export async function getPriorityQueue(scope: VisibilityScope, limit = 6): Promise<QueueLead[]> {
  const supabase = createAdminClient()
  const { data } = await applyVisibilityScope(
    supabase
      .from('leads_list')
      // El embed del canal va aparte: `columns` valida columnas propias de la
      // relacion, no joins de PostgREST.
      .select(columns('leads_list', [
        'id', 'first_name', 'last_name', 'agent_id',
        'quality_band', 'urgency', 'urgency_rank', 'quality_score',
      ]) + ', acquisition_channels!acquisition_channel_id(name)'),
    scope,
  )
    .in('stage', ACTIVE_STAGES as string[])
    .order('urgency_rank',  { ascending: true })
    .order('quality_score', { ascending: false, nullsFirst: false })
    .order('id',            { ascending: false })
    .limit(limit)

  return ((data ?? []) as any[]).map(r => ({
    id:          r.id as string,
    firstName:   r.first_name as string,
    lastName:    r.last_name as string,
    agentId:     r.agent_id as string,
    qualityBand: (r.quality_band ?? 'baja') as QualityBand,
    urgency:     (r.urgency ?? null) as Urgency | null,
    channelName: (r.acquisition_channels?.name ?? null) as string | null,
  }))
}

// getHotLeads() se retiró con la 082: era la lista de "leads calientes" del
// dashboard, que getPriorityQueue() reemplazó por la cola del día. Filtraba por
// una banda de temperatura que ya no existe.

// ─── Picker de secuencias manuales ────────────────────────────────────────────

export interface EligibleLead {
  id:        string
  firstName: string
  lastName:  string
  email:     string
  stage:     Stage
  agentId:   string | null
  language:  string | null
}

export interface EligibleLeadsResult {
  items:     EligibleLead[]
  // Elegibles totales del scope (sin aplicar búsqueda ni filtros).
  total:     number
  // Elegibles que casan con la búsqueda y los filtros actuales.
  matched:   number
  stages:    string[]
  languages: string[]
}

export interface EligibleLeadsFilters {
  q?:        string
  stage?:    string
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
    p_stage:        filters.stage    && filters.stage    !== 'all' ? filters.stage    : null,
    p_language:     filters.language && filters.language !== 'all' ? filters.language : null,
    p_agent_filter: filters.agentId  && filters.agentId  !== 'all' ? filters.agentId  : null,
    p_limit:        filters.limit ?? 50,
  })

  if (error || !data) return { items: [], total: 0, matched: 0, stages: [], languages: [] }

  const raw = data as any
  return {
    total:     (raw.total   ?? 0) as number,
    matched:   (raw.matched ?? 0) as number,
    stages:    ((raw.stages    ?? []) as string[]).slice().sort(),
    languages: ((raw.languages ?? []) as string[]).slice().sort(),
    items: ((raw.items ?? []) as any[]).map(l => ({
      id:        l.id as string,
      firstName: l.first_name as string,
      lastName:  l.last_name as string,
      email:     l.email as string,
      stage:     l.stage as Stage,
      agentId:   (l.agent_id ?? null) as string | null,
      language:  (l.language ?? null) as string | null,
    })),
  }
}

// ─── Tiempo de respuesta ──────────────────────────────────────────────────────

export interface ResponseTimeStats {
  /** Leads de entrada medibles en la ventana (importados y altas manuales fuera). */
  total:         number
  respondidos:   number
  sinResponder:  number
  /** Mediana en horas; null cuando todavía no hay ni una respuesta medida. */
  medianHours:   number | null
  byAgent: Array<{
    agentId:     string
    total:       number
    respondidos: number
    medianHours: number | null
  }>
}

function emptyResponseTime(): ResponseTimeStats {
  return { total: 0, respondidos: 0, sinResponder: 0, medianHours: null, byAgent: [] }
}

/**
 * Cuánto tarda el equipo en responder a un lead que llegó solo (migración 084).
 *
 * Los tipos de evento que cuentan como respuesta NO se fijan aquí: se resuelven
 * contra `lead_score_rules` y se pasan al RPC. Una lista escrita a mano en el
 * SQL sería una segunda definición esperando a divergir de la de TypeScript —
 * que es exactamente cómo se rompió la tasa de seguimiento de los briefings.
 */
export async function getResponseTimeStats(
  scope: VisibilityScope,
  days = 90,
): Promise<ResponseTimeStats> {
  const supabase = createAdminClient()
  const actionTypes = await getAgentActionTypes(supabase, scope.tenantId)

  const { data, error } = await supabase.rpc('lead_response_time_stats', {
    p_tenant_id:    scope.tenantId,
    p_agent_id:     scope.agentId,
    p_action_types: actionTypes,
    p_days:         days,
  })
  if (error || !data) return emptyResponseTime()

  const raw = data as any
  return {
    total:        (raw.total ?? 0) as number,
    respondidos:  (raw.respondidos ?? 0) as number,
    sinResponder: (raw.sin_responder ?? 0) as number,
    medianHours:  (raw.mediana_horas ?? null) as number | null,
    byAgent: ((raw.by_agent ?? []) as any[]).map(a => ({
      agentId:     a.agent_id as string,
      total:       (a.total ?? 0) as number,
      respondidos: (a.respondidos ?? 0) as number,
      medianHours: (a.mediana_horas ?? null) as number | null,
    })),
  }
}
