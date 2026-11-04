'use server'

import { z } from 'zod'
import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { getCurrentTenantContext, type TenantContext } from '@/lib/auth/tenant-context'
import { requireWriteAccess } from '@/lib/auth/guards'
import { applyVisibilityScope } from '@/lib/auth/visibility'
import { EmailContentSchema, parseEmailContent } from '@/lib/email-content'
import {
  BroadcastAudienceSchema, hasAudienceCriteria, parseBroadcastAudience, segmentFromLeadFilters,
  EMPTY_SEGMENT, type BroadcastAudience,
} from '@/lib/broadcasts/audience'
import {
  BROADCAST_LANGUAGES, MAX_BROADCAST_RECIPIENTS, MAX_SCHEDULE_DAYS,
  broadcastQuotaError, canCancelBroadcast, canResumeBroadcast, type BroadcastStatus,
} from '@/lib/broadcasts/model'
import { escapeLike, parseLeadListFilters } from '@/lib/leads/list-filters'
import { listLeadTags } from '@/lib/data/lead-tags'
import { resendForAccount } from '@/lib/resend'
import { previewBroadcastRecipients, type BroadcastAudiencePreview } from '@/lib/services/broadcast-audience'
import {
  BROADCAST_OWN_DOMAIN_MESSAGE, POSTAL_ADDRESS_REQUIRED_MESSAGE, dispatchBroadcast,
} from '@/lib/services/broadcast-dispatch'
import { renderEmail, type EmailLocale } from '@/lib/services/email-render'
import { resolveOpenHouseSender } from '@/lib/services/open-house-sender'
import { senderFromForAgent } from '@/lib/services/sender-identity'
import { monthlyEmailAllowance } from '@/lib/subscriptions/quota'

// Server Actions de los correos grupales.
//
// Permisos: cualquier rol puede enviar, pero un agente sólo escribe a SUS leads
// (`scope_agent_id` se fija al crear y se reaplica al congelar la lista) y firma
// con su propio nombre. Owner y super_admin alcanzan a todo el tenant.
//
// Todo pasa por el admin client con el tenant verificado en código: las tablas
// no tienen policies de escritura para `authenticated`.

/* eslint-disable @typescript-eslint/no-explicit-any */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

// "Enviar ahora" corre casi de inmediato; lo que no alcance lo retoma el
// orquestador horario. El tope deja margen dentro del límite de la función.
const INLINE_DISPATCH_MS = 40_000

const ROW_COLUMNS = columns('email_broadcasts', [
  'id', 'tenant_id', 'status', 'scope_agent_id', 'audience', 'languages', 'sender_agent_id',
])
const TENANT_POSTAL = columns('tenants', ['postal_address'])
const AGENT_COLUMNS = columns('agents', ['id', 'name', 'email', 'email_signature', 'sender_local_part'])
const SEARCH_COLUMNS = columns('leads_list', ['id', 'first_name', 'last_name', 'email'])

const Id = z.string().uuid()
const Lang = z.enum(BROADCAST_LANGUAGES)

const SaveSchema = z.object({
  name:          z.string().trim().min(1, 'Ponle un nombre al envío').max(120),
  audience:      BroadcastAudienceSchema,
  languages:     z.array(Lang).min(1, 'Elige al menos un idioma').max(BROADCAST_LANGUAGES.length)
                   .refine(l => new Set(l).size === l.length, 'Idiomas repetidos'),
  senderAgentId: z.string().min(1).max(100).nullable(),
})
export type SaveBroadcastInput = z.infer<typeof SaveSchema>

const ContentSchema = z.object({
  subject: z.string().trim().min(1, 'El asunto es obligatorio').max(200),
  content: EmailContentSchema,
})

const ConfirmSchema = z.object({
  // Lo que vio quien confirmó: si la audiencia cambió, se le vuelve a preguntar.
  expectedRecipients: z.number().int().min(1),
  when: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('now') }),
    z.object({ mode: z.literal('scheduled'), at: z.string().datetime() }),
  ]),
})

interface Row {
  id: string
  tenant_id: string
  status: BroadcastStatus
  scope_agent_id: string | null
  audience: unknown
  languages: string[]
  sender_agent_id: string | null
}

function refresh(id?: string) {
  revalidatePath('/emails')
  if (id) revalidatePath(`/emails/grupales/${id}`)
}

