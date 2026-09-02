'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { guarded } from '@/lib/actions/guarded'
import { requireTenantContext, type TenantContext } from '@/lib/auth/tenant-context'
import { assertCanWriteEdition } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { canUseNewsletters } from '@/lib/access/newsletters'
import { publishBlockers, PLACEHOLDER_COVER_URL } from '@/lib/newsletters/publishable'
import {
  NewsletterContentSchema, NewsletterSourceSchema, CONTENT_LIMITS,
  NEWSLETTER_CONTENT_VERSION,
} from '@/lib/newsletters/content'
import type { NewsletterContent, NewsletterSource } from '@/lib/newsletters/content'
import { NEWSLETTER_CATEGORIES, parseCategory, type NewsletterCategory } from '@/lib/newsletters/category'
import { ensureNewsletterChannel, ensureNewsletterSequence } from '@/lib/newsletters/channel'
import { slugify, uniqueSlug, isUniqueViolation } from '@/lib/newsletters/slug'
import { deleteOrphanMedia, editionMediaUrls } from '@/lib/newsletters/media'
import { buildNewsletterIntegrationPrompt } from '@/lib/services/newsletter-integration-prompt'
import { hostedNewsletterUrl } from '@/lib/hosted-page'
import { getEditionById } from '@/lib/data/newsletters'
import { resolveEditionAuthor, type EditionAuthor } from '@/lib/newsletters/author'
import { getTenantAccessFor } from '@/lib/subscriptions/access-server'
import { SUPPORTED_LANGUAGE_CODES } from '@/lib/config'
import { generateNewsletterDraft } from '@/lib/newsletters/ai/generate'
import { generateCover } from '@/lib/newsletters/ai/cover'
import type { SubscriptionPlan } from '@/lib/subscriptions'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

// Cada action revalida su ruta pública además de la del CRM: publicar tiene que
// verse ya, no en la próxima ventana de ISR.
//
// Con una sola newsletter por tenant, la URL pública ya no lleva slug de serie:
// sólo tenant y edición.
function revalidateAll(tenantSlug: string, editionSlug?: string | null) {
  revalidatePath('/newsletters')
  if (!tenantSlug) return
  revalidatePath(`/nl/${tenantSlug}`)
  if (editionSlug) revalidatePath(`/nl/${tenantSlug}/${editionSlug}`)
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

const AUTHOR_AGENT_COLUMNS = columns('agents', ['id', 'name', 'specialty'])
const AUTHOR_TENANT_COLUMNS = columns('tenants', ['name'])

/**
 * La firma que le corresponde a una edición.
 *
 * `agentId` explícito (el selector del editor) gana; si no, el agente vinculado
 * al login que está creando. Sin ninguno de los dos, firma la agencia. Nunca
 * devuelve null: una edición sin firma no debe existir.
 */
async function firmaPara(
  db: ReturnType<typeof createAdminClient>,
  tenantId: string,
  agentId: string | null,
): Promise<EditionAuthor> {
  const { data: tenantRow } = await db
    .from('tenants').select(AUTHOR_TENANT_COLUMNS).eq('id', tenantId).maybeSingle()
  // reason: el cliente de Supabase no está tipado en este repo; columns() ya
  // validó la lista contra el esquema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantName = ((tenantRow as any)?.name as string | undefined) ?? ''

  if (!agentId) return resolveEditionAuthor({ agent: null, tenantName })

  const { data: agentRow } = await db
    .from('agents').select(AUTHOR_AGENT_COLUMNS)
    .eq('id', agentId).eq('tenant_id', tenantId).eq('active', true).maybeSingle()
  // reason: ver arriba.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agent = agentRow as any as { id: string; name: string; specialty: string | null } | null

  // Un agentId de otro tenant o inactivo no firma: cae a la agencia en vez de
  // filtrar el nombre de alguien que no es de este equipo.
  return resolveEditionAuthor({ agent, tenantName })
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
  category:      string
  /** Sólo true cuando la edición nace del orquestador de IA. */
  aiGenerated?:  boolean
  aiRun?:        Record<string, unknown> | null
  /** Quién firma. Resuelto por `firmaPara` antes de llamar — nunca null. */
  author:        EditionAuthor
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
    category:            fields.category,
    status:              'draft',
    ai_generated:        fields.aiGenerated ?? false,
    ai_run:              fields.aiRun ?? null,
    created_by_agent_id: ctx.agent_id ?? null,
    created_by_user_id:  ctx.user_id,
    author_agent_id:     fields.author.agentId,
    author_name:         fields.author.name,
    author_title:        fields.author.title,
  }).select('id').maybeSingle()

  if (error) {
    return { ok: false, error: isUniqueViolation(error)
      ? 'Ya existe otra edición con ese titular. Cámbialo un poco.'
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
  category:      z.enum(NEWSLETTER_CATEGORIES as unknown as [string, ...string[]]).default('informativo'),
  // Sólo lo usa updateEditionImpl (el editor de una edición existente); las
  // otras dos vías de creación firman con el agente del contexto, sin que el
  // formulario elija. `undefined` (la clave ausente) significa "no tocar la
  // firma"; `null` es una elección explícita: "firma la agencia".
  authorAgentId: z.string().trim().min(1).nullable().optional(),
})

