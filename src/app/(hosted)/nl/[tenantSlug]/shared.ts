import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import {
  parseNewsletterContent, parseNewsletterSources,
  type NewsletterContent, type NewsletterSource,
} from '@/lib/newsletters/content'

// Datos públicos del escaparate de newsletters alojado
// (news.itmano.com/<tenant-slug>[/<edición>] → rewrite a /nl/...).
//
// Un tenant tiene UNA newsletter implícita: una fila de acquisition_channels
// con channel_type = 'newsletter' (105) que el usuario nunca ve ni elige
// (ver src/lib/newsletters/channel.ts). Con un solo canal por tenant, filtrar
// ediciones por canal ya no distingue nada — se acota directamente por
// tenant_id. Las EDICIONES tienen tabla propia y sólo estas columnas están
// concedidas a `anon` (105, paso 5): id, tenant_id, channel_id, slug, title,
// dek, language, translation_group_id, cover_image_url, content, sources,
// data_as_of, status, published_at, created_at. Aunque este módulo usa
// createAdminClient() (bypasea RLS), se respeta la misma lista — igual que
// web/[tenantSlug]/shared.ts hace con properties — para no filtrar ai_run,
// created_by_* ni unpublished_by_billing al público. Un select('*') real (con
// la anon key) daría 401.

export type PublicTenant = {
  id: string; name: string; slug: string; logo_url: string | null; primary_color: string | null
}

export type PublicEdition = {
  id: string
  tenant_id: string
  channel_id: string
  slug: string
  title: string
  dek: string | null
  language: string
  translation_group_id: string | null
  cover_image_url: string
  content: NewsletterContent | null
  sources: NewsletterSource[]
  data_as_of: string | null
  published_at: string | null
  created_at: string
}

const PUBLIC_TENANT_COLUMNS = columns('tenants', ['id', 'name', 'slug', 'logo_url', 'primary_color'])

// Exportada (no sólo la string ya unida) para que
// tests/newsletters/public-edition-columns-parity.test.ts pueda compararla,
// campo por campo, contra la copia que vive en
// src/lib/services/newsletter-integration-prompt.ts — el prompt que le
// promete a un desarrollador externo qué columnas puede pedir. Son dos
// listas mantenidas a mano de las mismas 15 columnas; nada más las fuerza a
// coincidir.
export const PUBLIC_EDITION_COLUMN_LIST = [
  'id', 'tenant_id', 'channel_id', 'slug', 'title', 'dek', 'language',
  'translation_group_id', 'cover_image_url', 'content', 'sources',
  'data_as_of', 'status', 'published_at', 'created_at',
] as const

const PUBLIC_EDITION_COLUMNS = columns('newsletter_editions', PUBLIC_EDITION_COLUMN_LIST)

export async function getPublicTenant(tenantSlug: string): Promise<PublicTenant | null> {
  const db = createAdminClient()
  const { data } = await db
    .from('tenants')
    .select(PUBLIC_TENANT_COLUMNS)
    .eq('slug', tenantSlug)
    .maybeSingle()
  return (data as PublicTenant | null) ?? null
}

const PUBLIC_CHANNEL_COLUMNS = columns('acquisition_channels', ['public_id'])

/**
 * El `public_id` del canal de newsletter del tenant, para el formulario de
 * suscripción (postea a `/api/intake/<publicId>/submit`).
 *
 * `null` si el tenant todavía no tiene canal (nadie ha escrito la primera
 * edición — `ensureNewsletterChannel` lo crea recién ahí) o si está inactivo:
 * el intake exige `active = true`, así que anunciar un formulario que el
 * servidor va a rechazar sería peor que no mostrarlo.
 */
export async function getPublicNewsletterChannel(tenantId: string): Promise<{ publicId: string } | null> {
  const db = createAdminClient()
  const { data } = await db
    .from('acquisition_channels')
    .select(PUBLIC_CHANNEL_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('channel_type', 'newsletter')
    .eq('active', true)
    .is('archived_at', null)
    .maybeSingle()
  const publicId = (data as { public_id: string } | null)?.public_id
  return publicId ? { publicId } : null
}

// reason: el cliente de Supabase no está tipado en este repo; `columns()` ya
// validó las listas contra el esquema, que es lo que el cast podría esconder.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEdition(row: any): PublicEdition {
  return {
    id:                   row.id,
    tenant_id:            row.tenant_id,
    channel_id:           row.channel_id,
    slug:                 row.slug,
    title:                row.title,
    dek:                  row.dek ?? null,
    language:             row.language,
    translation_group_id: row.translation_group_id ?? null,
    cover_image_url:      row.cover_image_url,
    content:              parseNewsletterContent(row.content),
    sources:              parseNewsletterSources(row.sources),
    data_as_of:           row.data_as_of ?? null,
    published_at:         row.published_at ?? null,
    created_at:           row.created_at,
  }
}

