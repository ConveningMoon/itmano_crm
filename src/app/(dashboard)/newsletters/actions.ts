'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { guarded } from '@/lib/actions/guarded'
import { requireTenantContext, type TenantContext } from '@/lib/auth/tenant-context'
import { assertCanWriteEdition, assertCanWriteChannel, requireChannelWriteAccess } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { canUseNewsletters } from '@/lib/access/newsletters'
import { publishBlockers, PLACEHOLDER_COVER_URL } from '@/lib/newsletters/publishable'
import { NewsletterContentSchema, NewsletterSourceSchema, CONTENT_LIMITS } from '@/lib/newsletters/content'
import type { NewsletterContent, NewsletterSource } from '@/lib/newsletters/content'
import { slugify, uniqueSlug, isUniqueViolation } from '@/lib/newsletters/slug'
import { deleteOrphanMedia, editionMediaUrls } from '@/lib/newsletters/media'
import { buildNewsletterIntegrationPrompt } from '@/lib/services/newsletter-integration-prompt'
import { hostedNewsletterUrl } from '@/lib/hosted-page'
import { getEditionById } from '@/lib/data/newsletters'
import { getTenantAccessFor } from '@/lib/subscriptions/access-server'
import { SUPPORTED_LANGUAGE_CODES } from '@/lib/config'
import { generateNewsletterDraft } from '@/lib/newsletters/ai/generate'
import { generateCover } from '@/lib/newsletters/ai/cover'
import type { SubscriptionPlan } from '@/lib/subscriptions'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

// Cada action revalida su ruta pública además de la del CRM: publicar tiene que
// verse ya, no en la próxima ventana de ISR.
//
// El slug de la SERIE no es opcional en la práctica: sin él, las dos rutas más
// profundas nunca se revalidan y publicar deja hasta `revalidate` segundos de
// 404 cacheado (y despublicar, otros tantos de edición legible). Por eso toda
// action que toca una edición lo resuelve antes con `seriesSlugFor`.
function revalidateAll(tenantSlug: string, seriesSlug?: string | null, editionSlug?: string | null) {
  revalidatePath('/newsletters')
  if (!tenantSlug) return
  revalidatePath(`/nl/${tenantSlug}`)
  if (!seriesSlug) return
  revalidatePath(`/nl/${tenantSlug}/${seriesSlug}`)
  if (editionSlug) revalidatePath(`/nl/${tenantSlug}/${seriesSlug}/${editionSlug}`)
}

const CHANNEL_SLUG_COLUMNS = columns('acquisition_channels', ['slug'])
const CHANNEL_GUARD_COLUMNS = columns('acquisition_channels', ['id', 'tenant_id', 'agent_id', 'channel_type', 'slug'])

/** Slug de la serie a la que cuelga una edición — el que falta para revalidar. */
async function seriesSlugFor(
  db: ReturnType<typeof createAdminClient>,
  tenantId: string,
  channelId: string,
): Promise<string | null> {
  const { data } = await db
    .from('acquisition_channels')
    .select(CHANNEL_SLUG_COLUMNS)
    .eq('id', channelId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return (data as { slug: string } | null)?.slug ?? null
}

/**
 * Un agente sólo puede crear o mantener series a su nombre: no las regala ni
 * las convierte en "Toda la agencia". Mismo criterio que `ownerAgentFor` de
 * sources/actions.ts.
 */
function ownerAgentFor(ctx: TenantContext, requested: string | null): string | null {
  return ctx.role === 'agent' ? (ctx.agent_id ?? null) : requested
}

// Mismo generador que usa src/app/(dashboard)/sources/actions.ts para las
// demás fuentes: el CHECK de la base (`^chn_[a-z0-9]{12}$`) exige exactamente
// 12 caracteres [a-z0-9], y solo un bucle sobre ese alfabeto lo garantiza.
function genPublicId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return `chn_${s}`
}

const TENANT_COLUMNS = columns('tenants', ['slug'])
const SUBSCRIPTION_COLUMNS = columns('subscriptions', ['plan'])

/**
 * Contexto + gate de plan. Toda action pasa por aquí: la ruta no es la única
 * puerta.
 *
 * El plan NO vive en `tenants` (esa tabla no tiene columna `subscription_plan`):
 * vive en `subscriptions.plan`, una fila aparte por tenant (ver
 * src/lib/subscriptions/access-server.ts). Sin fila de suscripción se asume
 * 'esencial', igual que ese helper.
 */