async function createEditionImpl(input: unknown): Promise<Result<{ id: string }>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }
  const parsed = EditionInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const canal = await ensureNewsletterChannel(g.db, g.tenantId)
  if ('error' in canal) return { ok: false, error: canal.error }
  // La secuencia se prepara aquí y no al suscribirse: así el usuario la ve en
  // /emails desde su primera edición y puede escribirle los correos antes de
  // que llegue nadie. Best-effort: sin secuencia se puede escribir igual.
  await ensureNewsletterSequence(g.db, g.tenantId, canal.id)

  const firma = await firmaPara(g.db, g.tenantId, g.ctx.agent_id ?? null)

  const inserted = await insertEditionRow(g.db, g.ctx, g.tenantId, canal.id, {
    title:         d.title,
    dek:           d.dek,
    language:      d.language,
    coverImageUrl: d.coverImageUrl,
    coverSource:   d.coverSource,
    author:        firma,
    content:       d.content,
    sources:       d.sources,
    dataAsOf:      d.dataAsOf,
    category:      d.category,
  })
  if (!inserted.ok) return inserted

  revalidateAll(g.tenantSlug)
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

  // El objeto del update NO es fijo: `authorAgentId` sólo llega cuando el
  // editor trae un selector de firma (ver author-picker.tsx), así que sólo se
  // reescriben las tres columnas de firma cuando la clave está presente —
  // incluso en `null`, que es la elección explícita "firma la agencia". Su
  // ausencia (`undefined`) dejaría la firma actual intacta, pero hoy el editor
  // siempre la manda, así que cada guardado refresca la instantánea contra el
  // agente vigente.
  // reason: el cliente de Supabase no está tipado en este repo; columns() ya
  // validó cada nombre de columna que entra aquí.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {
    title:           d.title,
    dek:             d.dek,
    language:        d.language,
    cover_image_url: d.coverImageUrl,
    cover_source:    d.coverSource,
    content:         d.content,
    sources:         d.sources,
    data_as_of:      d.dataAsOf,
    category:        d.category,
  }
  if (d.authorAgentId !== undefined) {
    const firma = await firmaPara(g.db, g.tenantId, d.authorAgentId)
    patch.author_agent_id = firma.agentId
    patch.author_name     = firma.name
    patch.author_title    = firma.title
  }

  const { error } = await g.db.from('newsletter_editions').update(patch)
    .eq('id', id).eq('tenant_id', g.tenantId)

  if (error) return { ok: false, error: error.message }

  // Toda imagen que la edición TENÍA y ya no tiene deja de existir para el
  // producto: la portada al cambiarla, y la de un bloque de imagen al borrar
  // ese bloque. Antes sólo se miraba la portada, así que quitar una imagen del
  // cuerpo la dejaba en el bucket para siempre.
  //
  // Se comparan los dos conjuntos en vez de mirar campo a campo porque mover
  // una imagen de bloque a portada (o al revés) no debe borrar nada. Va DESPUÉS
  // del update — ver media.ts para las tres condiciones que se comprueban antes
  // de tocar el storage.
  const antes = editionMediaUrls(existing.coverImageUrl, existing.content)
  const ahora = new Set(editionMediaUrls(d.coverImageUrl, d.content))
  for (const url of antes) {
    if (!ahora.has(url)) await deleteOrphanMedia(g.db, g.tenantId, url, id)
  }

  revalidateAll(g.tenantSlug, existing.slug)
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
  revalidateAll(g.tenantSlug, edition.slug)
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
  revalidateAll(g.tenantSlug, existing.slug)
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
  revalidateAll(g.tenantSlug, existing.slug)
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
  revalidateAll(g.tenantSlug, existing.slug)
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

  revalidateAll(g.tenantSlug, existing.slug)
  return { ok: true, data: null }
}