/** El tenant y el alcance del agente en esa fila, o el error para devolver. */
async function loadRow(ctx: TenantContext, id: string): Promise<{ ok: true; row: Row } | { ok: false; error: string }> {
  if (!Id.safeParse(id).success || !ctx.tenant_id) return { ok: false, error: 'Envío no encontrado.' }
  let q = createAdminClient().from('email_broadcasts').select(ROW_COLUMNS).eq('id', id).eq('tenant_id', ctx.tenant_id)
  if (ctx.role === 'agent') q = q.eq('scope_agent_id', ctx.agent_id ?? '')
  const { data, error } = await q.maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Envío no encontrado.' }
  return { ok: true, row: data as unknown as Row }
}

async function insertDraft(ctx: TenantContext, name: string, audience: BroadcastAudience): Promise<Result<{ id: string }>> {
  const tenantId = ctx.tenant_id
  if (!tenantId) return { ok: false, error: 'Selecciona un tenant desde el centro de control.' }
  if (ctx.role === 'agent' && !ctx.agent_id) return { ok: false, error: 'Tu usuario no está vinculado a un agente.' }

  const db = createAdminClient()
  const sender = await resolveOpenHouseSender(db, tenantId, BROADCAST_OWN_DOMAIN_MESSAGE)
  if (!sender.ok) return sender

  const { data, error } = await db.from('email_broadcasts').insert({
    tenant_id:           tenantId,
    name,
    audience,
    scope_agent_id:      ctx.role === 'agent' ? ctx.agent_id : null,
    created_by_user_id:  ctx.user_id,
    created_by_agent_id: ctx.agent_id,
  }).select('id').single()
  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true, id: (data as any).id as string }
}

export async function createBroadcast(): Promise<Result<{ id: string }>> {
  return insertDraft(await getCurrentTenantContext(), 'Correo grupal sin título', EMPTY_SEGMENT)
}

/** Desde /leads: los leads marcados en la tabla. */
export async function createBroadcastFromLeads(leadIds: string[]): Promise<Result<{ id: string }>> {
  const parsed = z.array(z.string().min(1).max(100)).min(1).max(MAX_BROADCAST_RECIPIENTS).safeParse(leadIds)
  if (!parsed.success) return { ok: false, error: `Elige entre 1 y ${MAX_BROADCAST_RECIPIENTS} leads.` }
  return insertDraft(
    await getCurrentTenantContext(),
    `Correo a ${parsed.data.length} ${parsed.data.length === 1 ? 'lead' : 'leads'}`,
    { mode: 'manual', leadIds: [...new Set(parsed.data)] },
  )
}

/** Desde /leads: los filtros activos, con la misma query string de la página. */
export async function createBroadcastFromLeadFilters(query: string): Promise<Result<{ id: string }>> {
  const ctx = await getCurrentTenantContext()
  if (!ctx.tenant_id) return { ok: false, error: 'Selecciona un tenant desde el centro de control.' }
  const params = Object.fromEntries(new URLSearchParams(query.slice(0, 2000)))
  const tags = await listLeadTags(ctx.tenant_id)
  return insertDraft(ctx, 'Correo grupal desde /leads', segmentFromLeadFilters(parseLeadListFilters(params), tags))
}

export async function saveBroadcast(id: string, input: SaveBroadcastInput): Promise<Result> {
  const parsed = SaveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  const ctx = await getCurrentTenantContext()
  const loaded = await loadRow(ctx, id)
  if (!loaded.ok) return loaded
  if (loaded.row.status !== 'draft') return { ok: false, error: 'Este envío ya no se puede editar.' }

  const db = createAdminClient()
  const { senderAgentId } = parsed.data
  if (senderAgentId) {
    // Un agente firma con su propio nombre, nunca con el de un compañero.
    if (ctx.role === 'agent' && senderAgentId !== ctx.agent_id) return { ok: false, error: 'Sólo puedes enviar a tu nombre.' }
    const { data: agent } = await db.from('agents').select('id').eq('id', senderAgentId).eq('tenant_id', loaded.row.tenant_id).maybeSingle()
    if (!agent) return { ok: false, error: 'Agente no encontrado.' }
  }

  const { error } = await db.from('email_broadcasts').update({
    name:            parsed.data.name,
    audience:        parsed.data.audience,
    languages:       parsed.data.languages,
    sender_agent_id: senderAgentId,
  }).eq('id', id).eq('tenant_id', loaded.row.tenant_id).eq('status', 'draft')
  if (error) return { ok: false, error: error.message }
  refresh(id)
  return { ok: true }
}