async function guard() {
  const ctx = await requireTenantContext()
  if (!ctx.tenant_id) return { ctx: null, error: 'Selecciona un tenant primero.' as const }
  // Narrowed aparte de `ctx.tenant_id`: el campo del tipo `TenantContext` sigue
  // siendo `string | null` fuera de este scope aunque aquí ya esté probado, así
  // que las funciones de datos que exigen `tenantId: string` (getEditionById)
  // necesitan este valor, no `ctx.tenant_id` releído desde `g`.
  const tenantId = ctx.tenant_id
  const db = createAdminClient()
  const [{ data: tenantRow }, { data: subRow }] = await Promise.all([
    db.from('tenants').select(TENANT_COLUMNS).eq('id', tenantId).maybeSingle(),
    db.from('subscriptions').select(SUBSCRIPTION_COLUMNS).eq('tenant_id', tenantId).maybeSingle(),
  ])
  // reason: el cliente de Supabase no está tipado en este repo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = tenantRow as any
  // reason: ver arriba.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sub = subRow as any
  const plan = (sub?.plan ?? 'esencial') as SubscriptionPlan
  if (!canUseNewsletters({ role: ctx.role }, plan)) {
    return { ctx: null, error: 'Tu plan no incluye newsletters.' as const }
  }
  return { ctx, tenantId, db, tenantSlug: (tenant?.slug as string) ?? '', error: null }
}

const SeriesInput = z.object({
  name:            z.string().trim().min(1, 'La serie necesita un nombre').max(120),
  emailSequenceId: z.string().uuid().nullable(),
  agentId:         z.string().nullable(),
})

async function createSeriesImpl(input: unknown): Promise<Result<{ id: string }>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }
  const denied = requireChannelWriteAccess(g.ctx)
  if (denied) return denied
  const parsed = SeriesInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  // El índice único de la base es (tenant_id, slug) sobre TODOS los canales del
  // tenant, no sólo sobre las series: llamar "Contacto" a una serie cuando ya
  // hay un formulario "Contacto" reventaba con el error crudo de Postgres, en
  // inglés, en pantalla. Se busca el primer slug libre entre todos los canales.
  const { data: taken } = await g.db
    .from('acquisition_channels')
    .select(CHANNEL_SLUG_COLUMNS)
    .eq('tenant_id', g.tenantId)
  const slug = uniqueSlug(
    slugify(parsed.data.name),
    // reason: el cliente de Supabase no está tipado en este repo.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((taken ?? []) as any[]).map(c => c.slug as string),
  )

  const { data, error } = await g.db.from('acquisition_channels').insert({
    tenant_id:         g.tenantId,
    public_id:         genPublicId(),
    channel_type:      'newsletter',
    name:              parsed.data.name,
    slug,
    email_sequence_id: parsed.data.emailSequenceId,
    agent_id:          ownerAgentFor(g.ctx, parsed.data.agentId),
  }).select('id').maybeSingle()

  // La comprobación de arriba quita el caso corriente, no la carrera de dos
  // creaciones simultáneas: el índice sigue siendo la garantía y aquí sólo se
  // traduce su mensaje.
  if (error) {
    return { ok: false, error: isUniqueViolation(error)
      ? 'Ya existe otra fuente con ese nombre. Elige uno distinto.'
      : error.message }
  }
  // `maybeSingle()` devuelve data null SIN error cuando el insert no puede
  // leer de vuelta la fila que acaba de escribir. Leerle `.id` a ese null
  // lanzaba un TypeError que salía del action como excepción: el cliente veía
  // la pantalla genérica de Next en vez de un motivo. Ahora es un `{ ok: false }`
  // como cualquier otro fallo.
  // reason: ver guard().
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const creada = (data as any)?.id as string | undefined
  if (!creada) {
    return { ok: false, error: 'La serie se creó pero la base no devolvió su id. Recarga la página para verla.' }
  }
  revalidateAll(g.tenantSlug, slug)
  return { ok: true, data: { id: creada } }
}

async function updateSeriesImpl(id: string, input: unknown): Promise<Result<null>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }
  const denied = requireChannelWriteAccess(g.ctx)
  if (denied) return denied
  const parsed = SeriesInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  // Un `agent` sólo administra las series que son suyas — el mismo guard que
  // /sources aplica a cualquier otro canal. Sin esto, arreglar el permiso de
  // las ediciones y dejar abierta la serie era incoherente: un agente podía
  // renombrar o revincular la serie de un compañero.
  const { data: channelRow } = await g.db
    .from('acquisition_channels')
    .select(CHANNEL_GUARD_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', g.tenantId)
    .eq('channel_type', 'newsletter')
    .maybeSingle()
  const channel = channelRow as { tenant_id: string; agent_id: string | null; slug: string } | null
  if (!channel) return { ok: false, error: 'Esa serie no existe.' }
  const notMine = assertCanWriteChannel(g.ctx, channel)
  if (notMine) return notMine

  const { error } = await g.db.from('acquisition_channels').update({
    name:              parsed.data.name,
    email_sequence_id: parsed.data.emailSequenceId,
    agent_id:          ownerAgentFor(g.ctx, parsed.data.agentId),
  }).eq('id', id).eq('tenant_id', g.tenantId).eq('channel_type', 'newsletter')

  if (error) return { ok: false, error: error.message }
  // El slug NO cambia al renombrar: la URL pública ya está compartida e
  // indexada. Se revalida el archivo de la serie porque su título sí cambia.
  revalidateAll(g.tenantSlug, channel.slug)
  return { ok: true, data: null }
}

