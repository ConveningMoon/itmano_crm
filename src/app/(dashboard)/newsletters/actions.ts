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
import { slugify, uniqueSlug, isUniqueViolation } from '@/lib/newsletters/slug'
import { getEditionById } from '@/lib/data/newsletters'
import { getTenantAccessFor } from '@/lib/subscriptions/access-server'
import { SUPPORTED_LANGUAGE_CODES } from '@/lib/config'
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

const EditionInput = z.object({
  channelId:     z.string().uuid(),
  title:         z.string().trim().min(1, 'La edición necesita un titular').max(200),
  dek:           z.string().trim().max(400).nullable(),
  // El enum del repo, no una longitud: `z.string().min(2).max(3)` dejaba pasar
  // cualquier trigrama hasta el CHECK de la base, que rebota con un error crudo
  // de Postgres en inglés.
  language:      z.enum(SUPPORTED_LANGUAGE_CODES as [string, ...string[]]),
  coverImageUrl: z.string().url('La edición necesita una imagen de portada'),
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

  // El channelId llega del cliente: sin esta comprobación, cualquiera podía
  // colgar una edición del canal de OTRO tenant (misma tenant_id propia, pero
  // channel_id ajeno) — la fila quedaría visible en la página pública de un
  // tercero. Mismo mensaje para "no existe" y "no es tuyo": no le confirmes al
  // atacante que el id es real.
  const { data: channelRow } = await g.db
    .from('acquisition_channels')
    .select(CHANNEL_GUARD_COLUMNS)
    .eq('id', d.channelId)
    .maybeSingle()
  // reason: el cliente de Supabase no está tipado en este repo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channel = channelRow as any
  if (!channel || channel.tenant_id !== g.ctx.tenant_id || channel.channel_type !== 'newsletter') {
    return { ok: false, error: 'Esa serie no existe.' }
  }

  // Antes el slug llevaba un sufijo `-<timestamp base36>` SIEMPRE: feo en la
  // URL pública y aun así colisionable si dos inserciones del mismo canal y
  // título caían en el mismo milisegundo. Ahora se usa el slug limpio y sólo
  // se numera cuando hace falta.
  const { data: takenRows } = await g.db
    .from('newsletter_editions')
    .select(columns('newsletter_editions', ['slug']))
    .eq('tenant_id', g.tenantId)
    .eq('channel_id', d.channelId)
  const slug = uniqueSlug(
    slugify(d.title),
    // reason: ver arriba.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((takenRows ?? []) as any[]).map(e => e.slug as string),
  )

  const { data, error } = await g.db.from('newsletter_editions').insert({
    tenant_id:           g.tenantId,
    channel_id:          d.channelId,
    slug,
    title:               d.title,
    dek:                 d.dek,
    language:            d.language,
    cover_image_url:     d.coverImageUrl,
    cover_source:        d.coverSource,
    content:             d.content,
    sources:             d.sources,
    data_as_of:          d.dataAsOf,
    status:              'draft',
    created_by_agent_id: g.ctx.agent_id ?? null,
    created_by_user_id:  g.ctx.user_id,
  }).select('id').maybeSingle()

  if (error) {
    return { ok: false, error: isUniqueViolation(error)
      ? 'Ya existe otra edición con ese titular en esta serie. Cámbialo un poco.'
      : error.message }
  }
  revalidateAll(g.tenantSlug, channel.slug as string)
  // reason: ver guard().
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ok: true, data: { id: (data as any).id } }
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