// La subida de medios (portada, bloque de imagen) YA NO vive aquí como Server
// Action: ver src/app/api/newsletters/media/route.ts y el comentario de ese
// archivo — pasar un File binario por una Server Action corrompe la subida
// (mismo hallazgo documentado en src/app/api/properties/media/route.ts).

const GenerateInput = z.object({
  topic:    z.string().trim().max(200).nullable(),
  language: z.enum(SUPPORTED_LANGUAGE_CODES as [string, ...string[]]),
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
 * CoverPicker sustituye. La categoría tampoco la elige la IA: nace en
 * 'informativo' y se cambia luego en el editor.
 */
async function generateEditionWithAiImpl(input: unknown): Promise<Result<{ id: string }>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }

  const parsed = GenerateInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const canal = await ensureNewsletterChannel(g.db, g.tenantId)
  if ('error' in canal) return { ok: false, error: canal.error }
  // La secuencia se prepara aquí y no al suscribirse: así el usuario la ve en
  // /emails desde su primera edición y puede escribirle los correos antes de
  // que llegue nadie. Best-effort: sin secuencia se puede escribir igual.
  await ensureNewsletterSequence(g.db, g.tenantId, canal.id)

  const generado = await generateNewsletterDraft({
    ctx:      g.ctx,
    topic:    parsed.data.topic,
    language: parsed.data.language,
  })
  if (!generado.ok) return generado

  const firma = await firmaPara(g.db, g.tenantId, g.ctx.agent_id ?? null)

  const inserted = await insertEditionRow(g.db, g.ctx, g.tenantId, canal.id, {
    title:         generado.data.title,
    dek:           generado.data.dek || null,
    language:      parsed.data.language,
    coverImageUrl: PLACEHOLDER_COVER_URL,
    coverSource:   'upload',
    content:       generado.data.content,
    sources:       generado.data.sources,
    dataAsOf:      generado.data.dataAsOf,
    category:      'informativo',
    aiGenerated:   true,
    aiRun:         generado.data.aiRun,
    author:        firma,
  })
  if (!inserted.ok) return inserted

  revalidateAll(g.tenantSlug)
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

  revalidateAll(g.tenantSlug, edition.slug)
  return { ok: true, data: { url: result.url } }
}


// ─── Importar una edición escrita por la IA del cliente ──────────────────────

const ImportInput = z.object({
  json:     z.string().trim().min(2, 'Pega el JSON que te devolvió tu IA.').max(200_000, 'El JSON es demasiado grande.'),
  // El valor por DEFECTO, para cuando el JSON no trae "category" (o trae algo
  // que no es una de las cuatro válidas). Si el JSON sí la trae, gana ella:
  // la IA del cliente acaba de escribir la pieza y sabe mejor que nadie si es
  // informativa o educativa — descartar su elección tira información buena.
  category: z.enum(NEWSLETTER_CATEGORIES as unknown as [string, ...string[]]).default('informativo'),
})

/**
 * La forma que se acepta desde fuera. Deliberadamente más laxa que
 * `EditionInput`: aquí no llegan ni portada ni `coverSource` —los pone el
 * sistema— y `sources` es opcional.
 */