export async function saveBroadcastContent(
  id: string,
  language: string,
  input: { subject: string; content: unknown },
): Promise<Result> {
  const lang = Lang.safeParse(language)
  const parsed = ContentSchema.safeParse(input)
  if (!lang.success) return { ok: false, error: 'Idioma inválido.' }
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  const loaded = await loadRow(await getCurrentTenantContext(), id)
  if (!loaded.ok) return loaded
  if (loaded.row.status !== 'draft') return { ok: false, error: 'Este envío ya no se puede editar.' }

  const { error } = await createAdminClient().from('email_broadcast_contents').upsert({
    broadcast_id: id,
    tenant_id:    loaded.row.tenant_id,
    language:     lang.data,
    subject:      parsed.data.subject,
    body_json:    parsed.data.content,
  }, { onConflict: 'broadcast_id,language' })
  if (error) return { ok: false, error: error.message }
  refresh(id)
  return { ok: true }
}

/** Conteo en vivo de lo que está en pantalla, aunque todavía no se haya guardado. */
export async function previewBroadcastAudience(
  id: string,
  audience: unknown,
  languages: string[],
): Promise<Result<{ preview: BroadcastAudiencePreview }>> {
  const parsedAudience = BroadcastAudienceSchema.safeParse(audience)
  const parsedLangs = z.array(Lang).max(BROADCAST_LANGUAGES.length).safeParse(languages)
  if (!parsedAudience.success || !parsedLangs.success) return { ok: false, error: 'Audiencia inválida.' }
  const loaded = await loadRow(await getCurrentTenantContext(), id)
  if (!loaded.ok) return loaded
  try {
    const preview = await previewBroadcastRecipients(
      createAdminClient(), loaded.row.tenant_id, loaded.row.scope_agent_id, parsedAudience.data, parsedLangs.data,
    )
    return { ok: true, preview }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo calcular la audiencia.' }
  }
}

/** Búsqueda para la selección manual. Respeta el alcance del agente. */
export async function searchLeadsForBroadcast(
  query: string,
): Promise<Result<{ leads: { id: string; name: string; email: string | null }[] }>> {
  const ctx = await getCurrentTenantContext()
  if (!ctx.tenant_id) return { ok: false, error: 'Selecciona un tenant desde el centro de control.' }
  const term = query.trim().toLowerCase().slice(0, 100)
  if (term.length < 2) return { ok: true, leads: [] }
  const { data, error } = await applyVisibilityScope(
    createAdminClient().from('leads_list').select(SEARCH_COLUMNS),
    { tenantId: ctx.tenant_id, agentId: ctx.role === 'agent' ? ctx.agent_id : null },
  )
    .ilike('search_text', `%${escapeLike(term)}%`)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return { ok: false, error: error.message }
  return {
    ok: true,
    leads: ((data ?? []) as any[]).map(l => ({
      id: l.id as string,
      name: [l.first_name, l.last_name].filter(Boolean).join(' '),
      email: (l.email as string | null) ?? null,
    })),
  }
}