// ─── Archivar → eliminar una serie ──────────────────────────────────

// Mismo mecanismo que /sources para cualquier otro canal (`archiveChannel` /
// `deleteChannelPermanently` en sources/actions.ts): la serie ES una fila de
// acquisition_channels, así que archivar es `active = false` + `archived_at`, y
// eliminar sólo se permite sobre lo ya archivado.
//
// Las series de newsletter NO aparecen en /sources —la consulta base de esa
// página filtra por lead_magnet/event/contact_form—, por eso el mismo par de
// acciones tiene que existir aquí en vez de reutilizar aquellas.
const SERIES_STATE_COLUMNS = columns('acquisition_channels', [
  'id', 'tenant_id', 'agent_id', 'channel_type', 'slug', 'name', 'archived_at',
])

interface SeriesRow {
  id:          string
  tenant_id:   string
  agent_id:    string | null
  slug:        string
  name:        string
  archived_at: string | null
}

/** Carga la serie comprobando tenant, tipo y propiedad del agente. */
async function loadSeriesForWrite(
  g: { ctx: TenantContext; tenantId: string; db: ReturnType<typeof createAdminClient> },
  id: string,
): Promise<SeriesRow | { error: string }> {
  const { data } = await g.db
    .from('acquisition_channels')
    .select(SERIES_STATE_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', g.tenantId)
    .eq('channel_type', 'newsletter')
    .maybeSingle()
  const row = data as SeriesRow | null
  if (!row) return { error: 'Esa serie no existe.' }
  const notMine = assertCanWriteChannel(g.ctx, row)
  if (notMine) return { error: notMine.error }
  return row
}

async function archiveSeriesImpl(id: string): Promise<Result<null>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }
  const denied = requireChannelWriteAccess(g.ctx)
  if (denied) return denied
  const series = await loadSeriesForWrite(g, id)
  if ('error' in series) return { ok: false, error: series.error }

  // `active = false` además de `archived_at`: el intake exige `active = true`
  // (api/intake/[publicId]/submit), así que sin las dos cosas el formulario de
  // suscripción de una serie retirada seguiría aceptando altas.
  const { error } = await g.db.from('acquisition_channels')
    .update({ active: false, archived_at: new Date().toISOString() })
    .eq('id', id).eq('tenant_id', g.tenantId).eq('channel_type', 'newsletter')
  if (error) return { ok: false, error: error.message }

  // Las ediciones NO se tocan: siguen publicadas en la base. Lo que las saca de
  // la web es que `getPublicSeries` descarta la serie archivada (ver
  // (hosted)/nl/[tenantSlug]/shared.ts), y por eso hay que revalidar la ruta de
  // la serie — si no, el archivo público se sigue sirviendo desde el caché.
  revalidateAll(g.tenantSlug, series.slug)
  return { ok: true, data: null }
}

async function restoreSeriesImpl(id: string): Promise<Result<null>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }
  const denied = requireChannelWriteAccess(g.ctx)
  if (denied) return denied
  const series = await loadSeriesForWrite(g, id)
  if ('error' in series) return { ok: false, error: series.error }

  // Restaurar existe porque el par archivar→eliminar de Fuentes no lo tiene y
  // eso convierte un clic de más en una pérdida: aquí la serie arrastra sus
  // suscriptores y su archivo público, que es demasiado para dejarlo sin vuelta.
  const { error } = await g.db.from('acquisition_channels')
    .update({ active: true, archived_at: null })
    .eq('id', id).eq('tenant_id', g.tenantId).eq('channel_type', 'newsletter')
  if (error) return { ok: false, error: error.message }

  revalidateAll(g.tenantSlug, series.slug)
  return { ok: true, data: null }
}

async function deleteSeriesImpl(id: string): Promise<Result<null>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }
  const denied = requireChannelWriteAccess(g.ctx)
  if (denied) return denied
  const series = await loadSeriesForWrite(g, id)
  if ('error' in series) return { ok: false, error: series.error }

  // El mismo cierre que deleteChannelPermanently: sólo se elimina lo archivado.
  if (!series.archived_at) {
    return { ok: false, error: 'Primero archiva la serie antes de eliminarla permanentemente.' }
  }

  // newsletter_editions.channel_id es ON DELETE CASCADE: borrar la serie borra
  // TODAS sus ediciones, publicadas incluidas. La UI lo dice con esas palabras
  // antes de confirmar; aquí no hay nada que añadir salvo dejarlo escrito.
  //
  // Los leads suscritos se conservan: su FK es ON DELETE SET NULL, así que
  // pierden la atribución al canal pero no desaparecen — mismo criterio que
  // deleteChannelPermanently.
  const { error: orphanErr } = await g.db.from('leads')
    .update({ acquisition_channel_id: null })
    .eq('tenant_id', g.tenantId)
    .eq('acquisition_channel_id', id)
  if (orphanErr) return { ok: false, error: orphanErr.message }

  const { error } = await g.db.from('acquisition_channels')
    .delete().eq('id', id).eq('tenant_id', g.tenantId).eq('channel_type', 'newsletter')
  if (error) return { ok: false, error: error.message }

  revalidateAll(g.tenantSlug, series.slug)
  return { ok: true, data: null }
}