const ImportedEdition = z.object({
  title:    z.string().trim().min(1, 'El JSON no trae "title".').max(CONTENT_LIMITS.editionTitle),
  dek:      z.string().trim().max(CONTENT_LIMITS.editionDek).nullable().optional(),
  language: z.enum(SUPPORTED_LANGUAGE_CODES as [string, ...string[]]).optional(),
  dataAsOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '"dataAsOf" debe ser una fecha AAAA-MM-DD.').nullable().optional(),
  // Deliberadamente sin `z.enum(...)`: un valor que no es una de las cuatro
  // categorías válidas NO debe tumbar la importación entera por un campo que
  // de todos modos tiene un valor de repuesto (el del selector). `parseCategory`
  // hace la validación real más abajo, con ese repuesto como fallback.
  category: z.string().trim().optional(),
  // Fuentes con la forma que puede producir una IA ajena: `accessed_at` NO se
  // le pide porque es "cuándo lo consultamos NOSOTROS", un dato que ella no
  // tiene. Lo pone el sistema al importar, que es exactamente cuando ocurre.
  sources:  z.array(z.object({
    id:           z.string().trim().min(1, 'Cada fuente necesita un "id".').max(40),
    url:          z.string().url('Cada fuente necesita una "url" válida, empezando por https://'),
    title:        z.string().trim().min(1, 'Cada fuente necesita un "title".').max(300),
    publisher:    z.string().trim().max(160).optional(),
    published_at: z.string().trim().max(30).optional(),
  })).max(40).optional(),
  blocks:   z.array(z.unknown()).min(1, 'El JSON no trae ningún bloque en "blocks".').max(40),
})

/**
 * Crea una edición a partir del JSON que devolvió la IA del propio cliente.
 *
 * Existe por dinero: generar con nuestra IA cuesta entre $0,60 y $0,90 por
 * edición y lo paga ITMANO. Quien ya tiene su suscripción de IA puede redactar
 * allí y traer el resultado — cero coste para nosotros, cero pasos extra para
 * él. Ver `import-prompt.ts` para el contrato que se le enseña.
 *
 * Nace como BORRADOR y con la portada marcador, exactamente igual que una
 * edición generada por nosotros: el JSON no trae imágenes, así que la portada
 * se elige después en el editor.
 */
async function createEditionFromJsonImpl(input: unknown): Promise<Result<{ id: string }>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }
  const parsed = ImportInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const canal = await ensureNewsletterChannel(g.db, g.tenantId)
  if ('error' in canal) return { ok: false, error: canal.error }
  // La secuencia se prepara aquí y no al suscribirse: así el usuario la ve en
  // /emails desde su primera edición y puede escribirle los correos antes de
  // que llegue nadie. Best-effort: sin secuencia se puede escribir igual.
  await ensureNewsletterSequence(g.db, g.tenantId, canal.id)

  // Un modelo devuelve el JSON envuelto en ```json a poco que se descuide, y
  // decirle al usuario "JSON inválido" cuando el problema son tres tildes
  // invertidas es hacerle depurar algo que podemos arreglar nosotros.
  const limpio = parsed.data.json
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()

  let crudo: unknown
  try {
    crudo = JSON.parse(limpio)
  } catch {
    return { ok: false, error: 'Eso no es un JSON válido. Copia la respuesta de tu IA completa, sin texto alrededor.' }
  }

  const edicion = ImportedEdition.safeParse(crudo)
  if (!edicion.success) {
    const issue = edicion.error.issues[0]
    const donde = issue.path.length > 0 ? ` (en "${issue.path.join('.')}")` : ''
    return { ok: false, error: `${issue.message}${donde}` }
  }
  const d = edicion.data

  // Las imágenes se rechazan con su motivo en vez de colarse o desaparecer sin
  // avisar: un JSON puede traer una URL, pero publicarla bajo la marca del
  // cliente significa depender de un servidor que no controlamos.
  const conImagen = d.blocks.some(b => (b as { type?: unknown } | null)?.type === 'image')
  if (conImagen) {
    return {
      ok: false,
      error: 'El JSON trae bloques de imagen y esos no se pueden importar. Quítalos: la portada y las imágenes se eligen después, en el editor.',
    }
  }

  const content = NewsletterContentSchema.safeParse({
    v: NEWSLETTER_CONTENT_VERSION,
    blocks: d.blocks,
  })
  if (!content.success) {
    const issue = content.error.issues[0]
    // `blocks.3.text` le dice al usuario QUÉ bloque revisar; sin eso, un JSON
    // de cuarenta bloques con un fallo es una búsqueda a ciegas.
    const donde = issue.path.length > 0 ? ` (en "${issue.path.join('.')}")` : ''
    return { ok: false, error: `${issue.message}${donde}` }
  }

  const hoy = new Date().toISOString().slice(0, 10)
  const sources: NewsletterSource[] = (d.sources ?? []).map(f => ({
    id:           f.id,
    url:          f.url,
    title:        f.title,
    publisher:    f.publisher ?? '',
    published_at: f.published_at,
    accessed_at:  hoy,
  }))

  const firma = await firmaPara(g.db, g.tenantId, g.ctx.agent_id ?? null)

  const inserted = await insertEditionRow(g.db, g.ctx, g.tenantId, canal.id, {
    title:         d.title,
    dek:           d.dek?.trim() || null,
    language:      d.language ?? 'es',
    coverImageUrl: PLACEHOLDER_COVER_URL,
    coverSource:   'upload',
    content:       content.data,
    sources,
    dataAsOf:      d.dataAsOf ?? null,
    // La del JSON gana cuando la trae y es válida: es la elección de la IA que
    // acaba de escribir la pieza. Si no la trae (o trae algo que no es una de
    // las cuatro), cae a la del selector del modal — el `z.enum(...)` de
    // `ImportInput` ya garantiza que sea una de las cuatro.
    category:      parseCategory(d.category, parsed.data.category as NewsletterCategory),
    author:        firma,
  })
  if (!inserted.ok) return inserted

  revalidateAll(g.tenantSlug)
  return inserted
}

