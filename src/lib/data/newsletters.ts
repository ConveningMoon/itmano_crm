import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import {
  parseNewsletterContent, parseNewsletterSources,
  type NewsletterContent, type NewsletterSource,
} from '@/lib/newsletters/content'

// Acceso a datos de newsletters. La SERIE es una fila de acquisition_channels
// con channel_type = 'newsletter'; las EDICIONES son tabla propia.

export type NewsletterStatus      = 'draft' | 'published' | 'archived'
export type NewsletterCoverSource = 'upload' | 'studio' | 'ai'

export interface NewsletterSeries {
  id:                string
  tenantId:          string
  name:              string
  slug:              string
  active:            boolean
  emailSequenceId:   string | null
  emailSequenceName: string | null
  agentId:           string | null
  subscriberCount:   number
  editionCount:      number
  lastEditionAt:     string | null
}

export interface NewsletterEdition {
  id:                   string
  tenantId:             string
  channelId:            string
  slug:                 string
  title:                string
  dek:                  string | null
  language:             string
  translationGroupId:   string | null
  coverImageUrl:        string
  coverSource:          NewsletterCoverSource
  content:              NewsletterContent | null
  sources:              NewsletterSource[]
  dataAsOf:             string | null
  status:               NewsletterStatus
  publishedAt:          string | null
  aiGenerated:          boolean
  unpublishedByBilling: boolean
  createdByAgentId:     string | null
  createdByUserId:      string | null
  createdAt:            string
  updatedAt:            string
}

const SERIES_COLUMNS = columns('acquisition_channels', [
  'id', 'tenant_id', 'name', 'slug', 'active', 'email_sequence_id', 'agent_id',
])

const EDITION_COLUMNS = columns('newsletter_editions', [
  'id', 'tenant_id', 'channel_id', 'slug', 'title', 'dek', 'language',
  'translation_group_id', 'cover_image_url', 'cover_source', 'content', 'sources',
  'data_as_of', 'status', 'published_at', 'ai_generated', 'unpublished_by_billing',
  'created_by_agent_id', 'created_by_user_id', 'created_at', 'updated_at',
])

// reason: el cliente de Supabase no está tipado en este repo; `columns()` ya
// validó la lista contra el esquema, que es lo que el cast podría esconder.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEdition(row: any): NewsletterEdition {
  return {
    id:                   row.id,
    tenantId:             row.tenant_id,
    channelId:            row.channel_id,
    slug:                 row.slug,
    title:                row.title,
    dek:                  row.dek ?? null,
    language:             row.language,
    translationGroupId:   row.translation_group_id ?? null,
    coverImageUrl:        row.cover_image_url,
    coverSource:          row.cover_source,
    content:              parseNewsletterContent(row.content),
    sources:              parseNewsletterSources(row.sources),
    dataAsOf:             row.data_as_of ?? null,
    status:               row.status,
    publishedAt:          row.published_at ?? null,
    aiGenerated:          row.ai_generated === true,
    unpublishedByBilling: row.unpublished_by_billing === true,
    createdByAgentId:     row.created_by_agent_id ?? null,
    createdByUserId:      row.created_by_user_id ?? null,
    createdAt:            row.created_at,
    updatedAt:            row.updated_at,
  }
}

export async function getSeriesForTenant(tenantId: string): Promise<NewsletterSeries[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('acquisition_channels')
    .select(SERIES_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('channel_type', 'newsletter')
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  // reason: ver mapEdition.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[]
  if (rows.length === 0) return []

  const ids = rows.map(r => r.id as string)

  // Conteos en dos consultas agregadas en vez de N+1: pocas series, muchos leads.
  const [{ data: leadRows }, { data: editionRows }, { data: seqRows }] = await Promise.all([
    db.from('leads').select('acquisition_channel_id').in('acquisition_channel_id', ids),
    db.from('newsletter_editions').select('channel_id, published_at').in('channel_id', ids),
    db.from('email_sequences').select('id, name').eq('tenant_id', tenantId),
  ])

  // reason: ver mapEdition.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seqName = new Map<string, string>(((seqRows ?? []) as any[]).map(s => [s.id, s.name]))
  const subs = new Map<string, number>()
  // reason: ver mapEdition.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const l of (leadRows ?? []) as any[]) {
    subs.set(l.acquisition_channel_id, (subs.get(l.acquisition_channel_id) ?? 0) + 1)
  }
  const editions = new Map<string, { count: number; last: string | null }>()
  // reason: ver mapEdition.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (editionRows ?? []) as any[]) {
    const cur = editions.get(e.channel_id) ?? { count: 0, last: null }
    cur.count += 1
    if (e.published_at && (!cur.last || e.published_at > cur.last)) cur.last = e.published_at
    editions.set(e.channel_id, cur)
  }

  return rows.map(r => ({
    id:                r.id,
    tenantId:          r.tenant_id,
    name:              r.name,
    slug:              r.slug,
    active:            r.active === true,
    emailSequenceId:   r.email_sequence_id ?? null,
    emailSequenceName: r.email_sequence_id ? (seqName.get(r.email_sequence_id) ?? null) : null,
    agentId:           r.agent_id ?? null,
    subscriberCount:   subs.get(r.id) ?? 0,
    editionCount:      editions.get(r.id)?.count ?? 0,
    lastEditionAt:     editions.get(r.id)?.last ?? null,
  }))
}

export async function getSeriesById(id: string, tenantId: string): Promise<NewsletterSeries | null> {
  const all = await getSeriesForTenant(tenantId)
  return all.find(s => s.id === id) ?? null
}

export async function getEditionsForSeries(channelId: string, tenantId: string): Promise<NewsletterEdition[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('newsletter_editions')
    .select(EDITION_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
  // reason: ver mapEdition.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map(mapEdition)
}

export async function getEditionById(id: string, tenantId: string): Promise<NewsletterEdition | null> {
  const db = createAdminClient()
  const { data } = await db
    .from('newsletter_editions')
    .select(EDITION_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return data ? mapEdition(data) : null
}
