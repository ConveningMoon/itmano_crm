import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChannelType = 'lead_magnet' | 'event' | 'contact_form' | 'manychat_flow' | 'manual'

export interface AcquisitionChannel {
  id: string
  tenantId: string
  publicId: string
  channelType: ChannelType
  name: string
  slug: string
  active: boolean
  emailSequenceId: string | null
  agentId: string | null      // owning agent (routing); null = "Toda la agencia"
  agentName: string | null    // resolved display name, null when agentId is null
  metadata: Record<string, unknown>
  /**
   * Link de la página de esta fuente cuando NO la construye el CRM (migración
   * 092): la conectó ITMANO por fuera, o el tenant ya tenía su landing. Es el
   * único link posible para un tenant administrado por ITMANO, que no ve el
   * constructor.
   */
  pageUrl: string | null
  /** hosted_page.enabled — la página del constructor está publicada. */
  hostedPageEnabled: boolean
  /** Configuración cruda de la página alojada (la parsea parseHostedPage). */
  hostedPage: unknown
  createdAt: string
  archivedAt: string | null
}

/** Lee metadata.page_url tolerando filas viejas sin la clave o con basura. */
export function channelPageUrl(metadata: Record<string, unknown> | null | undefined): string | null {
  const raw = metadata?.page_url
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

export interface ChannelMetrics {
  /** Leads que este canal ADQUIRIO (leads.acquisition_channel_id). */
  leadsTotal: number
  leadsInWindow: number
  /**
   * Formularios enviados en este canal. Distinto de los leads: un visitante que
   * ya era lead y vuelve a llenar otro formulario suma envio pero no adquisicion
   * — se adquirio una vez. Sin este numero, un canal con actividad real salia
   * con un cero mudo.
   */
  submissionsTotal: number
  submissionsInWindow: number
  pageViewsInWindow: number
  /** Envios / vistas. `null` sin vistas: un 0% afirmaria que nadie convirtio. */
  conversionRate: number | null
  avgTempScore: number | null
}

export type ChannelWithMetrics = AcquisitionChannel & { metrics: ChannelMetrics }

export interface ChannelLead {
  id: string
  firstName: string
  lastName: string
  email: string
  stage: string
  score: number | null
  trafficSource: string | null
  createdAt: string
}

// ─── Queries ──────────────────────────────────────────────────────────────────

// Sólo los canales con un formulario detrás se administran aquí. 'manual' y
// 'manychat_flow' quedan fuera de TODA la página (incluido "Todos"): las filas
// viejas siguen en la base, sólo invisibles. Sin cambio de CHECK ni migración.
const MANAGEABLE_TYPES = ['lead_magnet', 'event', 'contact_form']

type RawMetrics = Record<string, {
  leads_total: number
  leads_in_window: number
  submissions_total: number
  submissions_in_window: number
  page_views_in_window: number
  conversion_rate: number | null
  avg_temp_score: number | null
} | undefined>

/**
 * Métricas de TODOS los canales de un tenant, agregadas en Postgres
 * (`tenant_channel_metrics`). Cacheada por request: /sources las pide para los
 * canales activos y los archivados, y antes eran dos RPC distintas que además
 * esperaban a la lista de canales. Con el tenant como entrada viajan en la
 * misma ola que la lista.
 */
const getTenantChannelMetrics = cache(async function getTenantChannelMetrics(
  tenantId: string,
  windowDays: number,
): Promise<RawMetrics> {
  const supabase = createAdminClient()
  const { data } = await supabase.rpc('tenant_channel_metrics', {
    p_tenant_id:   tenantId,
    p_window_days: windowDays,
  })
  return (data ?? {}) as RawMetrics
})

/** Nombres de los agentes de un tenant, para el badge de cada canal. */
const getAgentNames = cache(async function getAgentNames(tenantId: string): Promise<Map<string, string>> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('agents').select('id, name').eq('tenant_id', tenantId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Map(((data ?? []) as any[]).map(a => [a.id as string, a.name as string]))
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toChannel(c: any, agentNameMap: Map<string, string>, m: RawMetrics[string]): ChannelWithMetrics {
  return {
    id:              c.id,
    tenantId:        c.tenant_id,
    publicId:        c.public_id,
    channelType:     c.channel_type as ChannelType,
    name:            c.name,
    slug:            c.slug,
    active:          c.active,
    emailSequenceId: c.email_sequence_id,
    agentId:         c.agent_id ?? null,
    agentName:       c.agent_id ? (agentNameMap.get(c.agent_id) ?? null) : null,
    metadata:        c.metadata ?? {},
    pageUrl:         channelPageUrl(c.metadata),
    hostedPageEnabled: c.hosted_page?.enabled === true,
    hostedPage:      c.hosted_page ?? null,
    createdAt:       c.created_at,
    archivedAt:      c.archived_at,
    metrics: {
      leadsTotal:          m?.leads_total ?? 0,
      leadsInWindow:       m?.leads_in_window ?? 0,
      submissionsTotal:    m?.submissions_total ?? 0,
      submissionsInWindow: m?.submissions_in_window ?? 0,
      pageViewsInWindow:   m?.page_views_in_window ?? 0,
      conversionRate:      m?.conversion_rate ?? null,
      avgTempScore:        m?.avg_temp_score ?? null,
    },
  }
}

// tenantId = null → super_admin: no tenant filter, fetches all tenants
// tenantId = ''   → invalid/missing tenant: returns empty
// agentId  != null → role 'agent': only channels owned by that agent (excludes the
//                    "Toda la agencia" rows where agent_id IS NULL).
export async function getChannelsWithMetrics(
  tenantId: string | null,
  windowDays = 30,
  agentId: string | null = null,
): Promise<ChannelWithMetrics[]> {
  return fetchChannelsWithMetrics(tenantId, windowDays, false, agentId)
}

// Archived counterpart — same metrics, but only channels with archived_at set.
export async function getArchivedChannelsWithMetrics(
  tenantId: string | null,
  windowDays = 30,
  agentId: string | null = null,
): Promise<ChannelWithMetrics[]> {
  return fetchChannelsWithMetrics(tenantId, windowDays, true, agentId)
}

async function fetchChannelsWithMetrics(
  tenantId: string | null,
  windowDays: number,
  archived: boolean,
  agentId: string | null = null,
): Promise<ChannelWithMetrics[]> {
  if (tenantId === '') return []

  const supabase = createAdminClient()

  let channelQ = supabase
    .from('acquisition_channels')
    .select('*')
    .in('channel_type', MANAGEABLE_TYPES)
    .order('created_at', { ascending: false })
  channelQ = archived
    ? channelQ.not('archived_at', 'is', null)
    : channelQ.is('archived_at', null)
  if (tenantId) channelQ = channelQ.eq('tenant_id', tenantId)
  // Agent visibility: own channels only (excludes "Toda la agencia" / null agent_id).
  if (agentId) channelQ = channelQ.eq('agent_id', agentId)

  // Con tenant, las tres lecturas son independientes y van juntas: los canales,
  // sus métricas (por tenant, no por ids) y los nombres de agente. Antes iban
  // en tres olas: canales → agentes → métricas.
  if (tenantId) {
    const [{ data: channels, error }, metrics, agentNameMap] = await Promise.all([
      channelQ,
      getTenantChannelMetrics(tenantId, windowDays),
      getAgentNames(tenantId),
    ])
    if (error || !channels) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (channels as any[]).map(c => toChannel(c, agentNameMap, metrics[c.id as string]))
  }

  // super_admin sin tenant: no hay un tenant al que pedirle métricas ni
  // agentes de antemano, así que se resuelven por ids después de los canales.
  const { data: channels, error } = await channelQ
  if (error || !channels || channels.length === 0) return []

  const channelIds = channels.map((c: { id: string }) => c.id) // reason: Supabase returns untyped rows
  const agentIds = [...new Set(
    channels.map((c: { agent_id: string | null }) => c.agent_id).filter((id): id is string => !!id)
  )]

  const [{ data: agentRows }, { data: metricsRaw }] = await Promise.all([
    agentIds.length > 0
      ? supabase.from('agents').select('id, name').in('id', agentIds)
      : Promise.resolve({ data: [] }),
    supabase.rpc('channel_metrics', { p_channel_ids: channelIds, p_window_days: windowDays }),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentNameMap = new Map(((agentRows ?? []) as any[]).map(a => [a.id as string, a.name as string]))
  const metrics = (metricsRaw ?? {}) as RawMetrics

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (channels as any[]).map(c => toChannel(c, agentNameMap, metrics[c.id as string]))
}

/**
 * Un canal por slug, con sus métricas. Con tenant es una sola ola: la fila del
 * canal, las métricas del tenant y los nombres de agente viajan juntos. Antes
 * pedía la lista entera de canales del tenant (y sus métricas) para quedarse
 * con uno.
 */
export async function getChannelBySlug(
  tenantId: string | null,
  slug: string,
  windowDays = 30,
  agentId: string | null = null,
): Promise<ChannelWithMetrics | null> {
  if (!tenantId) {
    const all = await getChannelsWithMetrics(tenantId, windowDays, agentId)
    return all.find(c => c.slug === slug) ?? null
  }

  const supabase = createAdminClient()
  let channelQ = supabase
    .from('acquisition_channels')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('slug', slug)
    .in('channel_type', MANAGEABLE_TYPES)
    .is('archived_at', null)
  if (agentId) channelQ = channelQ.eq('agent_id', agentId)

  const [{ data: channel }, metrics, agentNameMap] = await Promise.all([
    channelQ.maybeSingle(),
    getTenantChannelMetrics(tenantId, windowDays),
    getAgentNames(tenantId),
  ])
  if (!channel) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = channel as any
  return toChannel(c, agentNameMap, metrics[c.id as string])
}

export async function getChannelLeads(
  tenantId: string,
  channelId: string
): Promise<ChannelLead[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('leads')
    .select(columns('leads', [
      'id', 'first_name', 'last_name', 'email', 'stage',
      'current_score', 'traffic_source', 'created_at',
    ]))
    .eq('tenant_id', tenantId)
    .eq('acquisition_channel_id', channelId)
    .order('created_at', { ascending: false })

  if (error || !data) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data.map((r: any) => ({ // reason: Supabase returns untyped rows
    id:               r.id,
    firstName:        r.first_name,
    lastName:         r.last_name,
    email:            r.email,
    stage:            r.stage,
    score:            r.current_score,
    trafficSource:    r.traffic_source,
    createdAt:        r.created_at,
  }))
}
