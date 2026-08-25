import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import {
  parseNewsletterContent, parseNewsletterSources,
  type NewsletterContent, type NewsletterSource,
} from '@/lib/newsletters/content'

// Datos públicos del escaparate de newsletters alojado
// (news.itmano.com/<tenant-slug>[/<serie>[/<edición>]] → rewrite a /nl/...).
//
// La SERIE es una fila de acquisition_channels con channel_type = 'newsletter'
// (105) — mismo patrón que src/lib/data/newsletters.ts. Las EDICIONES tienen
// tabla propia y sólo estas columnas están concedidas a `anon` (105, paso 5):
// id, tenant_id, channel_id, slug, title, dek, language, translation_group_id,
// cover_image_url, content, sources, data_as_of, status, published_at,
// created_at. Aunque este módulo usa createAdminClient() (bypasea RLS), se
// respeta la misma lista — igual que web/[tenantSlug]/shared.ts hace con
// properties — para no filtrar ai_run, created_by_* ni unpublished_by_billing
// al público. Un select('*') real (con la anon key) daría 401.

export type PublicTenant = {
  id: string; name: string; slug: string; logo_url: string | null; primary_color: string | null
}

export type PublicSeries = {
  id: string
  tenant_id: string
  name: string
  slug: string
  // Llave del canal para postear al intake público (/api/intake/<public_id>/submit)
  // desde el formulario de suscripción — mismo contrato que hp/[..]/hosted-form.tsx.
  public_id: string
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
  // No es columna propia: viene del embed de acquisition_channels para no
  // obligar a cada llamador a resolver la serie aparte.
  series_slug: string
  series_name: string
}

const PUBLIC_TENANT_COLUMNS = columns('tenants', ['id', 'name', 'slug', 'logo_url', 'primary_color'])

const PUBLIC_SERIES_COLUMNS = columns('acquisition_channels', ['id', 'tenant_id', 'name', 'slug', 'public_id'])

// Sólo lo que hace falta para el embed (badge + link) — no se expone nada más
// del canal en la página pública.
const SERIES_EMBED_COLUMNS = columns('acquisition_channels', ['slug', 'name', 'channel_type', 'archived_at'])

const PUBLIC_EDITION_COLUMNS = columns('newsletter_editions', [
  'id', 'tenant_id', 'channel_id', 'slug', 'title', 'dek', 'language',
  'translation_group_id', 'cover_image_url', 'content', 'sources',
  'data_as_of', 'status', 'published_at', 'created_at',
])

export async function getPublicTenant(tenantSlug: string): Promise<PublicTenant | null> {
  const db = createAdminClient()
  const { data } = await db
    .from('tenants')
    .select(PUBLIC_TENANT_COLUMNS)
    .eq('slug', tenantSlug)
    .maybeSingle()
  return (data as PublicTenant | null) ?? null
}

/**
 * Series publicables del tenant, para la portada.
 *
 * Filtra por `active` además de por `archived_at`: el intake exige
 * `active = true` (ver api/intake/[publicId]/submit), así que anunciar una
 * serie apagada sería anunciar un formulario de suscripción que rechaza el
 * envío. El archivo de una serie apagada sigue siendo alcanzable por enlace
 * directo — eso no cambia.
 */
export async function getPublicSeriesList(tenantId: string): Promise<PublicSeries[]> {
  const db = createAdminClient()
  const { data, error } = await db
    .from('acquisition_channels')
    .select(PUBLIC_SERIES_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('channel_type', 'newsletter')
    .eq('active', true)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
  if (error || !data) return []
  // reason: ver mapEdition — el cliente de Supabase no esta tipado en este repo
  // y `columns()` ya valido la lista contra el esquema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]) as PublicSeries[]
}

export async function getPublicSeries(tenantId: string, seriesSlug: string): Promise<PublicSeries | null> {
  const db = createAdminClient()
  const { data } = await db
    .from('acquisition_channels')
    .select(PUBLIC_SERIES_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('channel_type', 'newsletter')
    .eq('slug', seriesSlug)
    .is('archived_at', null)
    .maybeSingle()
  return (data as PublicSeries | null) ?? null
}

// reason: el cliente de Supabase no está tipado en este repo; `columns()` ya
// validó las listas contra el esquema, que es lo que el cast podría esconder.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEdition(row: any): PublicEdition | null {
  // Defensivo: !inner garantiza el embed, pero si la serie está archivada o no
  // es de tipo newsletter, esta fila no es publicable (ver nota de archived_at
  // más abajo: se filtra aquí en vez de con dot-notation sobre el embed).
  const series = row.acquisition_channels
  if (!series || series.archived_at || series.channel_type !== 'newsletter') return null

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
    series_slug:          series.slug,
    series_name:          series.name,
  }
}