// ─── Prompt de integración ───────────────────────────────────────────────────

const CHANNEL_INTEGRATION_COLUMNS = columns('acquisition_channels', [
  'id', 'tenant_id', 'slug', 'public_id', 'channel_type', 'email_sequence_id',
])

/**
 * El contrato de integración de la newsletter del tenant, generado desde los
 * datos VIGENTES del canal implícito.
 *
 * Mismo papel que `getIntegrationInfo` de /sources para los demás canales: el
 * tenant copia esto y se lo pasa a quien lleva su web (persona o IA). Se
 * regenera en cada lectura a propósito — vincular una secuencia o publicar el
 * archivo cambia el texto sin que nadie tenga que acordarse de actualizarlo.
 */
async function getNewsletterIntegrationPromptImpl(): Promise<Result<{ prompt: string }>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }

  const canal = await ensureNewsletterChannel(g.db, g.tenantId)
  if ('error' in canal) return { ok: false, error: canal.error }

  const { data } = await g.db
    .from('acquisition_channels')
    .select(CHANNEL_INTEGRATION_COLUMNS)
    .eq('id', canal.id)
    .eq('tenant_id', g.tenantId)
    .eq('channel_type', 'newsletter')
    .maybeSingle()
  const channel = data as {
    slug: string; public_id: string; email_sequence_id: string | null
  } | null
  if (!channel) return { ok: false, error: 'No se pudo preparar tu newsletter.' }

  const { data: tenantRow } = await g.db
    .from('tenants').select(columns('tenants', ['name'])).eq('id', g.tenantId).maybeSingle()
  const tenantName = (tenantRow as { name?: string } | null)?.name ?? 'tu agencia'

  const prompt = buildNewsletterIntegrationPrompt({
    tenantName,
    tenantId:    g.tenantId,
    publicId:    channel.public_id,
    baseUrl:     process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.itmano.com',
    archiveUrl:  g.tenantSlug ? hostedNewsletterUrl(g.tenantSlug) : null,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    // Pública por diseño: es la misma que viaja en cada página del CRM y la que
    // el front del cliente tiene que usar. La service_role no sale de aquí.
    anonKey:     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    hasSequence: channel.email_sequence_id !== null,
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

export async function getNewsletterIntegrationPrompt(): Promise<Result<{ prompt: string }>> {
  return guarded('getNewsletterIntegrationPrompt', () => getNewsletterIntegrationPromptImpl())
}

export async function createEditionFromJson(input: unknown): Promise<Result<{ id: string }>> {
  return guarded('createEditionFromJson', () => createEditionFromJsonImpl(input))
}
