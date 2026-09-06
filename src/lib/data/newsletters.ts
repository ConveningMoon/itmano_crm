import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import {
  parseNewsletterContent, parseNewsletterSources,
  type NewsletterContent, type NewsletterSource,
} from '@/lib/newsletters/content'
import { parseSourceDomains } from '@/lib/newsletters/source-domains'
import { parseCategory, type NewsletterCategory } from '@/lib/newsletters/category'

// Acceso a datos de newsletters. Un tenant tiene UNA sola newsletter, un canal
// implícito (fila de acquisition_channels con channel_type = 'newsletter',
// creado por el sistema — ver src/lib/newsletters/channel.ts) que el usuario
// nunca ve ni elige. Lo que se lista y edita aquí son las EDICIONES, cada una
// con una categoría (informativo/educativo/análisis/anuncio) como etiqueta
// para el lector, no como una serie propia.

export type NewsletterStatus      = 'draft' | 'published' | 'archived'
export type NewsletterCoverSource = 'upload' | 'studio' | 'ai'

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
  authorAgentId:        string | null
  authorName:           string | null
  authorOrgName:        string | null
  authorAvatarUrl:      string | null
  authorTitle:          string | null
  createdAt:            string
  updatedAt:            string
}

const EDITION_COLUMNS = columns('newsletter_editions', [
  'id', 'tenant_id', 'channel_id', 'slug', 'title', 'dek', 'language',
  'translation_group_id', 'cover_image_url', 'cover_source', 'content', 'sources',
  'data_as_of', 'category', 'status', 'published_at', 'ai_generated', 'unpublished_by_billing',
  'created_by_agent_id', 'created_by_user_id', 'author_agent_id', 'author_name',
  'author_org_name', 'author_avatar_url', 'author_title',
  'created_at', 'updated_at',
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
    authorAgentId:        row.author_agent_id ?? null,
    authorName:           row.author_name ?? null,
    authorOrgName:        row.author_org_name ?? null,
    authorAvatarUrl:      row.author_avatar_url ?? null,
    authorTitle:          row.author_title ?? null,
    createdAt:            row.created_at,
    updatedAt:            row.updated_at,
  }
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
