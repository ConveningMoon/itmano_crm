'use server'

import { z } from 'zod'
import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { getCurrentTenantContext, type TenantContext } from '@/lib/auth/tenant-context'
import { EmailContentSchema } from '@/lib/email-content'
import {
  AUDIENCE_MATCHES, OPEN_HOUSE_LANGUAGES, MAX_OPEN_HOUSE_LANGUAGES,
  type OpenHouseEmailKind, type OpenHouseEmailStatus, type OpenHouseLanguage, type OpenHouseStatus,
} from '@/lib/open-houses/model'
import {
  canDeleteOpenHouse, defaultReminderAt, effectiveSendAt, isEmailEditable, missingLanguages,
  planCancel, planReschedule, validateAnnouncementAt, validateEventWindow, validateReminderAt,
  zonedWallTimeToUtc, type ChangeContext,
} from '@/lib/open-houses/schedule'
import { defaultOpenHouseCopy } from '@/lib/open-houses/default-copy'
import { summarizeAudience, type AudienceSummary } from '@/lib/open-houses/audience'
import { resolveOpenHouseSender } from '@/lib/services/open-house-sender'
import { audienceLeadIdsByTags, loadAudienceLeads } from '@/lib/services/open-house-audience'
import { dispatchOpenHouseEmail } from '@/lib/services/open-house-dispatch'
import { recordOpenHouseRsvp } from '@/lib/services/open-house-rsvp'

// Server Actions de los open houses de una propiedad.
//
// Permisos: las propiedades son visibles para todo el equipo, así que
// CUALQUIER rol puede crear un open house. Gestionarlo después (editar,
// confirmar, reprogramar, cancelar) es de quien lo creó, del owner o de ITMANO.
//
// Todo pasa por el admin client con el tenant verificado en código: las
// tablas no tienen policies de escritura para `authenticated`.

/* eslint-disable @typescript-eslint/no-explicit-any */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

// El anuncio "al confirmar" se envía casi de inmediato; el resto lo retoma el
// orquestador horario. El tope deja margen dentro del límite de la función.
const INLINE_DISPATCH_MS = 40_000

const OH_COLUMNS = columns('open_houses', [
  'id', 'tenant_id', 'property_id', 'starts_at', 'ends_at', 'timezone', 'public_notes',
  'languages', 'audience_tag_ids', 'audience_match', 'rsvp_enabled', 'status', 'revision',
  'created_by_user_id',
])
const EMAIL_COLUMNS = columns('open_house_emails', [
  'id', 'open_house_id', 'tenant_id', 'kind', 'scheduled_at', 'status', 'finished_at',
])
const PROPERTY_COLUMNS = columns('properties', ['id', 'tenant_id', 'slug', 'status', 'created_by_agent_id'])

// ── Schemas ──────────────────────────────────────────────────────────────────

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
const TimeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida')
const Lang    = z.enum(OPEN_HOUSE_LANGUAGES)

const WhenSchema = z.object({ date: DateStr, time: TimeStr })

const OpenHouseInputSchema = z.object({
  date:           DateStr,
  startTime:      TimeStr,
  endTime:        TimeStr,
  timezone:       z.string().trim().min(1).max(64),
  publicNotes:    z.string().trim().max(500).optional().default(''),
  languages:      z.array(Lang).min(1, 'Elige al menos un idioma').max(MAX_OPEN_HOUSE_LANGUAGES)
                    .refine(l => new Set(l).size === l.length, 'Idiomas repetidos'),
  audienceTagIds: z.array(z.string().uuid()).max(30),
  audienceMatch:  z.enum(AUDIENCE_MATCHES),
  rsvpEnabled:    z.boolean(),
  announcement:   z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('on_confirm') }),
    z.object({ mode: z.literal('scheduled'), date: DateStr, time: TimeStr }),
  ]),
  reminder: z.discriminatedUnion('enabled', [
    z.object({ enabled: z.literal(false) }),
    z.object({ enabled: z.literal(true), date: DateStr.optional(), time: TimeStr.optional() }),
  ]),
})
export type OpenHouseInput = z.input<typeof OpenHouseInputSchema>

const NoticeContentsSchema = z.record(
  z.string(),
  z.object({ subject: z.string().trim().min(1, 'Falta el asunto').max(200), content: EmailContentSchema }),
)

// ── Helpers ──────────────────────────────────────────────────────────────────

async function ctxAndDb() {
  return { ctx: await getCurrentTenantContext(), db: createAdminClient() }
}

function sameTenant(ctx: TenantContext, tenantId: string): boolean {
  return ctx.role === 'super_admin' || ctx.tenant_id === tenantId
}

function canManage(ctx: TenantContext, oh: { tenant_id: string; created_by_user_id: string | null }): boolean {
  if (!sameTenant(ctx, oh.tenant_id)) return false
  if (ctx.role === 'agent') return oh.created_by_user_id === ctx.user_id
  return true
}

async function loadProperty(db: ReturnType<typeof createAdminClient>, ctx: TenantContext, propertyId: string) {
  const { data } = await db.from('properties').select(PROPERTY_COLUMNS).eq('id', propertyId).maybeSingle()
  const p = data as any
  if (!p || !sameTenant(ctx, p.tenant_id)) return null
  return p as { id: string; tenant_id: string; slug: string | null; status: string; created_by_agent_id: string | null }
}

