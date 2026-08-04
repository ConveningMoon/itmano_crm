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
  createdAt: string
  archivedAt: string | null
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
    // Only channels with a form behind them are manageable here. 'manual' and
    // 'manychat_flow' are excluded from the WHOLE page (incl. "Todos") — legacy rows
    // stay in the DB, just invisible. No CHECK change, no lead migration.
    .select('*')
    .in('channel_type', ['lead_magnet', 'event', 'contact_form'])
    .order('created_at', { ascending: false })
  channelQ = archived
    ? channelQ.not('archived_at', 'is', null)
    : channelQ.is('archived_at', null)
  if (tenantId) channelQ = channelQ.eq('tenant_id', tenantId)
  // Agent visibility: own channels only (excludes "Toda la agencia" / null agent_id).
  if (agentId) channelQ = channelQ.eq('agent_id', agentId)

  const { data: channels, error } = await channelQ

  if (error || !channels || channels.length === 0) return []

  const channelIds = channels.map((c: { id: string }) => c.id) // reason: Supabase returns untyped rows

  // Resolve owning-agent names in one batch (for the "Toda la agencia"/agent badge).
  const agentIds = [...new Set(
    channels.map((c: { agent_id: string | null }) => c.agent_id).filter((id): id is string => !!id)
  )]
  const agentNameMap = new Map<string, string>()
  if (agentIds.length > 0) {
    const { data: agentRows } = await supabase.from('agents').select('id, name').in('id', agentIds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of (agentRows ?? []) as any[]) agentNameMap.set(a.id, a.name)
  }

  // Las métricas las agrega Postgres (`channel_metrics`, migración 075). Antes
  // esta función traía TODOS los leads de estos canales —sin filtro de fecha— y
  // los recorría una vez por canal para contarlos en memoria: O(canales × leads)
  // sobre filas que ya venían enteras por la red.
  const { data: metricsRaw } = await supabase.rpc('channel_metrics', {
    p_channel_ids:  channelIds,
    p_window_days:  windowDays,
  })
  const metricsById = (metricsRaw ?? {}) as Record<string, {
    leads_total: number
    leads_in_window: number
    submissions_total: number
    submissions_in_window: number
    page_views_in_window: number
    conversion_rate: number | null
    avg_temp_score: number | null
  } | undefined>

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return channels.map((c: any) => { // reason: Supabase returns untyped rows
    const m = metricsById[c.id as string]
    const leadsInWindow     = m?.leads_in_window ?? 0
    const pageViewsInWindow = m?.page_views_in_window ?? 0
    const conversionRate    = m?.conversion_rate ?? null
    const avgTempScore      = m?.avg_temp_score ?? null
    const totalLeadsCount   = m?.leads_total ?? 0

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
      createdAt:       c.created_at,
      archivedAt:      c.archived_at,
      metrics: {
        leadsTotal:       totalLeadsCount,
        leadsInWindow,
        submissionsTotal:    m?.submissions_total ?? 0,
        submissionsInWindow: m?.submissions_in_window ?? 0,
        pageViewsInWindow,
        conversionRate,
        avgTempScore,
      },
    } satisfies ChannelWithMetrics
  })
}

export async function getChannelBySlug(
  tenantId: string | null,
  slug: string,
  windowDays = 30,
  agentId: string | null = null,
): Promise<ChannelWithMetrics | null> {
  const all = await getChannelsWithMetrics(tenantId, windowDays, agentId)
  return all.find(c => c.slug === slug) ?? null
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
