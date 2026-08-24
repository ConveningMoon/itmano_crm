'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { assertCanWriteEdition } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { canUseNewsletters } from '@/lib/access/newsletters'
import { publishBlockers } from '@/lib/newsletters/publishable'
import { NewsletterContentSchema, NewsletterSourceSchema } from '@/lib/newsletters/content'
import { getEditionById } from '@/lib/data/newsletters'
import type { SubscriptionPlan } from '@/lib/subscriptions'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

// Cada action revalida su ruta pública además de la del CRM: publicar tiene que
// verse ya, no en la próxima ventana de ISR.
function revalidateAll(tenantSlug: string, seriesSlug?: string, editionSlug?: string) {
  revalidatePath('/newsletters')
  revalidatePath(`/nl/${tenantSlug}`)
  if (seriesSlug) revalidatePath(`/nl/${tenantSlug}/${seriesSlug}`)
  if (seriesSlug && editionSlug) revalidatePath(`/nl/${tenantSlug}/${seriesSlug}/${editionSlug}`)
}

function slugify(raw: string): string {
  return raw
    // ̀-ͯ = marcas diacriticas combinantes. Escapadas a proposito:
    // escritas como caracteres literales son invisibles en el editor y no
    // sobreviven a un cambio de codificación del archivo.
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
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
  const parsed = SeriesInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const { data, error } = await g.db.from('acquisition_channels').insert({
    tenant_id:         g.ctx.tenant_id,
    public_id:         genPublicId(),
    channel_type:      'newsletter',
    name:              parsed.data.name,
    slug:              slugify(parsed.data.name),
    email_sequence_id: parsed.data.emailSequenceId,
    agent_id:          parsed.data.agentId,
  }).select('id').maybeSingle()

  if (error) return { ok: false, error: error.message }
  revalidateAll(g.tenantSlug)
  // reason: ver guard().
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ok: true, data: { id: (data as any).id } }
}

export async function updateSeries(id: string, input: unknown): Promise<Result<null>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }
  const parsed = SeriesInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const { error } = await g.db.from('acquisition_channels').update({
    name:              parsed.data.name,
    email_sequence_id: parsed.data.emailSequenceId,
    agent_id:          parsed.data.agentId,
  }).eq('id', id).eq('tenant_id', g.ctx.tenant_id).eq('channel_type', 'newsletter')

  if (error) return { ok: false, error: error.message }
  revalidateAll(g.tenantSlug)
  return { ok: true, data: null }
}

const EditionInput = z.object({
  channelId:     z.string().uuid(),
  title:         z.string().trim().min(1, 'La edición necesita un titular').max(200),
  dek:           z.string().trim().max(400).nullable(),
  language:      z.string().trim().min(2).max(3),
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
    .select(columns('acquisition_channels', ['id', 'tenant_id', 'channel_type']))
    .eq('id', d.channelId)
    .maybeSingle()
  // reason: el cliente de Supabase no está tipado en este repo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channel = channelRow as any
  if (!channel || channel.tenant_id !== g.ctx.tenant_id || channel.channel_type !== 'newsletter') {
    return { ok: false, error: 'Esa serie no existe.' }
  }

  const { data, error } = await g.db.from('newsletter_editions').insert({
    tenant_id:           g.ctx.tenant_id,
    channel_id:          d.channelId,
    slug:                `${slugify(d.title)}-${Date.now().toString(36)}`,
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

  if (error) return { ok: false, error: error.message }
  revalidateAll(g.tenantSlug)
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
  }).eq('id', id).eq('tenant_id', g.ctx.tenant_id)

  if (error) return { ok: false, error: error.message }
  revalidateAll(g.tenantSlug)
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
    .eq('id', id).eq('tenant_id', g.ctx.tenant_id)

  if (error) return { ok: false, error: error.message }
  revalidateAll(g.tenantSlug, undefined, edition.slug)
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
    .eq('id', id).eq('tenant_id', g.ctx.tenant_id)
  if (error) return { ok: false, error: error.message }
  revalidateAll(g.tenantSlug)
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

  const { error } = await g.db.from('newsletter_editions')
    .delete().eq('id', id).eq('tenant_id', g.ctx.tenant_id)
  if (error) return { ok: false, error: error.message }
  revalidateAll(g.tenantSlug)
  return { ok: true, data: null }
}

// La subida de medios (portada, bloque de imagen) YA NO vive aquí como Server
// Action: ver src/app/api/newsletters/media/route.ts y el comentario de ese
// archivo — pasar un File binario por una Server Action corrompe la subida
// (mismo hallazgo documentado en src/app/api/properties/media/route.ts).
