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
export async function getChannelsWithMetrics(
  tenantId: string | null,
  windowDays = 30
): Promise<ChannelWithMetrics[]> {
  return fetchChannelsWithMetrics(tenantId, windowDays, false)
}

// Archived counterpart — same metrics, but only channels with archived_at set.
export async function getArchivedChannelsWithMetrics(
  tenantId: string | null,
  windowDays = 30
): Promise<ChannelWithMetrics[]> {
  return fetchChannelsWithMetrics(tenantId, windowDays, true)
}

async function fetchChannelsWithMetrics(
  tenantId: string | null,
  windowDays: number,
  archived: boolean
): Promise<ChannelWithMetrics[]> {
  if (tenantId === '') return []

  const supabase = createAdminClient()
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()

  let channelQ = supabase
    .from('acquisition_channels')
    .select('*')
    .order('created_at', { ascending: false })
  channelQ = archived
    ? channelQ.not('archived_at', 'is', null)
    : channelQ.is('archived_at', null)
  if (tenantId) channelQ = channelQ.eq('tenant_id', tenantId)

  const { data: channels, error } = await channelQ

  if (error || !channels || channels.length === 0) return []

  const channelIds = channels.map((c: { id: string }) => c.id) // reason: Supabase returns untyped rows

  const [{ data: windowLeads }, { data: windowViews }, { data: allLeads }] = await Promise.all([
    supabase
      .from('leads')
      .select('acquisition_channel_id, temperature_score')
      .in('acquisition_channel_id', channelIds)
      .gte('created_at', windowStart),
    supabase
      .from('channel_page_views')
      .select('channel_id')
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
    const views = (windowViews ?? []).filter(
      (pv: { channel_id: string }) => pv.channel_id === c.id
    )

    const leadsInWindow = wLeads.length
    const pageViewsInWindow = views.length
    const conversionRate = pageViewsInWindow > 0
      ? Math.round((leadsInWindow / pageViewsInWindow) * 100)
      : 0

    const scoredLeads = wLeads.filter(
      (l: { temperature_score: number | null }) => l.temperature_score !== null
    )
    const avgTempScore = scoredLeads.length > 0
      ? Math.round(
          scoredLeads.reduce(
            (sum: number, l: { temperature_score: number | null }) => sum + (l.temperature_score ?? 0),
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
  windowDays = 30
): Promise<ChannelWithMetrics | null> {
  const all = await getChannelsWithMetrics(tenantId, windowDays)
  return all.find(c => c.slug === slug) ?? null
}

export async function getChannelLeads(
  tenantId: string,
  channelId: string
): Promise<ChannelLead[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('leads')
    .select('id, first_name, last_name, email, status, temperature_score, traffic_source, created_at')
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
    temperatureScore: r.temperature_score,
    trafficSource:    r.traffic_source,
    createdAt:        r.created_at,
  }))
}
