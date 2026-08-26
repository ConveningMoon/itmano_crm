'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireTenantContext, type TenantContext } from '@/lib/auth/tenant-context'
import { assertCanWriteEdition, assertCanWriteChannel, requireChannelWriteAccess } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { canUseNewsletters } from '@/lib/access/newsletters'
import { publishBlockers } from '@/lib/newsletters/publishable'
import { NewsletterContentSchema, NewsletterSourceSchema } from '@/lib/newsletters/content'
import type { NewsletterContent, NewsletterSource } from '@/lib/newsletters/content'
import { slugify, uniqueSlug, isUniqueViolation } from '@/lib/newsletters/slug'
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

export async function createSeries(input: unknown): Promise<Result<{ id: string }>> {
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
  revalidateAll(g.tenantSlug, slug)
  // reason: ver guard().
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ok: true, data: { id: (data as any).id } }
}

export async function updateSeries(id: string, input: unknown): Promise<Result<null>> {
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
  // reason: ver guard().
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ok: true, data: { id: (data as any).id } }
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
  title:         z.string().trim().min(1, 'La edición necesita un titular').max(200),
  dek:           z.string().trim().max(400).nullable(),
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

export async function createEdition(input: unknown): Promise<Result<{ id: string }>> {
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

export async function updateEdition(id: string, input: unknown): Promise<Result<null>> {
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
  revalidateAll(g.tenantSlug, await seriesSlugFor(g.db, g.tenantId, existing.channelId), existing.slug)
  return { ok: true, data: null }
}

export async function publishEdition(id: string): Promise<Result<null>> {
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

export async function unpublishEdition(id: string): Promise<Result<null>> {
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

export async function deleteEdition(id: string): Promise<Result<null>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }
  const existing = await getEditionById(id, g.tenantId)
  if (!existing) return { ok: false, error: 'Esa edición no existe.' }
  const denial = assertCanWriteEdition(g.ctx, {
    tenant_id: existing.tenantId, created_by_user_id: existing.createdByUserId,
  })
  if (denial) return denial

  // El slug de la serie se resuelve ANTES del delete: después, la edición ya no
  // existe para decir de qué serie colgaba.
  const seriesSlug = await seriesSlugFor(g.db, g.tenantId, existing.channelId)

  const { error } = await g.db.from('newsletter_editions')
    .delete().eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
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

// Portada temporal: la generación de imagen llega en otra tarea (Task 7), y
// `cover_image_url` es NOT NULL. Se apunta al banner genérico de ITMANO —el
// mismo que usa `brand-logo.tsx` cuando un tenant no tiene logo— en vez de
// inventar un asset nuevo o depender de `hosted_page`, que hoy no se lee para
// series de newsletter (sólo lo usan lead magnets, eventos y formularios bajo
// /hp). `cover_source` se guarda como 'upload', el valor por defecto de la
// columna: no es 'ai' porque ninguna IA generó esta imagen, y es la opción que
// menos afirma sobre un origen que en realidad no existe todavía. El
// CoverPicker del editor la reemplaza antes de publicar.
//
// RUTA RELATIVA, no absoluta: las tres páginas públicas de newsletters pintan
// `cover_image_url` con `next/image`, que valida cualquier `src` que no
// empiece por `/` contra `images.remotePatterns` — donde sólo está el host de
// Supabase Storage. Una URL absoluta a `app.itmano.com` (o al que sea
// `NEXT_PUBLIC_APP_URL`) revienta con 500 en cuanto se publica, aunque la
// sirva la misma app: el rewrite por host de `news.itmano.com` no cambia qué
// host lleva el `src`. `/itmano_banner.webp` es el mismo patrón que ya usa
// `brand-logo.tsx:19` para este asset.
const PLACEHOLDER_COVER_URL = '/itmano_banner.webp'

/**
 * Genera una edición con IA y la guarda como BORRADOR.
 *
 * La IA nunca publica: devuelve el id para que el editor lo abra y una persona
 * decida. La portada se elige después — por eso entra con el marcador que el
 * CoverPicker sustituye.
 */
export async function generateEditionWithAi(input: unknown): Promise<Result<{ id: string }>> {
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
export async function generateCoverForEdition(editionId: string): Promise<Result<{ url: string }>> {
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

  revalidateAll(g.tenantSlug, await seriesSlugFor(g.db, g.tenantId, edition.channelId), edition.slug)
  return { ok: true, data: { url: result.url } }
}