/** Ediciones publicadas del tenant, más recientes primero. */
export async function getPublicEditions(tenantId: string): Promise<PublicEdition[]> {
  const db = createAdminClient()
  const { data, error } = await db
    .from('newsletter_editions')
    .select(PUBLIC_EDITION_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .eq('unpublished_by_billing', false)
    .order('published_at', { ascending: false })
  if (error || !data) return []

  // reason: ver mapEdition.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map(mapEdition)
}

export async function getPublicEdition(tenantId: string, editionSlug: string): Promise<PublicEdition | null> {
  const db = createAdminClient()
  const { data } = await db
    .from('newsletter_editions')
    .select(PUBLIC_EDITION_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('slug', editionSlug)
    .eq('status', 'published')
    .eq('unpublished_by_billing', false)
    .maybeSingle()
  if (!data) return null
  return mapEdition(data)
}

// ── Parámetros para el prerender (ISR) ───────────────────────────────────────
// Sin generateStaticParams, un segmento dinámico NO entra al manifiesto de
// prerender y `export const revalidate` se ignora: la ruta se renderiza entera
// en cada visita. Verificado y documentado en web/[tenantSlug]/shared.ts.
//
// Devuelve [] si la lectura falla: un build no debe caerse porque la base no
// responda. Con dynamicParams (default true) las rutas que no estén en la
// lista se renderizan bajo demanda y a partir de ahí se cachean igual.

/**
 * Slugs de tenant a prerenderizar para la PORTADA (`/nl/<tenant>`): todos los
 * que tengan al menos una edición publicada. La portada de un tenant sin
 * ninguna edición publicada se sirve igual bajo demanda (dynamicParams).
 */
export async function getPublicTenantSlugs(): Promise<string[]> {
  const db = createAdminClient()
  const { data, error } = await db
    .from('newsletter_editions')
    .select(columns('newsletter_editions', ['tenant_id']))
    .eq('status', 'published')
    .eq('unpublished_by_billing', false)
  if (error || !data) return []

  const tenantIds = [
    // reason: ver mapEdition.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...new Set((data as any[]).map(r => r.tenant_id as string)),
  ]
  if (tenantIds.length === 0) return []

  const tenantSlugById = await getTenantSlugMap(db, tenantIds)
  if (!tenantSlugById) return []
  return [...tenantSlugById.values()]
}

/** slug del tenant por id. null si la lectura falla (el llamador devuelve []). */
async function getTenantSlugMap(
  db: ReturnType<typeof createAdminClient>,
  tenantIds: string[],
): Promise<Map<string, string> | null> {
  const { data, error } = await db
    .from('tenants')
    .select(columns('tenants', ['id', 'slug']))
    .in('id', tenantIds)
  if (error || !data) return null
  return new Map<string, string>(
    // reason: ver mapEdition.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data as any[]).map(t => [t.id as string, t.slug as string]),
  )
}

/**
 * Rutas de EDICIÓN a prerenderizar (`/nl/<tenant>/<edición>`): todas las
 * ediciones publicadas y no degradadas por facturación.
 */
export async function getPublicNewsletterPaths(): Promise<
  { tenantSlug: string; editionSlug: string }[]
> {
  const db = createAdminClient()
  const { data, error } = await db
    .from('newsletter_editions')
    .select(columns('newsletter_editions', ['slug', 'tenant_id']))
    .eq('status', 'published')
    .eq('unpublished_by_billing', false)
  if (error || !data) return []

  // reason: ver mapEdition.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantIds = [...new Set((data as any[]).map(r => r.tenant_id as string))]
  if (tenantIds.length === 0) return []

  const tenantSlugById = await getTenantSlugMap(db, tenantIds)
  if (!tenantSlugById) return []

  // reason: ver mapEdition.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[])
    .map(r => ({
      tenantSlug:  tenantSlugById.get(r.tenant_id as string),
      editionSlug: r.slug as string | undefined,
    }))
    .filter((p): p is { tenantSlug: string; editionSlug: string } => !!p.tenantSlug && !!p.editionSlug)
}