/** Correo de prueba a quien tiene la sesión abierta. Nunca a un lead. */
export async function sendBroadcastTest(id: string, language: string): Promise<Result<{ to: string }>> {
  const ctx = await getCurrentTenantContext()
  const loaded = await loadRow(ctx, id)
  if (!loaded.ok) return loaded
  const { row } = loaded
  if (!ctx.email) return { ok: false, error: 'Tu sesión no tiene un email.' }

  const db = createAdminClient()
  const sender = await resolveOpenHouseSender(db, row.tenant_id, BROADCAST_OWN_DOMAIN_MESSAGE)
  if (!sender.ok) return sender

  const [{ data: content }, { data: tenant }, { data: agent }] = await Promise.all([
    db.from('email_broadcast_contents').select('subject, body_json')
      .eq('broadcast_id', id).eq('tenant_id', row.tenant_id).eq('language', language).maybeSingle(),
    db.from('tenants').select(TENANT_POSTAL).eq('id', row.tenant_id).maybeSingle(),
    row.sender_agent_id || ctx.agent_id
      ? db.from('agents').select(AGENT_COLUMNS).eq('id', (row.sender_agent_id ?? ctx.agent_id) as string).eq('tenant_id', row.tenant_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const body = parseEmailContent((content as any)?.body_json)
  if (!content || !body) return { ok: false, error: 'Escribe y guarda este idioma antes de probarlo.' }

  const a = agent as any
  const rendered = renderEmail({
    subject:        `[Prueba] ${(content as any).subject as string}`,
    content:        body,
    vars:           { customer_name: 'Nombre', agent_name: a?.name ?? '', agent_email: a?.email ?? '' },
    signature:      a?.email_signature ?? null,
    unsubscribeUrl: '#',
    postalAddress:  (tenant as any)?.postal_address ?? null,
    locale:         language as EmailLocale,
  })
  const { error } = await resendForAccount(sender.sender.identity.account).emails.send({
    from: senderFromForAgent(sender.sender.identity, a ? { name: a.name, email: a.email, senderLocalPart: a.sender_local_part } : null),
    to:   ctx.email,
    subject: rendered.subject,
    html:    rendered.html,
  })
  if (error) return { ok: false, error: `No se pudo enviar la prueba: ${error.message}` }
  return { ok: true, to: ctx.email }
}

export async function confirmBroadcast(id: string, input: z.infer<typeof ConfirmSchema>): Promise<Result<{ scheduled: boolean }>> {
  const parsed = ConfirmSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Datos inválidos.' }
  const ctx = await getCurrentTenantContext()
  const loaded = await loadRow(ctx, id)
  if (!loaded.ok) return loaded
  const { row } = loaded
  if (row.status !== 'draft') return { ok: false, error: 'Este envío ya fue confirmado.' }

  const { when, expectedRecipients } = parsed.data
  const now = Date.now()
  let scheduledAt = new Date(now).toISOString()
  if (when.mode === 'scheduled') {
    const at = new Date(when.at).getTime()
    if (at <= now) return { ok: false, error: 'Elige una hora en el futuro.' }
    if (at > now + MAX_SCHEDULE_DAYS * 24 * 60 * 60 * 1000) return { ok: false, error: `Sólo se puede programar hasta ${MAX_SCHEDULE_DAYS} días adelante.` }
    scheduledAt = new Date(at).toISOString()
  }

  const db = createAdminClient()
  const audience = parseBroadcastAudience(row.audience)
  if (!hasAudienceCriteria(audience)) return { ok: false, error: 'Elige a quién le llega este correo.' }

  const [sender, { data: tenant }, { data: contents }, allowance] = await Promise.all([
    resolveOpenHouseSender(db, row.tenant_id, BROADCAST_OWN_DOMAIN_MESSAGE),
    db.from('tenants').select(TENANT_POSTAL).eq('id', row.tenant_id).maybeSingle(),
    db.from('email_broadcast_contents').select('language').eq('broadcast_id', id).eq('tenant_id', row.tenant_id),
    monthlyEmailAllowance(row.tenant_id),
  ])
  if (!sender.ok) return sender
  if (!((tenant as any)?.postal_address as string | null)?.trim()) return { ok: false, error: POSTAL_ADDRESS_REQUIRED_MESSAGE }

  const written = new Set(((contents ?? []) as any[]).map(c => c.language as string))
  const missing = row.languages.filter(l => !written.has(l))
  if (missing.length > 0) return { ok: false, error: `Falta escribir el correo en: ${missing.join(', ')}.` }

  const { summary, overflow } = await previewBroadcastRecipients(db, row.tenant_id, row.scope_agent_id, audience, row.languages)
  if (overflow) return { ok: false, error: `La audiencia pasa del tope de ${MAX_BROADCAST_RECIPIENTS} destinatarios por envío. Acótala.` }
  if (summary.toSend === 0) return { ok: false, error: 'Nadie de esta audiencia puede recibir el correo.' }
  if (summary.toSend !== expectedRecipients) {
    return { ok: false, error: `La audiencia cambió: ahora son ${summary.toSend} destinatarios. Revísala y confirma otra vez.` }
  }
  const quotaError = broadcastQuotaError(allowance, summary.toSend)
  if (quotaError) return { ok: false, error: quotaError }

  // Desde aquí manda el estado: sólo un `draft` confirma, así que un doble clic
  // no puede lanzar dos despachos del mismo envío.
  const { data: updated, error } = await db.from('email_broadcasts').update({
    status:               'pending',
    scheduled_at:         scheduledAt,
    confirmed_at:         new Date(now).toISOString(),
    confirmed_by_user_id: ctx.user_id,
    last_error:           null,
  }).eq('id', id).eq('tenant_id', row.tenant_id).eq('status', 'draft').select('id')
  if (error) return { ok: false, error: error.message }
  if (!updated || updated.length === 0) return { ok: false, error: 'Este envío ya fue confirmado.' }

  if (when.mode === 'now') {
    after(() => dispatchBroadcast(createAdminClient(), id, { deadline: Date.now() + INLINE_DISPATCH_MS }))
  }
  refresh(id)
  return { ok: true, scheduled: when.mode === 'scheduled' }
}

export async function cancelBroadcast(id: string): Promise<Result> {
  const loaded = await loadRow(await getCurrentTenantContext(), id)
  if (!loaded.ok) return loaded
  const { row } = loaded
  if (!canCancelBroadcast(row.status)) return { ok: false, error: 'Este envío ya no se puede cancelar.' }
  const ctx = await getCurrentTenantContext()
  const { error } = await createAdminClient().from('email_broadcasts').update({
    status:               'cancelled',
    cancelled_at:         new Date().toISOString(),
    cancelled_by_user_id: ctx.user_id,
  }).eq('id', id).eq('tenant_id', row.tenant_id).in('status', ['pending', 'sending', 'paused'])
  if (error) return { ok: false, error: error.message }
  refresh(id)
  return { ok: true }
}

/**
 * Reanudar un envío pausado es decidir, viendo el motivo, que siga: desde aquí
 * la guarda deja de evaluarse para este envío. Uno que no salió (sin dominio,
 * sin dirección, sin cupo) vuelve a comprobarlo todo al despacharse.
 */
export async function resumeBroadcast(id: string): Promise<Result> {
  const loaded = await loadRow(await getCurrentTenantContext(), id)
  if (!loaded.ok) return loaded
  const { row } = loaded
  if (!canResumeBroadcast(row.status)) return { ok: false, error: 'Este envío no se puede reanudar.' }
  const nowIso = new Date().toISOString()
  const { data: updated, error } = await createAdminClient().from('email_broadcasts').update({
    status:       'pending',
    scheduled_at: nowIso,
    last_error:   null,
    finished_at:  null,
    ...(row.status === 'paused' ? { guard_overridden_at: nowIso } : {}),
  }).eq('id', id).eq('tenant_id', row.tenant_id).eq('status', row.status).select('id')
  if (error) return { ok: false, error: error.message }
  if (!updated || updated.length === 0) return { ok: false, error: 'Este envío cambió de estado. Recarga la página.' }
  after(() => dispatchBroadcast(createAdminClient(), id, { deadline: Date.now() + INLINE_DISPATCH_MS }))
  refresh(id)
  return { ok: true }
}

/** Sólo un borrador se borra: de lo enviado queda el registro. */
export async function deleteBroadcast(id: string): Promise<Result> {
  const loaded = await loadRow(await getCurrentTenantContext(), id)
  if (!loaded.ok) return loaded
  if (loaded.row.status !== 'draft') return { ok: false, error: 'Sólo se puede borrar un borrador.' }
  const { error } = await createAdminClient().from('email_broadcasts').delete()
    .eq('id', id).eq('tenant_id', loaded.row.tenant_id).eq('status', 'draft')
  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true }
}

/** La dirección es del negocio: la fija owner o super_admin, no cada agente. */
export async function savePostalAddress(value: string): Promise<Result> {
  const ctx = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied
  if (!ctx.tenant_id) return { ok: false, error: 'Selecciona un tenant desde el centro de control.' }
  const address = value.trim()
  if (address.length > 300) return { ok: false, error: 'La dirección es demasiado larga (máx. 300 caracteres).' }
  const { error } = await createAdminClient().from('tenants').update({ postal_address: address || null }).eq('id', ctx.tenant_id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/emails', 'layout')
  return { ok: true }
}