/**
 * El mismo control de propiedad que usa `createEdition` para aceptar un
 * `channelId` que llega del cliente: sin esto, cualquiera podía colgar una
 * edición del canal de OTRO tenant (misma tenant_id propia, pero channel_id
 * ajeno) — la fila quedaría visible en la página pública de un tercero. Mismo
 * mensaje para "no existe" y "no es tuyo": no le confirmes al atacante que el
 * id es real.
 *
 * Un solo camino de validación para las dos formas de crear una edición (a
 * mano y con IA): duplicarlo es cómo se desincronizan.
 */
async function resolveEditionChannel(
  db: ReturnType<typeof createAdminClient>,
  tenantId: string,
  channelId: string,
): Promise<{ id: string; slug: string } | null> {
  const { data: channelRow } = await db
    .from('acquisition_channels')
    .select(CHANNEL_GUARD_COLUMNS)
    .eq('id', channelId)
    .maybeSingle()
  // reason: el cliente de Supabase no está tipado en este repo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channel = channelRow as any
  if (!channel || channel.tenant_id !== tenantId || channel.channel_type !== 'newsletter') return null
  return { id: channel.id as string, slug: channel.slug as string }
}

interface EditionRowFields {
  title:         string
  dek:           string | null
  language:      string
  coverImageUrl: string
  coverSource:   'upload' | 'studio' | 'ai'
  content:       NewsletterContent
  sources:       NewsletterSource[]
  dataAsOf:      string | null
  /** Sólo true cuando la edición nace del orquestador de IA. */
  aiGenerated?:  boolean
  aiRun?:        Record<string, unknown> | null
}

/**
 * Inserta la fila de una edición nueva: slug uniquificado incluido. El único
 * camino de inserción, para que la creación a mano y la generada con IA se
 * comporten exactamente igual — duplicar la generación de slug es cómo se
 * desincronizan dos caminos que deben ser uno.
 */
async function insertEditionRow(
  db:       ReturnType<typeof createAdminClient>,
  ctx:      TenantContext,
  tenantId: string,
  channelId: string,
  fields:   EditionRowFields,
): Promise<Result<{ id: string }>> {
  // Antes el slug llevaba un sufijo `-<timestamp base36>` SIEMPRE: feo en la
  // URL pública y aun así colisionable si dos inserciones del mismo canal y
  // título caían en el mismo milisegundo. Ahora se usa el slug limpio y sólo
  // se numera cuando hace falta.
  const { data: takenRows } = await db
    .from('newsletter_editions')
    .select(columns('newsletter_editions', ['slug']))
    .eq('tenant_id', tenantId)
    .eq('channel_id', channelId)
  const slug = uniqueSlug(
    slugify(fields.title),
    // reason: el cliente de Supabase no está tipado en este repo.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((takenRows ?? []) as any[]).map(e => e.slug as string),
  )

  const { data, error } = await db.from('newsletter_editions').insert({
    tenant_id:           tenantId,
    channel_id:          channelId,
    slug,
    title:               fields.title,
    dek:                 fields.dek,
    language:            fields.language,
    cover_image_url:     fields.coverImageUrl,
    cover_source:        fields.coverSource,
    content:             fields.content,
    sources:             fields.sources,
    data_as_of:          fields.dataAsOf,
    status:              'draft',
    ai_generated:        fields.aiGenerated ?? false,
    ai_run:              fields.aiRun ?? null,
    created_by_agent_id: ctx.agent_id ?? null,
    created_by_user_id:  ctx.user_id,
  }).select('id').maybeSingle()

  if (error) {
    return { ok: false, error: isUniqueViolation(error)
      ? 'Ya existe otra edición con ese titular en esta serie. Cámbialo un poco.'
      : error.message }
  }
  // Mismo caso que en createSeries: data null sin error no puede convertirse en
  // un TypeError que escape del action.
  // reason: ver guard().
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const creada = (data as any)?.id as string | undefined
  if (!creada) {
    return { ok: false, error: 'La edición se creó pero la base no devolvió su id. Recarga la página para verla.' }
  }
  return { ok: true, data: { id: creada } }
}

// `coverImageUrl` acepta URL absoluta (subida, Estudio o IA — todas públicas y
// con protocolo) O una ruta relativa que empieza en "/": el ÚNICO caso es
// `PLACEHOLDER_COVER_URL` más abajo (`/itmano_banner.webp`), deliberadamente
// relativo para que `next/image` no la rechace contra `images.remotePatterns`.
// Antes era `z.string().url(msg)` a secas, que rechaza cualquier ruta sin
// protocolo: TODA edición recién nacida de `generateEditionWithAi` traía esa
// portada relativa, así que ni "Guardar borrador" ni nada que dependiera de
// guardar primero (como generar la portada con IA) podía completarse hasta que
// alguien le cambiara la portada a mano — con el mismo mensaje que debía
// resolver el problema.
const COVER_URL_MESSAGE = 'La edición necesita una imagen de portada'
const coverImageUrlSchema = z.string().min(1, COVER_URL_MESSAGE).refine(
  v => /^https?:\/\//i.test(v) || (v.startsWith('/') && !v.startsWith('//')),
  COVER_URL_MESSAGE,
)

