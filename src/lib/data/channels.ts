import { createAdminClient } from '@/lib/supabase/admin'

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
  leadsTotal: number
  leadsInWindow: number
  pageViewsInWindow: number
  conversionRate: number
  avgTempScore: number | null
}

export type ChannelWithMetrics = AcquisitionChannel & { metrics: ChannelMetrics }

export interface ChannelLead {
  id: string
  firstName: string
  lastName: string
  email: string
  status: string
  temperatureScore: number | null
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
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()

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

  const [{ data: windowLeads }, { data: windowViews }, { data: allLeads }] = await Promise.all([
    supabase
      .from('leads')
      .select('acquisition_channel_id, current_score')
      .in('acquisition_channel_id', channelIds)
      .gte('created_at', windowStart),
    supabase
      .from('channel_page_views')
      .select('channel_id, visitor_fingerprint')
      .in('channel_id', channelIds)
      .gte('created_at', windowStart),
    supabase
      .from('leads')
      .select('acquisition_channel_id')
      .in('acquisition_channel_id', channelIds),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return channels.map((c: any) => { // reason: Supabase returns untyped rows
    const wLeads = (windowLeads ?? []).filter(
      (l: { acquisition_channel_id: string }) => l.acquisition_channel_id === c.id
    )
    const totalLeads = (allLeads ?? []).filter(
      (l: { acquisition_channel_id: string }) => l.acquisition_channel_id === c.id
    )
    // Vistas ÚNICAS: distintos visitantes (visitor_fingerprint) en la ventana.
    // Abrir el mismo link varias veces en el mismo navegador cuenta una sola vez
    // (el fingerprint es estable en localStorage). Filas sin fingerprint (legacy)
    // se cuentan como una vista cada una para no perderlas.
    const viewRows = (windowViews ?? []).filter(
      (pv: { channel_id: string }) => pv.channel_id === c.id
    ) as { channel_id: string; visitor_fingerprint: string | null }[]
    const uniqueVisitors = new Set<string>()
    let anonViews = 0
    for (const v of viewRows) {
      if (v.visitor_fingerprint) uniqueVisitors.add(v.visitor_fingerprint)
      else anonViews++
    }

    const leadsInWindow = wLeads.length
    const pageViewsInWindow = uniqueVisitors.size + anonViews
    const conversionRate = pageViewsInWindow > 0
      ? Math.round((leadsInWindow / pageViewsInWindow) * 100)
      : 0

    const scoredLeads = wLeads.filter(
      (l: { current_score: number | null }) => l.current_score !== null
    )
    const avgTempScore = scoredLeads.length > 0
      ? Math.round(
          scoredLeads.reduce(
            (sum: number, l: { current_score: number | null }) => sum + (l.current_score ?? 0),
            0
          ) / scoredLeads.length
        )
      : null

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
        leadsTotal:       totalLeads.length,
        leadsInWindow,
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
    .select('id, first_name, last_name, email, status, current_score, traffic_source, created_at')
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
    status:           r.status,
    temperatureScore: r.current_score,
    trafficSource:    r.traffic_source,
    createdAt:        r.created_at,
  }))
}