/**
 * Ediciones publicadas del tenant, más recientes primero. Con `channelId` se
 * acota a una sola serie (archivo de la serie); sin él trae todas (feed de
 * portada).
 */
export async function getPublicEditions(tenantId: string, channelId?: string): Promise<PublicEdition[]> {
  const db = createAdminClient()
  let query = db
    .from('newsletter_editions')
    .select(`${PUBLIC_EDITION_COLUMNS}, acquisition_channels!inner(${SERIES_EMBED_COLUMNS})`)
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .eq('unpublished_by_billing', false)
    .order('published_at', { ascending: false })

  if (channelId) query = query.eq('channel_id', channelId)

  const { data, error } = await query
  if (error || !data) return []

  // reason: ver mapEdition.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[])
    .map(mapEdition)
    .filter((e): e is PublicEdition => e !== null)
}

export async function getPublicEdition(
  tenantId: string, channelId: string, editionSlug: string,
): Promise<PublicEdition | null> {
  const db = createAdminClient()
  const { data } = await db
    .from('newsletter_editions')
    .select(`${PUBLIC_EDITION_COLUMNS}, acquisition_channels!inner(${SERIES_EMBED_COLUMNS})`)
    .eq('tenant_id', tenantId)
    .eq('channel_id', channelId)
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
 * Rutas de SERIE a prerenderizar: todas las series activas, tengan o no una
 * edición publicada.
 *
 * `getPublicNewsletterPaths` sólo conoce series que ya publicaron algo, y con
 * eso la página de una serie recién creada —la que lleva el formulario de
 * suscripción— quedaba fuera del manifiesto de prerender. Para una función
 * cuyo objetivo es captar suscriptores, eso dejaba la captación inalcanzable
 * justo al principio, que es cuando más falta hace.
 *
 * Devuelve [] si la lectura falla: un build no debe caerse porque la base no
 * responda.
 */
export async function getPublicSeriesPaths(): Promise<
  { tenantSlug: string; seriesSlug: string }[]
> {
  const db = createAdminClient()
  const { data, error } = await db
    .from('acquisition_channels')
    .select(columns('acquisition_channels', ['tenant_id', 'slug']))
    .eq('channel_type', 'newsletter')
    .eq('active', true)
    .is('archived_at', null)
  if (error || !data) return []

  const tenantSlugById = await getTenantSlugMap(db)
  if (!tenantSlugById) return []

  // reason: ver mapEdition.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[])
    .map(r => ({
      tenantSlug: tenantSlugById.get(r.tenant_id as string),
      seriesSlug: r.slug as string | undefined,
    }))
    .filter((p): p is { tenantSlug: string; seriesSlug: string } => !!p.tenantSlug && !!p.seriesSlug)
}

/** slug del tenant por id. null si la lectura falla (el llamador devuelve []). */
async function getTenantSlugMap(
  db: ReturnType<typeof createAdminClient>,
): Promise<Map<string, string> | null> {
  const { data, error } = await db.from('tenants').select(columns('tenants', ['id', 'slug']))
  if (error || !data) return null
  return new Map<string, string>(
    // reason: ver mapEdition.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data as any[]).map(t => [t.id as string, t.slug as string]),
  )
}

export async function getPublicNewsletterPaths(): Promise<
  { tenantSlug: string; seriesSlug: string; editionSlug: string }[]
> {
  const db = createAdminClient()
  const { data, error } = await db
    .from('newsletter_editions')
    .select(`slug, tenant_id, acquisition_channels!inner(${SERIES_EMBED_COLUMNS})`)
    .eq('status', 'published')
    .eq('unpublished_by_billing', false)
  if (error || !data) return []

  // reason: ver mapEdition.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data as any[]).filter(r => {
    const s = r.acquisition_channels
    return s && !s.archived_at && s.channel_type === 'newsletter'
  })
  if (rows.length === 0) return []

  const tenantSlugById = await getTenantSlugMap(db)
  if (!tenantSlugById) return []

  return rows
    .map(r => ({
      tenantSlug:  tenantSlugById.get(r.tenant_id as string),
      seriesSlug:  r.acquisition_channels?.slug as string | undefined,
      editionSlug: r.slug as string | undefined,
    }))
    .filter((p): p is { tenantSlug: string; seriesSlug: string; editionSlug: string } =>
      !!p.tenantSlug && !!p.seriesSlug && !!p.editionSlug)
}