const EditionInput = z.object({
  channelId:     z.string().uuid(),
  // Los topes salen de CONTENT_LIMITS, la misma constante que declara el
  // `input_schema` con el que la IA redacta: si aquí cabe menos de lo que allí
  // se pide, la edición se pierde al guardarla.
  title:         z.string().trim().min(1, 'La edición necesita un titular').max(CONTENT_LIMITS.editionTitle),
  dek:           z.string().trim().max(CONTENT_LIMITS.editionDek).nullable(),
  // El enum del repo, no una longitud: `z.string().min(2).max(3)` dejaba pasar
  // cualquier trigrama hasta el CHECK de la base, que rebota con un error crudo
  // de Postgres en inglés.
  language:      z.enum(SUPPORTED_LANGUAGE_CODES as [string, ...string[]]),
  coverImageUrl: coverImageUrlSchema,
  coverSource:   z.enum(['upload', 'studio', 'ai']),
  content:       NewsletterContentSchema,
  sources:       z.array(NewsletterSourceSchema).max(40),
  dataAsOf:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
})

async function createEditionImpl(input: unknown): Promise<Result<{ id: string }>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }
  const parsed = EditionInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const channel = await resolveEditionChannel(g.db, g.tenantId, d.channelId)
  if (!channel) return { ok: false, error: 'Esa serie no existe.' }

  const inserted = await insertEditionRow(g.db, g.ctx, g.tenantId, channel.id, {
    title:         d.title,
    dek:           d.dek,
    language:      d.language,
    coverImageUrl: d.coverImageUrl,
    coverSource:   d.coverSource,
    content:       d.content,
    sources:       d.sources,
    dataAsOf:      d.dataAsOf,
  })
  if (!inserted.ok) return inserted

  revalidateAll(g.tenantSlug, channel.slug)
  return inserted
}

async function updateEditionImpl(id: string, input: unknown): Promise<Result<null>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }
  const parsed = EditionInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const existing = await getEditionById(id, g.tenantId)
  if (!existing) return { ok: false, error: 'Esa edición no existe.' }
  const denial = assertCanWriteEdition(g.ctx, {
    tenant_id: existing.tenantId, created_by_user_id: existing.createdByUserId,
  })
  if (denial) return denial

  const { error } = await g.db.from('newsletter_editions').update({
    title:           d.title,
    dek:             d.dek,
    language:        d.language,
    cover_image_url: d.coverImageUrl,
    cover_source:    d.coverSource,
    content:         d.content,
    sources:         d.sources,
    data_as_of:      d.dataAsOf,
  }).eq('id', id).eq('tenant_id', g.tenantId)

  if (error) return { ok: false, error: error.message }

  // La portada anterior deja de existir para el producto en cuanto se guarda
  // la nueva: sin esto, cada cambio dejaba un archivo huérfano en el bucket que
  // ya no aparece en ninguna pantalla y que nadie iba a borrar nunca. Va
  // DESPUÉS del update, y sólo si de verdad cambió — ver media.ts para las tres
  // condiciones que se comprueban antes de tocar el storage.
  if (existing.coverImageUrl !== d.coverImageUrl) {
    await deleteOrphanMedia(g.db, g.tenantId, existing.coverImageUrl, id)
  }

  revalidateAll(g.tenantSlug, await seriesSlugFor(g.db, g.tenantId, existing.channelId), existing.slug)
  return { ok: true, data: null }
}

async function publishEditionImpl(id: string): Promise<Result<null>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }

  const edition = await getEditionById(id, g.tenantId)
  if (!edition) return { ok: false, error: 'Esa edición no existe.' }
  const denial = assertCanWriteEdition(g.ctx, {
    tenant_id: edition.tenantId, created_by_user_id: edition.createdByUserId,
  })
  if (denial) return denial

  // Estado de la SUSCRIPCIÓN, no del plan: `canUseNewsletters` (el gate de
  // guard()) sólo mira `subscriptions.plan` y deja publicar a un tenant
  // degradado. Con la retención cero decidida para newsletters, el cron de
  // ciclo de vida despublica el archivo entero al agotarse la gracia, así que
  // sin este corte el tenant republica hoy y el cron lo baja mañana: un bucle
  // silencioso y sin explicación. Mismo enfoque que assertPublishCap en
  // properties/actions.ts — el motivo va en el mensaje, no un error genérico.
  const access = await getTenantAccessFor(g.tenantId)
  if (!access.newslettersPublishable) {
    return {
      ok: false,
      error: 'Tu suscripción está inactiva, así que las newsletters no se pueden publicar. Al reactivarla vuelven a publicarse solas las que el sistema bajó.',
    }
  }

  // La MISMA función que usa el editor para deshabilitar el botón. Un check de
  // UI que el servidor no repite no es un check.
  //
  // `edition.content` y `edition.sources` ya vienen parseados por mapEdition
  // (data/newsletters.ts) — no los vuelvas a pasar por parseNewsletterContent.
  const blockers = publishBlockers({
    title:         edition.title,
    coverImageUrl: edition.coverImageUrl,
    content:       edition.content,
    sources:       edition.sources,
  })
  if (blockers.length > 0) return { ok: false, error: blockers[0].detail }

  const { error } = await g.db.from('newsletter_editions')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', id).eq('tenant_id', g.tenantId)

  if (error) return { ok: false, error: error.message }
  revalidateAll(g.tenantSlug, await seriesSlugFor(g.db, g.tenantId, edition.channelId), edition.slug)
  return { ok: true, data: null }
}

