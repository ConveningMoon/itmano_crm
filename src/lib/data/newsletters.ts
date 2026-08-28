import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import {
  parseNewsletterContent, parseNewsletterSources,
  type NewsletterContent, type NewsletterSource,
} from '@/lib/newsletters/content'
import { parseSourceDomains } from '@/lib/newsletters/source-domains'
import { parseCategory, type NewsletterCategory } from '@/lib/newsletters/category'

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
  /** ISO cuando la serie está archivada; null mientras está viva. */
  archivedAt:        string | null
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
  category:             NewsletterCategory
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
  'archived_at',
])

const EDITION_COLUMNS = columns('newsletter_editions', [
  'id', 'tenant_id', 'channel_id', 'slug', 'title', 'dek', 'language',
  'translation_group_id', 'cover_image_url', 'cover_source', 'content', 'sources',
  'data_as_of', 'category', 'status', 'published_at', 'ai_generated', 'unpublished_by_billing',
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
    category:             parseCategory(row.category),
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

/**
 * Series de un tenant, vivas o archivadas según `archived`.
 *
 * Un solo cuerpo para los dos casos: la lista de archivadas necesita
 * exactamente los mismos conteos (suscriptores, ediciones) que la de vivas
 * —son lo que hay que mirar antes de eliminar una serie para siempre— y
 * duplicar el cálculo es cómo se desincronizan dos vistas que deben coincidir.
 */
async function listSeries(tenantId: string, archived: boolean): Promise<NewsletterSeries[]> {
  const db = createAdminClient()
  let q = db
    .from('acquisition_channels')
    .select(SERIES_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('channel_type', 'newsletter')
  q = archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null)
  const { data } = await q.order('created_at', { ascending: false })

  // reason: ver mapEdition.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[]
  if (rows.length === 0) return []

  const ids = rows.map(r => r.id as string)

  // Conteos en dos consultas agregadas en vez de N+1: pocas series, muchos leads.
  // El `.eq('tenant_id', ...)` es redundante con el `.in(ids)` mientras los ids
  // vengan ya acotados por tenant arriba, pero este módulo usa createAdminClient()
  // (bypasea RLS): no hay tirantes, así que el cinturón del filtro va explícito
  // en cada consulta, no solo donde nace la lista de ids.
  const [{ data: leadRows }, { data: editionRows }, { data: seqRows }] = await Promise.all([
    db.from('leads').select('acquisition_channel_id').eq('tenant_id', tenantId).in('acquisition_channel_id', ids),
    db.from('newsletter_editions').select('channel_id, published_at').eq('tenant_id', tenantId).in('channel_id', ids),
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
    archivedAt:        r.archived_at ?? null,
    subscriberCount:   subs.get(r.id) ?? 0,
    editionCount:      editions.get(r.id)?.count ?? 0,
    lastEditionAt:     editions.get(r.id)?.last ?? null,
  }))
}

export async function getSeriesForTenant(tenantId: string): Promise<NewsletterSeries[]> {
  return listSeries(tenantId, false)
}

/**
 * Las series archivadas. Existen para poder eliminarlas: archivar y luego
 * eliminar (el patrón de Fuentes) no se puede completar si lo archivado
 * desaparece de la pantalla.
 */
export async function getArchivedSeriesForTenant(tenantId: string): Promise<NewsletterSeries[]> {
  return listSeries(tenantId, true)
}

/**
 * Una serie por id, viva o archivada. Mira las dos listas a propósito: la
 * pantalla de detalle tiene que seguir abriendo una serie recién archivada,
 * que es justo donde vive el botón de eliminarla.
 */
export async function getSeriesById(id: string, tenantId: string): Promise<NewsletterSeries | null> {
  const [live, archived] = await Promise.all([
    getSeriesForTenant(tenantId),
    getArchivedSeriesForTenant(tenantId),
  ])
  return [...live, ...archived].find(s => s.id === id) ?? null
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

/**
 * Todas las ediciones del tenant, en cualquier estado, la más reciente primero.
 *
 * Sustituye a `getEditionsForSeries`: con una sola newsletter por tenant, filtrar
 * por canal ya no distingue nada.
 */
export async function getEditionsForTenant(tenantId: string): Promise<NewsletterEdition[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('newsletter_editions')
    .select(EDITION_COLUMNS)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  // reason: el cliente de Supabase no está tipado en este repo.
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

const SOURCE_DOMAINS_COLUMNS = columns('tenants', ['newsletter_source_domains'])

/**
 * La allowlist de fuentes del tenant, YA NORMALIZADA.
 *
 * Única puerta de lectura de `tenants.newsletter_source_domains`. Antes cada
 * pantalla la leía cruda y sólo el orquestador de IA la pasaba por
 * `parseSourceDomains`: una fila sembrada a mano por ITMANO con un valor que la
 * herramienta rechaza —una IP, un TLD desnudo, una URL entera— hacía que el
 * modal enseñara la lista llena y habilitara el botón, y que el servidor
 * rechazara la generación acto seguido. La UI y el servidor tienen que estar
 * mirando exactamente la misma lista.
 *
 * Lo que se descarta no se devuelve: `parseSourceDomains` ya separa lo
 * rechazado, y quien lo necesita para avisar es la pantalla de Ajustes, que lo
 * calcula sobre lo que el usuario acaba de escribir.
 */
export async function getSourceDomainsFor(tenantId: string): Promise<string[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('tenants')
    .select(SOURCE_DOMAINS_COLUMNS)
    .eq('id', tenantId)
    .maybeSingle()
  // reason: el cliente de Supabase no está tipado en este repo; columns() ya
  // validó la lista contra el esquema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return parseSourceDomains((data as any)?.newsletter_source_domains).domains
}