async function loadOpenHouse(db: ReturnType<typeof createAdminClient>, ctx: TenantContext, id: string) {
  const { data } = await db.from('open_houses').select(OH_COLUMNS).eq('id', id).maybeSingle()
  const oh = data as any
  if (!oh || !sameTenant(ctx, oh.tenant_id)) return null
  return oh
}

async function loadEmails(db: ReturnType<typeof createAdminClient>, oh: any) {
  const { data } = await db.from('open_house_emails').select(EMAIL_COLUMNS)
    .eq('open_house_id', oh.id).eq('tenant_id', oh.tenant_id).order('created_at')
  return ((data ?? []) as any[]).map(e => ({ ...e, kind: e.kind as OpenHouseEmailKind, status: e.status as OpenHouseEmailStatus }))
}

async function revalidateOpenHouse(db: ReturnType<typeof createAdminClient>, oh: { id?: string; tenant_id: string; property_id: string }) {
  revalidatePath(`/properties/${oh.property_id}`)
  if (oh.id) revalidatePath(`/properties/${oh.property_id}/open-houses/${oh.id}`)
  // La cuenta regresiva vive en la ficha pública (ISR).
  const [{ data: tenant }, { data: property }] = await Promise.all([
    db.from('tenants').select(columns('tenants', ['slug'])).eq('id', oh.tenant_id).maybeSingle(),
    db.from('properties').select(columns('properties', ['slug'])).eq('id', oh.property_id).maybeSingle(),
  ])
  const tSlug = (tenant as any)?.slug as string | undefined
  const pSlug = (property as any)?.slug as string | undefined
  if (tSlug) {
    revalidatePath(`/web/${tSlug}`)
    if (pSlug) revalidatePath(`/web/${tSlug}/${pSlug}`)
  }
}

function dispatchSoon(emailId: string) {
  after(async () => {
    try {
      await dispatchOpenHouseEmail(createAdminClient(), emailId, { deadline: Date.now() + INLINE_DISPATCH_MS })
    } catch (err) {
      console.error(JSON.stringify({ service: 'open-house-actions', email_id: emailId, error: err instanceof Error ? err.message : String(err) }))
    }
  })
}

function overlapError(error: { code?: string; message: string } | null): string | null {
  if (!error) return null
  if (error.code === '23P01') return 'Ya hay otro open house de esta propiedad en ese horario.'
  return error.message
}

/** Contenido por defecto de un correo en cada idioma (el agente lo edita). */
function defaultContents(emailId: string, tenantId: string, kind: OpenHouseEmailKind, languages: string[]) {
  return languages.map(language => {
    const copy = defaultOpenHouseCopy(kind, language as OpenHouseLanguage)
    return {
      email_id:  emailId,
      tenant_id: tenantId,
      language,
      subject:   copy.subject,
      body_json: { v: 1, body: copy.body },
      resend_template_id: null,
    }
  })
}

interface ParsedSchedule {
  startsAt:       Date
  endsAt:         Date
  announcementAt: Date | null
  reminderAt:     Date | null
  warnings:       string[]
}

function parseSchedule(input: z.infer<typeof OpenHouseInputSchema>, now: Date): { ok: true; value: ParsedSchedule } | { ok: false; error: string } {
  const startsAt = zonedWallTimeToUtc(input.date, input.startTime, input.timezone)
  const endsAt   = zonedWallTimeToUtc(input.date, input.endTime, input.timezone)
  if (!startsAt || !endsAt) return { ok: false, error: 'Esa fecha u hora no existe en la zona horaria elegida (¿cambio de horario?).' }
  const win = validateEventWindow({ startsAt, endsAt, now })
  if (!win.ok) return win

  let announcementAt: Date | null = null
  if (input.announcement.mode === 'scheduled') {
    announcementAt = zonedWallTimeToUtc(input.announcement.date, input.announcement.time, input.timezone)
    if (!announcementAt) return { ok: false, error: 'La hora del anuncio no existe en esa zona horaria.' }
  }
  const ann = validateAnnouncementAt({ scheduledAt: announcementAt, startsAt, now })
  if (!ann.ok) return ann
  const effectiveAnnouncement = effectiveSendAt(announcementAt ?? now, now)

  let reminderAt: Date | null = null
  const warnings = [...ann.warnings]
  if (input.reminder.enabled) {
    if (input.reminder.date && input.reminder.time) {
      reminderAt = zonedWallTimeToUtc(input.reminder.date, input.reminder.time, input.timezone)
      if (!reminderAt) return { ok: false, error: 'La hora del recordatorio no existe en esa zona horaria.' }
      const rem = validateReminderAt({ reminderAt, announcementAt: effectiveAnnouncement, startsAt, now })
      if (!rem.ok) return rem
      warnings.push(...rem.warnings)
    } else {
      reminderAt = defaultReminderAt({ startsAt, announcementAt: effectiveAnnouncement, now })
      if (!reminderAt) warnings.push('No hay margen para un recordatorio antes del evento: se desactivó.')
    }
  }
  return { ok: true, value: { startsAt, endsAt, announcementAt, reminderAt, warnings } }
}