async function unpublishEditionImpl(id: string): Promise<Result<null>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }
  const existing = await getEditionById(id, g.tenantId)
  if (!existing) return { ok: false, error: 'Esa edición no existe.' }
  const denial = assertCanWriteEdition(g.ctx, {
    tenant_id: existing.tenantId, created_by_user_id: existing.createdByUserId,
  })
  if (denial) return denial

  const { error } = await g.db.from('newsletter_editions')
    .update({ status: 'draft' })
    .eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  // Despublicar es el caso donde MÁS importa llegar a la ruta de la edición:
  // sin revalidarla, la pieza retirada se sigue sirviendo desde el caché.
  revalidateAll(g.tenantSlug, await seriesSlugFor(g.db, g.tenantId, existing.channelId), existing.slug)
  return { ok: true, data: null }
}

/**
 * Retira una edición de circulación sin borrarla. Es el paso previo obligado a
 * eliminarla — el patrón de Fuentes: archivar y luego, si de verdad sobra,
 * eliminar.
 *
 * `published_at` NO se limpia: es el hecho de cuándo salió, no el interruptor
 * de si está fuera. Lo que la saca de la web es `status`, que
 * `getPublicEditions` filtra por 'published'.
 */
async function archiveEditionImpl(id: string): Promise<Result<null>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }
  const existing = await getEditionById(id, g.tenantId)
  if (!existing) return { ok: false, error: 'Esa edición no existe.' }
  const denial = assertCanWriteEdition(g.ctx, {
    tenant_id: existing.tenantId, created_by_user_id: existing.createdByUserId,
  })
  if (denial) return denial

  const { error } = await g.db.from('newsletter_editions')
    .update({ status: 'archived' })
    .eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  revalidateAll(g.tenantSlug, await seriesSlugFor(g.db, g.tenantId, existing.channelId), existing.slug)
  return { ok: true, data: null }
}

/**
 * Devuelve una edición archivada a BORRADOR, no a publicada: republicar tiene
 * que volver a pasar por `publishEdition`, que es quien comprueba el estado de
 * la suscripción y los bloqueos de contenido.
 */
async function restoreEditionImpl(id: string): Promise<Result<null>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }
  const existing = await getEditionById(id, g.tenantId)
  if (!existing) return { ok: false, error: 'Esa edición no existe.' }
  const denial = assertCanWriteEdition(g.ctx, {
    tenant_id: existing.tenantId, created_by_user_id: existing.createdByUserId,
  })
  if (denial) return denial

  const { error } = await g.db.from('newsletter_editions')
    .update({ status: 'draft' })
    .eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  revalidateAll(g.tenantSlug, await seriesSlugFor(g.db, g.tenantId, existing.channelId), existing.slug)
  return { ok: true, data: null }
}

async function deleteEditionImpl(id: string): Promise<Result<null>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }
  const existing = await getEditionById(id, g.tenantId)
  if (!existing) return { ok: false, error: 'Esa edición no existe.' }
  const denial = assertCanWriteEdition(g.ctx, {
    tenant_id: existing.tenantId, created_by_user_id: existing.createdByUserId,
  })
  if (denial) return denial

  // Mismo cierre que deleteChannelPermanently en /sources: sólo se elimina lo
  // archivado. Sin esto, el botón de eliminar borraba de un clic una edición
  // publicada — y una edición publicada tiene una URL que ya se compartió.
  if (existing.status !== 'archived') {
    return { ok: false, error: 'Primero archiva la edición antes de eliminarla permanentemente.' }
  }

  // El slug de la serie se resuelve ANTES del delete: después, la edición ya no
  // existe para decir de qué serie colgaba.
  const seriesSlug = await seriesSlugFor(g.db, g.tenantId, existing.channelId)

  const { error } = await g.db.from('newsletter_editions')
    .delete().eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }

  // Al borrar la fila, TODAS sus imágenes se quedan sin dueño: la portada y las
  // de los bloques de imagen. Antes sólo se limpiaba la portada y el cuerpo se
  // quedaba en el bucket para siempre. Se hace DESPUÉS del delete: así
  // `sigueEnUso` ya no puede contar a la propia edición.
  for (const url of editionMediaUrls(existing.coverImageUrl, existing.content)) {
    await deleteOrphanMedia(g.db, g.tenantId, url, id)
  }

  revalidateAll(g.tenantSlug, seriesSlug, existing.slug)
  return { ok: true, data: null }
}

// La subida de medios (portada, bloque de imagen) YA NO vive aquí como Server
// Action: ver src/app/api/newsletters/media/route.ts y el comentario de ese
// archivo — pasar un File binario por una Server Action corrompe la subida
// (mismo hallazgo documentado en src/app/api/properties/media/route.ts).

const GenerateInput = z.object({
  channelId: z.string().uuid(),
  topic:     z.string().trim().max(200).nullable(),
  language:  z.enum(SUPPORTED_LANGUAGE_CODES as [string, ...string[]]),
})

// Portada de arranque: `cover_image_url` es NOT NULL y la portada propia se
// genera DESPUÉS del texto (generateCoverForEdition, más abajo en este mismo
// archivo), para que la pieza refleje el titular real. Hasta entonces se apunta
// al banner genérico de ITMANO —el mismo que usa `brand-logo.tsx` cuando un
// tenant no tiene logo— en vez de inventar un asset nuevo. `cover_source` se
// guarda como 'upload', el valor por defecto de la columna: no es 'ai' porque
// ninguna IA generó esta imagen.
//
// El literal vive en `publishable.ts` porque quien lo pone y quien lo bloquea
// tienen que mirar el mismo valor: `publishBlockers` impide publicar mientras
// la portada siga siendo este marcador (fuga de marca en un producto
// white-label). Ahí está también el porqué de la ruta relativa.

/**
 * Genera una edición con IA y la guarda como BORRADOR.
 *
 * La IA nunca publica: devuelve el id para que el editor lo abra y una persona
 * decida. La portada se elige después — por eso entra con el marcador que el
 * CoverPicker sustituye.
 */
async function generateEditionWithAiImpl(input: unknown): Promise<Result<{ id: string }>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }

  const parsed = GenerateInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  // Mismo control de propiedad que crear una edición a mano: el canal existe,
  // es de este tenant y es una serie de newsletter.
  const channel = await resolveEditionChannel(g.db, g.tenantId, parsed.data.channelId)
  if (!channel) return { ok: false, error: 'Esa serie no existe.' }

  const generado = await generateNewsletterDraft({
    ctx:      g.ctx,
    topic:    parsed.data.topic,
    language: parsed.data.language,
  })
  if (!generado.ok) return generado

  const inserted = await insertEditionRow(g.db, g.ctx, g.tenantId, channel.id, {
    title:         generado.data.title,
    dek:           generado.data.dek || null,
    language:      parsed.data.language,
    coverImageUrl: PLACEHOLDER_COVER_URL,
    coverSource:   'upload',
    content:       generado.data.content,
    sources:       generado.data.sources,
    dataAsOf:      generado.data.dataAsOf,
    aiGenerated:   true,
    aiRun:         generado.data.aiRun,
  })
  if (!inserted.ok) return inserted

  revalidateAll(g.tenantSlug, channel.slug)
  return inserted
}

/**
 * Genera la portada de una edición con IA (src/lib/newsletters/ai/cover.ts) y
 * la deja guardada como `cover_source: 'ai'`.
 *
 * Mismo `guard()` y mismo control de propiedad que `updateEdition` y
 * `publishEdition`: generar una portada escribe sobre la edición, no es un
 * atajo aparte con permisos propios.
 *
 * Va DESPUÉS del texto a propósito — lo llama el editor, con el titular y la
 * bajada ya guardados, no el flujo de generación inicial.
 */
async function generateCoverForEditionImpl(editionId: string): Promise<Result<{ url: string }>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }

  const edition = await getEditionById(editionId, g.tenantId)
  if (!edition) return { ok: false, error: 'Esa edición no existe.' }
  const denial = assertCanWriteEdition(g.ctx, {
    tenant_id: edition.tenantId, created_by_user_id: edition.createdByUserId,
  })
  if (denial) return denial

  const result = await generateCover({ ctx: g.ctx, title: edition.title, topic: edition.dek ?? '' })
  if (!result.ok) return result

  const { error } = await g.db.from('newsletter_editions')
    .update({ cover_image_url: result.url, cover_source: 'ai' })
    .eq('id', editionId).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }

  // Generar portadas con IA invita a iterar, así que es aquí donde más rápido
  // se acumulaban huérfanos: cada reintento dejaba la anterior en el bucket.
  await deleteOrphanMedia(g.db, g.tenantId, edition.coverImageUrl, editionId)

  revalidateAll(g.tenantSlug, await seriesSlugFor(g.db, g.tenantId, edition.channelId), edition.slug)
  return { ok: true, data: { url: result.url } }
}


// ─── Prompt de integración ───────────────────────────────────────────────────