async function tenantTagIds(db: ReturnType<typeof createAdminClient>, tenantId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const { data } = await db.from('lead_tags').select(columns('lead_tags', ['id'])).eq('tenant_id', tenantId).in('id', ids)
  const valid = new Set(((data ?? []) as any[]).map(t => t.id as string))
  return ids.filter(id => valid.has(id))
}

// ── Crear y editar (borrador) ────────────────────────────────────────────────

export async function createOpenHouse(propertyId: string, raw: OpenHouseInput): Promise<Result<{ id: string; warnings: string[] }>> {
  const parsed = OpenHouseInputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  const input = parsed.data

  const { ctx, db } = await ctxAndDb()
  const property = await loadProperty(db, ctx, propertyId)
  if (!property) return { ok: false, error: 'Propiedad no encontrada.' }
  if (property.status === 'sold') return { ok: false, error: 'Esta propiedad ya se vendió.' }

  const sender = await resolveOpenHouseSender(db, property.tenant_id)
  if (!sender.ok) return sender

  const now = new Date()
  const sched = parseSchedule(input, now)
  if (!sched.ok) return sched
  const tagIds = await tenantTagIds(db, property.tenant_id, input.audienceTagIds)

  const { data: oh, error } = await db.from('open_houses').insert({
    tenant_id:           property.tenant_id,
    property_id:         property.id,
    starts_at:           sched.value.startsAt.toISOString(),
    ends_at:             sched.value.endsAt.toISOString(),
    timezone:            input.timezone,
    public_notes:        input.publicNotes || null,
    languages:           input.languages,
    audience_tag_ids:    tagIds,
    audience_match:      input.audienceMatch,
    rsvp_enabled:        input.rsvpEnabled,
    status:              'draft',
    created_by_user_id:  ctx.user_id,
    created_by_agent_id: ctx.agent_id ?? property.created_by_agent_id ?? null,
  }).select('id').single()
  if (error || !oh) return { ok: false, error: overlapError(error) ?? 'No se pudo crear el open house.' }
  const ohId = (oh as any).id as string

  // "Al confirmar" se guarda como la hora de creación: una hora ya vencida al
  // confirmar significa "sale en ese momento".
  const emails: any[] = [{
    tenant_id: property.tenant_id, open_house_id: ohId, kind: 'announcement',
    scheduled_at: (sched.value.announcementAt ?? now).toISOString(),
  }]
  if (sched.value.reminderAt) {
    emails.push({ tenant_id: property.tenant_id, open_house_id: ohId, kind: 'reminder', scheduled_at: sched.value.reminderAt.toISOString() })
  }
  const { data: emailRows, error: emailErr } = await db.from('open_house_emails').insert(emails).select('id, kind')
  if (emailErr) {
    await db.from('open_houses').delete().eq('id', ohId)
    return { ok: false, error: emailErr.message }
  }
  const contents = ((emailRows ?? []) as any[]).flatMap(e => defaultContents(e.id, property.tenant_id, e.kind, input.languages))
  if (contents.length) await db.from('open_house_email_contents').insert(contents)

  revalidatePath(`/properties/${property.id}`)
  return { ok: true, id: ohId, warnings: sched.value.warnings }
}