const SERIES_INTEGRATION_COLUMNS = columns('acquisition_channels', [
  'id', 'tenant_id', 'name', 'slug', 'public_id', 'channel_type', 'email_sequence_id',
])

/**
 * El contrato de integración de una serie, generado desde los datos VIGENTES.
 *
 * Mismo papel que `getIntegrationInfo` de /sources para los demás canales: el
 * tenant copia esto y se lo pasa a quien lleva su web (persona o IA). Se
 * regenera en cada lectura a propósito — vincular una secuencia o publicar el
 * archivo cambia el texto sin que nadie tenga que acordarse de actualizarlo.
 */
async function getSeriesIntegrationPromptImpl(seriesId: string): Promise<Result<{ prompt: string }>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }

  const { data } = await g.db
    .from('acquisition_channels')
    .select(SERIES_INTEGRATION_COLUMNS)
    .eq('id', seriesId)
    .eq('tenant_id', g.tenantId)
    .eq('channel_type', 'newsletter')
    .maybeSingle()
  const serie = data as {
    name: string; slug: string; public_id: string; email_sequence_id: string | null
  } | null
  if (!serie) return { ok: false, error: 'Esa serie no existe.' }

  const { data: tenantRow } = await g.db
    .from('tenants').select(columns('tenants', ['name'])).eq('id', g.tenantId).maybeSingle()
  const tenantName = (tenantRow as { name?: string } | null)?.name ?? 'tu agencia'

  const prompt = buildNewsletterIntegrationPrompt({
    tenantName,
    seriesName:  serie.name,
    publicId:    serie.public_id,
    baseUrl:     process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.itmano.com',
    archiveUrl:  g.tenantSlug ? hostedNewsletterUrl(g.tenantSlug, serie.slug) : null,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    // Pública por diseño: es la misma que viaja en cada página del CRM y la que
    // el front del cliente tiene que usar. La service_role no sale de aquí.
    anonKey:     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    hasSequence: serie.email_sequence_id !== null,
  })

  return { ok: true, data: { prompt } }
}


// ─── El borde con el cliente ─────────────────────────────────────────────────
//
// Cada action de este módulo sale por `guarded`: pase lo que pase dentro, el
// cliente recibe `{ ok: false, error }` con la causa, nunca una excepción. Sin
// esto, cualquier fallo inesperado —una fila que vuelve null, un helper que
// lanza dos capas abajo— llegaba al navegador como la pantalla genérica de Next
// ("A server error occurred"), que no dice qué pasó ni deja rastro que el
// usuario pueda contar. Ver src/lib/actions/guarded.ts.
//
// Los nombres exportados son los de siempre; lo que cambia es que la
// implementación vive en `<nombre>Impl` y nadie la llama directamente.

export async function createSeries(input: unknown): Promise<Result<{ id: string }>> {
  return guarded('createSeries', () => createSeriesImpl(input))
}

export async function updateSeries(id: string, input: unknown): Promise<Result<null>> {
  return guarded('updateSeries', () => updateSeriesImpl(id, input))
}

export async function archiveSeries(id: string): Promise<Result<null>> {
  return guarded('archiveSeries', () => archiveSeriesImpl(id))
}

export async function restoreSeries(id: string): Promise<Result<null>> {
  return guarded('restoreSeries', () => restoreSeriesImpl(id))
}

export async function deleteSeries(id: string): Promise<Result<null>> {
  return guarded('deleteSeries', () => deleteSeriesImpl(id))
}

export async function createEdition(input: unknown): Promise<Result<{ id: string }>> {
  return guarded('createEdition', () => createEditionImpl(input))
}

export async function updateEdition(id: string, input: unknown): Promise<Result<null>> {
  return guarded('updateEdition', () => updateEditionImpl(id, input))
}

export async function publishEdition(id: string): Promise<Result<null>> {
  return guarded('publishEdition', () => publishEditionImpl(id))
}

export async function unpublishEdition(id: string): Promise<Result<null>> {
  return guarded('unpublishEdition', () => unpublishEditionImpl(id))
}

export async function archiveEdition(id: string): Promise<Result<null>> {
  return guarded('archiveEdition', () => archiveEditionImpl(id))
}

export async function restoreEdition(id: string): Promise<Result<null>> {
  return guarded('restoreEdition', () => restoreEditionImpl(id))
}

export async function deleteEdition(id: string): Promise<Result<null>> {
  return guarded('deleteEdition', () => deleteEditionImpl(id))
}

export async function generateEditionWithAi(input: unknown): Promise<Result<{ id: string }>> {
  return guarded('generateEditionWithAi', () => generateEditionWithAiImpl(input))
}

export async function generateCoverForEdition(editionId: string): Promise<Result<{ url: string }>> {
  return guarded('generateCoverForEdition', () => generateCoverForEditionImpl(editionId))
}

export async function getSeriesIntegrationPrompt(seriesId: string): Promise<Result<{ prompt: string }>> {
  return guarded('getSeriesIntegrationPrompt', () => getSeriesIntegrationPromptImpl(seriesId))
}