export async function updateOpenHouseDraft(openHouseId: string, raw: OpenHouseInput): Promise<Result<{ warnings: string[] }>> {
  const parsed = OpenHouseInputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  const input = parsed.data

  const { ctx, db } = await ctxAndDb()
  const oh = await loadOpenHouse(db, ctx, openHouseId)
  if (!oh || !canManage(ctx, oh)) return { ok: false, error: 'Open house no encontrado.' }
  if (oh.status !== 'draft') return { ok: false, error: 'Un open house confirmado se reprograma, no se edita.' }

  const now = new Date()
  const sched = parseSchedule(input, now)
  if (!sched.ok) return sched
  const tagIds = await tenantTagIds(db, oh.tenant_id, input.audienceTagIds)

  const { error } = await db.from('open_houses').update({
    starts_at:        sched.value.startsAt.toISOString(),
    ends_at:          sched.value.endsAt.toISOString(),
    timezone:         input.timezone,
    public_notes:     input.publicNotes || null,
    languages:        input.languages,
    audience_tag_ids: tagIds,
    audience_match:   input.audienceMatch,
    rsvp_enabled:     input.rsvpEnabled,
  }).eq('id', oh.id).eq('status', 'draft')
  const overlap = overlapError(error)
  if (overlap) return { ok: false, error: overlap }

  const emails = await loadEmails(db, oh)
  const announcement = emails.find(e => e.kind === 'announcement')
  const reminder     = emails.find(e => e.kind === 'reminder')
  if (announcement) {
    await db.from('open_house_emails').update({ scheduled_at: (sched.value.announcementAt ?? now).toISOString() }).eq('id', announcement.id)
  }
  let reminderId = reminder?.id as string | undefined
  if (sched.value.reminderAt) {
    if (reminder) {
      await db.from('open_house_emails').update({ scheduled_at: sched.value.reminderAt.toISOString(), status: 'pending' }).eq('id', reminder.id)
    } else {
      const { data: created } = await db.from('open_house_emails')
        .insert({ tenant_id: oh.tenant_id, open_house_id: oh.id, kind: 'reminder', scheduled_at: sched.value.reminderAt.toISOString() })
        .select('id').single()
      reminderId = (created as any)?.id
      if (reminderId) await db.from('open_house_email_contents').insert(defaultContents(reminderId, oh.tenant_id, 'reminder', input.languages))
    }
  } else if (reminder) {
    await db.from('open_house_emails').delete().eq('id', reminder.id)
    reminderId = undefined
  }

  // Idiomas: los nuevos arrancan con el texto por defecto; los quitados se van.
  const added   = input.languages.filter(l => !(oh.languages as string[]).includes(l))
  const removed = (oh.languages as string[]).filter(l => !input.languages.includes(l as OpenHouseLanguage))
  // Un recordatorio recién creado ya nació con todos los idiomas; uno borrado
  // no necesita ninguno. Sólo el anuncio y un recordatorio que sigue reciben
  // los idiomas nuevos.
  const keptReminder = sched.value.reminderAt && reminder ? reminder : null
  for (const e of [announcement, keptReminder].filter(Boolean) as any[]) {
    if (added.length) await db.from('open_house_email_contents').upsert(defaultContents(e.id, oh.tenant_id, e.kind, added), { onConflict: 'email_id,language', ignoreDuplicates: true })
  }
  if (removed.length) {
    const ids = [announcement?.id, reminderId].filter(Boolean) as string[]
    if (ids.length) await db.from('open_house_email_contents').delete().in('email_id', ids).in('language', removed)
  }

  await revalidateOpenHouse(db, { ...oh, property_id: oh.property_id })
  return { ok: true, warnings: sched.value.warnings }
}

export async function deleteOpenHouseDraft(openHouseId: string): Promise<Result> {
  const { ctx, db } = await ctxAndDb()
  const oh = await loadOpenHouse(db, ctx, openHouseId)
  if (!oh || !canManage(ctx, oh)) return { ok: false, error: 'Open house no encontrado.' }
  if (!canDeleteOpenHouse(oh.status)) return { ok: false, error: 'Un open house confirmado no se elimina: se cancela.' }
  const { error } = await db.from('open_houses').delete().eq('id', oh.id).eq('status', 'draft')
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/properties/${oh.property_id}`)
  return { ok: true }
}

/** Datos públicos que no cambian el horario: se editan sin aviso. */
export async function updateOpenHouseDetails(openHouseId: string, raw: { publicNotes: string; rsvpEnabled: boolean }): Promise<Result> {
  const parsed = z.object({ publicNotes: z.string().trim().max(500), rsvpEnabled: z.boolean() }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Datos inválidos' }
  const { ctx, db } = await ctxAndDb()
  const oh = await loadOpenHouse(db, ctx, openHouseId)
  if (!oh || !canManage(ctx, oh)) return { ok: false, error: 'Open house no encontrado.' }
  if (oh.status === 'cancelled') return { ok: false, error: 'El open house está cancelado.' }
  const { error } = await db.from('open_houses').update({
    public_notes: parsed.data.publicNotes || null,
    rsvp_enabled: parsed.data.rsvpEnabled,
  }).eq('id', oh.id)
  if (error) return { ok: false, error: error.message }
  await revalidateOpenHouse(db, oh)
  return { ok: true }
}

// ── Contenido y horario de cada correo ───────────────────────────────────────

const ContentPayloadSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('crm'), subject: z.string().trim().min(1, 'El asunto es obligatorio').max(200), content: EmailContentSchema }),
  z.object({ mode: z.literal('template'), resendTemplateId: z.string().trim().min(1, 'El Template ID es obligatorio').max(200) }),
])

async function loadEditableEmail(db: ReturnType<typeof createAdminClient>, ctx: TenantContext, emailId: string) {
  const { data } = await db.from('open_house_emails').select(EMAIL_COLUMNS).eq('id', emailId).maybeSingle()
  const email = data as any
  if (!email) return { error: 'Correo no encontrado.' } as const
  const oh = await loadOpenHouse(db, ctx, email.open_house_id)
  if (!oh || !canManage(ctx, oh)) return { error: 'Correo no encontrado.' } as const
  if (!isEmailEditable(email.status)) return { error: 'Este correo ya salió o se canceló: no se puede editar.' } as const
  if (oh.status === 'cancelled' && email.kind !== 'cancellation') return { error: 'El open house está cancelado.' } as const
  return { email, oh } as const
}

export async function saveOpenHouseEmailContent(
  emailId: string,
  language: string,
  raw: z.input<typeof ContentPayloadSchema>,
): Promise<Result> {
  const parsed = ContentPayloadSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  const { ctx, db } = await ctxAndDb()
  const loaded = await loadEditableEmail(db, ctx, emailId)
  if ('error' in loaded) return { ok: false, error: loaded.error as string }
  const { email, oh } = loaded
  if (!(oh.languages as string[]).includes(language)) return { ok: false, error: 'Ese idioma no está en este open house.' }

  const row = parsed.data.mode === 'crm'
    ? { subject: parsed.data.subject, body_json: parsed.data.content, resend_template_id: null }
    : { subject: null, body_json: null, resend_template_id: parsed.data.resendTemplateId }
  const { error } = await db.from('open_house_email_contents').upsert({
    email_id: email.id, tenant_id: email.tenant_id, language, ...row, updated_at: new Date().toISOString(),
  }, { onConflict: 'email_id,language' })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/properties/${oh.property_id}/open-houses/${oh.id}`)
  return { ok: true }
}

/** Cambia la hora de salida de un correo pendiente (anuncio o recordatorio). */
export async function setOpenHouseEmailSchedule(
  emailId: string,
  raw: { mode: 'on_confirm' } | { mode: 'scheduled'; date: string; time: string },
): Promise<Result<{ warnings: string[] }>> {
  const { ctx, db } = await ctxAndDb()
  const loaded = await loadEditableEmail(db, ctx, emailId)
  if ('error' in loaded) return { ok: false, error: loaded.error as string }
  const { email, oh } = loaded
  if (email.kind !== 'announcement' && email.kind !== 'reminder') return { ok: false, error: 'Los avisos salen en cuanto se crean.' }

  const now = new Date()
  const startsAt = new Date(oh.starts_at)
  let at: Date | null = null
  if (raw.mode === 'scheduled') {
    const w = WhenSchema.safeParse(raw)
    if (!w.success) return { ok: false, error: 'Fecha u hora inválida' }
    at = zonedWallTimeToUtc(w.data.date, w.data.time, oh.timezone)
    if (!at) return { ok: false, error: 'Esa hora no existe en la zona horaria del evento.' }
  } else if (email.kind !== 'announcement' || oh.status !== 'draft') {
    return { ok: false, error: '"Al confirmar" sólo aplica al anuncio de un borrador.' }
  }

  const emails = await loadEmails(db, oh)
  const announcement = emails.find(e => e.kind === 'announcement')!
  const reminder     = emails.find(e => e.kind === 'reminder' && e.status === 'pending')

  let warnings: string[] = []
  if (email.kind === 'announcement') {
    const res = validateAnnouncementAt({ scheduledAt: at, startsAt, now })
    if (!res.ok) return res
    warnings = res.warnings
    // El recordatorio pendiente tiene que seguir quedando después.
    if (reminder) {
      const rem = validateReminderAt({ reminderAt: new Date(reminder.scheduled_at), announcementAt: effectiveSendAt(at ?? now, now), startsAt, now })
      if (!rem.ok) return { ok: false, error: `Con ese horario el recordatorio quedaría mal: ${rem.error}` }
    }
  } else {
    const announcementAt = announcement.status === 'sent'
      ? new Date(announcement.finished_at ?? announcement.scheduled_at)
      : effectiveSendAt(new Date(announcement.scheduled_at), now)
    const res = validateReminderAt({ reminderAt: at!, announcementAt, startsAt, now })
    if (!res.ok) return res
    warnings = res.warnings
  }

  const { error } = await db.from('open_house_emails').update({ scheduled_at: (at ?? now).toISOString() }).eq('id', email.id).eq('status', 'pending')
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/properties/${oh.property_id}/open-houses/${oh.id}`)
  return { ok: true, warnings }
}

/** Activa o apaga el recordatorio (sólo mientras no haya salido). */
export async function setOpenHouseReminder(openHouseId: string, enabled: boolean): Promise<Result<{ warnings: string[] }>> {
  const { ctx, db } = await ctxAndDb()
  const oh = await loadOpenHouse(db, ctx, openHouseId)
  if (!oh || !canManage(ctx, oh)) return { ok: false, error: 'Open house no encontrado.' }
  if (oh.status === 'cancelled') return { ok: false, error: 'El open house está cancelado.' }
  const emails = await loadEmails(db, oh)
  const reminder = emails.find(e => e.kind === 'reminder')
  const announcement = emails.find(e => e.kind === 'announcement')!
  const now = new Date()

  if (!enabled) {
    if (!reminder) return { ok: true, warnings: [] }
    if (reminder.status !== 'pending') return { ok: false, error: 'El recordatorio ya salió.' }
    if (oh.status === 'draft') await db.from('open_house_emails').delete().eq('id', reminder.id)
    else await db.from('open_house_emails').update({ status: 'cancelled' }).eq('id', reminder.id).eq('status', 'pending')
  } else {
    if (reminder && reminder.status !== 'cancelled') return { ok: true, warnings: [] }
    const announcementAt = announcement.status === 'sent'
      ? new Date(announcement.finished_at ?? announcement.scheduled_at)
      : effectiveSendAt(new Date(announcement.scheduled_at), now)
    const at = defaultReminderAt({ startsAt: new Date(oh.starts_at), announcementAt, now })
    if (!at) return { ok: false, error: 'Ya no hay margen para un recordatorio antes del evento.' }
    if (reminder) {
      // El índice único (open_house_id, kind) no deja crear otro: se reactiva.
      await db.from('open_house_emails').update({ status: 'pending', scheduled_at: at.toISOString() }).eq('id', reminder.id)
    } else {
      const { data: created } = await db.from('open_house_emails')
        .insert({ tenant_id: oh.tenant_id, open_house_id: oh.id, kind: 'reminder', scheduled_at: at.toISOString() })
        .select('id').single()
      const id = (created as any)?.id
      if (id) await db.from('open_house_email_contents').insert(defaultContents(id, oh.tenant_id, 'reminder', oh.languages))
    }
  }
  revalidatePath(`/properties/${oh.property_id}/open-houses/${oh.id}`)
  return { ok: true, warnings: [] }
}

// ── Audiencia ────────────────────────────────────────────────────────────────

async function computeAudience(db: ReturnType<typeof createAdminClient>, oh: any): Promise<AudienceSummary> {
  const ids = await audienceLeadIdsByTags(db, oh.tenant_id, oh.audience_tag_ids ?? [], oh.audience_match)
  const leads = await loadAudienceLeads(db, oh.tenant_id, ids)
  return summarizeAudience(leads, oh.languages)
}

export async function previewOpenHouseAudience(openHouseId: string): Promise<Result<{ summary: AudienceSummary }>> {
  const { ctx, db } = await ctxAndDb()
  const oh = await loadOpenHouse(db, ctx, openHouseId)
  if (!oh) return { ok: false, error: 'Open house no encontrado.' }
  return { ok: true, summary: await computeAudience(db, oh) }
}

// ── Confirmar ────────────────────────────────────────────────────────────────

export async function confirmOpenHouse(openHouseId: string, expectedToSend: number): Promise<Result<{ sendsNow: boolean }>> {
  const { ctx, db } = await ctxAndDb()
  const oh = await loadOpenHouse(db, ctx, openHouseId)
  if (!oh || !canManage(ctx, oh)) return { ok: false, error: 'Open house no encontrado.' }
  if (oh.status !== 'draft') return { ok: false, error: 'Este open house ya fue confirmado.' }

  const sender = await resolveOpenHouseSender(db, oh.tenant_id)
  if (!sender.ok) return sender

  const { data: prop } = await db.from('properties').select(columns('properties', ['status'])).eq('id', oh.property_id).maybeSingle()
  if ((prop as any)?.status === 'sold') return { ok: false, error: 'Esta propiedad ya se vendió.' }

  const now = new Date()
  const startsAt = new Date(oh.starts_at)
  const win = validateEventWindow({ startsAt, endsAt: new Date(oh.ends_at), now })
  if (!win.ok) return { ok: false, error: `${win.error} Ajusta la fecha antes de confirmar.` }

  const emails = await loadEmails(db, oh)
  const announcement = emails.find(e => e.kind === 'announcement')
  if (!announcement) return { ok: false, error: 'Falta el correo de anuncio.' }
  const announcementAt = effectiveSendAt(new Date(announcement.scheduled_at), now)
  const ann = validateAnnouncementAt({ scheduledAt: announcementAt, startsAt, now })
  if (!ann.ok) return ann
  const reminder = emails.find(e => e.kind === 'reminder' && e.status === 'pending')
  if (reminder) {
    const rem = validateReminderAt({ reminderAt: new Date(reminder.scheduled_at), announcementAt, startsAt, now })
    if (!rem.ok) return { ok: false, error: `Recordatorio: ${rem.error}` }
  }

  // Cada correo necesita su versión en todos los idiomas del open house.
  const toCheck = [announcement, reminder].filter(Boolean) as any[]
  const { data: contents } = await db.from('open_house_email_contents')
    .select(columns('open_house_email_contents', ['email_id', 'language', 'subject', 'body_json', 'resend_template_id']))
    .in('email_id', toCheck.map(e => e.id))
  for (const e of toCheck) {
    const rows = ((contents ?? []) as any[]).filter(c => c.email_id === e.id)
    const missing = missingLanguages(oh.languages, rows.map(c => ({
      language: c.language,
      ready: !!c.resend_template_id || (!!c.subject && EmailContentSchema.safeParse(c.body_json).success),
    })))
    if (missing.length) {
      return { ok: false, error: `Falta el ${e.kind === 'announcement' ? 'anuncio' : 'recordatorio'} en: ${missing.join(', ').toUpperCase()}.` }
    }
  }

  // La audiencia que se confirma es la que se mostró. Si cambió entre la
  // vista previa y el clic, se vuelve a mostrar en vez de enviar a ciegas.
  const summary = await computeAudience(db, oh)
  if (summary.toSend === 0) return { ok: false, error: 'Ningún lead recibiría el anuncio con esta audiencia.' }
  if (summary.toSend !== expectedToSend) {
    return { ok: false, error: `La audiencia cambió: ahora son ${summary.toSend} leads. Revísala y confirma de nuevo.` }
  }

  const { data: updated } = await db.from('open_houses').update({
    status: 'scheduled', confirmed_at: now.toISOString(), confirmed_by_user_id: ctx.user_id,
  }).eq('id', oh.id).eq('status', 'draft').select('id')
  if (!updated?.length) return { ok: false, error: 'Este open house ya fue confirmado.' }

  await db.from('open_house_emails').update({ scheduled_at: announcementAt.toISOString() }).eq('id', announcement.id)
  const sendsNow = announcementAt.getTime() <= now.getTime()
  if (sendsNow) dispatchSoon(announcement.id)

  await revalidateOpenHouse(db, oh)
  return { ok: true, sendsNow }
}

// ── Reprogramar y cancelar ───────────────────────────────────────────────────

async function changeContext(db: ReturnType<typeof createAdminClient>, oh: any, now: Date): Promise<{ ctx: ChangeContext; emails: Awaited<ReturnType<typeof loadEmails>> }> {
  const emails = await loadEmails(db, oh)
  const announcement = emails.find(e => e.kind === 'announcement')
  const reminder     = emails.find(e => e.kind === 'reminder')
  return {
    emails,
    ctx: {
      status:             oh.status as OpenHouseStatus,
      announcementStatus: announcement?.status ?? null,
      reminder:           reminder ? { status: reminder.status, scheduledAt: new Date(reminder.scheduled_at) } : null,
      hasPendingNotice:   emails.some(e => (e.kind === 'update' || e.kind === 'cancellation') && (e.status === 'pending' || e.status === 'sending')),
      endsAt:             new Date(oh.ends_at),
      now,
    },
  }
}

async function createNotice(
  db: ReturnType<typeof createAdminClient>,
  oh: any,
  kind: 'update' | 'cancellation',
  revision: number,
  contents: z.infer<typeof NoticeContentsSchema>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data: created, error } = await db.from('open_house_emails').insert({
    tenant_id: oh.tenant_id, open_house_id: oh.id, kind, revision, scheduled_at: new Date().toISOString(),
  }).select('id').single()
  if (error || !created) return { ok: false, error: error?.message ?? 'No se pudo crear el aviso.' }
  const id = (created as any).id as string
  const rows = (oh.languages as string[]).map(language => ({
    email_id: id, tenant_id: oh.tenant_id, language,
    subject: contents[language].subject, body_json: contents[language].content, resend_template_id: null,
  }))
  const { error: cErr } = await db.from('open_house_email_contents').insert(rows)
  if (cErr) return { ok: false, error: cErr.message }
  return { ok: true, id }
}

function validateNotice(oh: any, raw: unknown): { ok: true; value: z.infer<typeof NoticeContentsSchema> } | { ok: false; error: string } {
  const parsed = NoticeContentsSchema.safeParse(raw ?? {})
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Contenido del aviso inválido' }
  const missing = (oh.languages as string[]).filter(l => !parsed.data[l])
  if (missing.length) return { ok: false, error: `Falta el aviso en: ${missing.join(', ').toUpperCase()}.` }
  return { ok: true, value: parsed.data }
}

export async function rescheduleOpenHouse(
  openHouseId: string,
  raw: { date: string; startTime: string; endTime: string; timezone: string; notice?: unknown },
): Promise<Result<{ notified: boolean }>> {
  const parsed = z.object({ date: DateStr, startTime: TimeStr, endTime: TimeStr, timezone: z.string().trim().min(1).max(64) }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  const { ctx: user, db } = await ctxAndDb()
  const oh = await loadOpenHouse(db, user, openHouseId)
  if (!oh || !canManage(user, oh)) return { ok: false, error: 'Open house no encontrado.' }

  const now = new Date()
  const startsAt = zonedWallTimeToUtc(parsed.data.date, parsed.data.startTime, parsed.data.timezone)
  const endsAt   = zonedWallTimeToUtc(parsed.data.date, parsed.data.endTime, parsed.data.timezone)
  if (!startsAt || !endsAt) return { ok: false, error: 'Esa fecha u hora no existe en la zona horaria elegida.' }
  const win = validateEventWindow({ startsAt, endsAt, now })
  if (!win.ok) return win

  const { ctx, emails } = await changeContext(db, oh, now)
  const plan = planReschedule({ ...ctx, newStartsAt: startsAt, oldStartsAt: new Date(oh.starts_at) })
  if (!plan.ok) return plan

  // Un anuncio que aún no sale debe seguir quedando antes del nuevo inicio.
  const announcement = emails.find(e => e.kind === 'announcement')
  if (announcement?.status === 'pending') {
    const ann = validateAnnouncementAt({ scheduledAt: new Date(announcement.scheduled_at), startsAt, now })
    if (!ann.ok) return { ok: false, error: `El anuncio aún no sale y quedaría después del nuevo inicio. Ajústalo primero.` }
  }

  let notice: z.infer<typeof NoticeContentsSchema> | null = null
  if (plan.notify) {
    const n = validateNotice(oh, raw.notice)
    if (!n.ok) return n
    notice = n.value
  }

  const revision = plan.notify ? (oh.revision as number) + 1 : oh.revision
  const { error } = await db.from('open_houses').update({
    starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), timezone: parsed.data.timezone, revision,
  }).eq('id', oh.id).eq('status', 'scheduled')
  const overlap = overlapError(error)
  if (overlap) return { ok: false, error: overlap }

  const reminder = emails.find(e => e.kind === 'reminder')
  if (reminder && plan.reminder === 'move') {
    const lead = new Date(oh.starts_at).getTime() - new Date(reminder.scheduled_at).getTime()
    await db.from('open_house_emails').update({ scheduled_at: new Date(startsAt.getTime() - lead).toISOString() }).eq('id', reminder.id).eq('status', 'pending')
  } else if (reminder && plan.reminder === 'cancel') {
    await db.from('open_house_emails').update({ status: 'cancelled', last_error: 'Cancelado al reprogramar: ya no había margen.' }).eq('id', reminder.id).eq('status', 'pending')
  }

  if (notice) {
    const created = await createNotice(db, oh, 'update', revision, notice)
    if (!created.ok) return created
    dispatchSoon(created.id)
  }

  await revalidateOpenHouse(db, oh)
  return { ok: true, notified: plan.notify }
}

export async function cancelOpenHouse(
  openHouseId: string,
  raw: { reason?: string; notice?: unknown },
): Promise<Result<{ notified: boolean }>> {
  const { ctx: user, db } = await ctxAndDb()
  const oh = await loadOpenHouse(db, user, openHouseId)
  if (!oh || !canManage(user, oh)) return { ok: false, error: 'Open house no encontrado.' }

  const now = new Date()
  const { ctx, emails } = await changeContext(db, oh, now)
  const plan = planCancel(ctx)
  if (!plan.ok) return plan

  let notice: z.infer<typeof NoticeContentsSchema> | null = null
  if (plan.notify) {
    const n = validateNotice(oh, raw.notice)
    if (!n.ok) return n
    notice = n.value
  }

  const { data: updated } = await db.from('open_houses').update({
    status: 'cancelled', cancelled_at: now.toISOString(), cancelled_by_user_id: user.user_id,
    cancel_reason: (raw.reason ?? '').trim().slice(0, 300) || null,
  }).eq('id', oh.id).eq('status', 'scheduled').select('id')
  if (!updated?.length) return { ok: false, error: 'El open house cambió mientras tanto. Recarga la página.' }

  const pendingIds = emails.filter(e => e.status === 'pending').map(e => e.id)
  if (pendingIds.length) {
    await db.from('open_house_emails').update({ status: 'cancelled', last_error: 'Open house cancelado.' }).in('id', pendingIds).eq('status', 'pending')
  }

  if (notice) {
    const created = await createNotice(db, { ...oh, status: 'cancelled' }, 'cancellation', oh.revision, notice)
    if (!created.ok) return created
    dispatchSoon(created.id)
  }

  await revalidateOpenHouse(db, oh)
  return { ok: true, notified: plan.notify }
}

// ── RSVP desde el CRM ────────────────────────────────────────────────────────

export async function setRsvpAttendance(rsvpId: string, attended: boolean | null): Promise<Result> {
  const { ctx, db } = await ctxAndDb()
  const { data } = await db.from('open_house_rsvps')
    .select(columns('open_house_rsvps', ['id', 'open_house_id', 'lead_id', 'tenant_id']))
    .eq('id', rsvpId).maybeSingle()
  const rsvp = data as any
  if (!rsvp) return { ok: false, error: 'Respuesta no encontrada.' }
  const oh = await loadOpenHouse(db, ctx, rsvp.open_house_id)
  if (!oh) return { ok: false, error: 'Respuesta no encontrada.' }
  if (new Date(oh.starts_at).getTime() > Date.now()) return { ok: false, error: 'La asistencia se marca cuando el open house ya empezó.' }

  const { error } = await db.from('open_house_rsvps').update({ attended }).eq('id', rsvp.id)
  if (error) return { ok: false, error: error.message }

  // Ir en persona es actividad real: queda en el timeline del lead (una vez).
  if (attended) {
    const { error: evErr } = await db.from('lead_events').insert({
      lead_id: rsvp.lead_id, tenant_id: rsvp.tenant_id, type: 'open_house_attended',
      description: 'Asistió al open house', points: 0, actor_user_id: ctx.user_id,
      dedup_key: `open_house_attended:${oh.id}`, metadata: { open_house_id: oh.id },
    })
    if (evErr && evErr.code !== '23505') console.error(JSON.stringify({ service: 'open-house-actions', rsvp_id: rsvp.id, error: 'attended_event_failed', detail: evErr.message }))
  }
  revalidatePath(`/properties/${oh.property_id}/open-houses/${oh.id}`)
  return { ok: true }
}

/** El agente anota a mano una respuesta (confirmó por teléfono, por ejemplo). */
export async function addRsvpFromCrm(openHouseId: string, leadId: string, response: 'yes' | 'no', guests = 0): Promise<Result> {
  const { ctx, db } = await ctxAndDb()
  const oh = await loadOpenHouse(db, ctx, openHouseId)
  if (!oh || !canManage(ctx, oh)) return { ok: false, error: 'Open house no encontrado.' }
  const res = await recordOpenHouseRsvp(db, { openHouseId: oh.id, leadId, response, guests, source: 'crm', allowEnded: true })
  if (!res.ok) return { ok: false, error: 'No se pudo registrar la respuesta.' }
  revalidatePath(`/properties/${oh.property_id}/open-houses/${oh.id}`)
  return { ok: true }
}
