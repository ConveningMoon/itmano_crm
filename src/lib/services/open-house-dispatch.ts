import 'server-only'
import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resendForAccount } from '@/lib/resend'
import { renderEmail, type EmailLocale } from '@/lib/services/email-render'
import { parseEmailContent } from '@/lib/email-content'
import { generateUnsubscribeUrl } from '@/lib/services/unsubscribe-url'
import { resolveOpenHouseSender } from '@/lib/services/open-house-sender'
import {
  announcementRecipientIds, audienceLeadIdsByTags, loadAudienceLeads, rsvpLeadIds,
  type AudienceLeadWithContact,
} from '@/lib/services/open-house-audience'
import { chunk, decideRecipient } from '@/lib/open-houses/audience'
import { buildOpenHouseMergeVars } from '@/lib/open-houses/format'
import { createRsvpToken } from '@/lib/open-houses/rsvp-token'
import { appBaseUrl, openHouseIcsUrl, openHouseRsvpUrl, propertyPublicUrl } from '@/lib/open-houses/urls'
import type { AudienceMatch, OpenHouseEmailKind } from '@/lib/open-houses/model'

// Despachador de los correos de un open house.
//
// Lo llaman dos caminos: la confirmación (en proceso, con after(), para que un
// anuncio "al confirmar" no espere al cron) y el orquestador horario (para lo
// programado y para retomar lo que quedó a medias). Los dos pueden coincidir;
// por eso cada paso es seguro de repetir:
//
//   1. CLAIM optimista: pasar el correo a `sending` sólo si nadie lo cambió
//      desde que se leyó (`updated_at` como testigo). El que pierde, se va.
//   2. CONGELAR destinatarios una vez: la PK (email_id, lead_id) impide que
//      una segunda pasada duplique a nadie.
//   3. ENVIAR por lotes de 100 con Idempotency-Key derivada de los leads del
//      lote: si Resend aceptó un lote y el proceso murió antes de anotarlo, el
//      reintento recibe los mismos ids en vez de mandar otra vez.
//   4. Si se acaba el tiempo, el correo vuelve a `pending` con su hora ya
//      vencida y la siguiente ejecución sigue donde quedó.
//
// No escribe lead_events por cada envío: el trigger de scoring refresca
// `last_event_at` en todo insert, y un anuncio a 500 leads los marcaría a
// todos como recién activos. El registro por lead es la tabla de
// destinatarios; lo que sí puntúa es la RESPUESTA (el RSVP).

/* eslint-disable @typescript-eslint/no-explicit-any */

const BATCH_SIZE        = 100
const MAX_ATTEMPTS      = 3
const STALE_SENDING_MS  = 15 * 60 * 1000
// Resend limita requests por segundo por cuenta; una pausa corta entre
// llamadas evita el 429 sin alargar de verdad un envío de cientos.
const PAUSE_BETWEEN_CALLS_MS = 600

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export type DispatchOutcome =
  | 'sent' | 'partial' | 'not_due' | 'claimed_elsewhere'
  | 'cancelled' | 'failed' | 'not_found'

export interface DispatchResult {
  outcome: DispatchOutcome
  sent:    number
  detail?: string
}

interface EmailRow {
  id: string
  tenant_id: string
  open_house_id: string
  kind: OpenHouseEmailKind
  scheduled_at: string
  status: string
  attempts: number
  started_at: string | null
  updated_at: string
  recipients_frozen_at: string | null
}

function isDue(row: EmailRow, now: Date): boolean {
  if (row.status === 'pending') return new Date(row.scheduled_at).getTime() <= now.getTime()
  if (row.status === 'sending') {
    return !row.started_at || now.getTime() - new Date(row.started_at).getTime() > STALE_SENDING_MS
  }
  return false
}

async function finish(db: SupabaseClient, emailId: string, fields: Record<string, unknown>) {
  const { error } = await db.from('open_house_emails').update(fields).eq('id', emailId)
  if (error) {
    console.error(JSON.stringify({ service: 'open-house-dispatch', email_id: emailId, error: 'finish_update_failed', detail: error.message }))
  }
}

/** Qué leads reciben un correo, según su tipo. */
async function recipientLeadIds(db: SupabaseClient, oh: any, kind: OpenHouseEmailKind): Promise<string[]> {
  const tenantId = oh.tenant_id as string
  switch (kind) {
    case 'announcement':
      return audienceLeadIdsByTags(db, tenantId, (oh.audience_tag_ids as string[]) ?? [], oh.audience_match as AudienceMatch)
    case 'reminder':
      return rsvpLeadIds(db, tenantId, oh.id, 'yes')
    case 'update': {
      // A quien le llegó el anuncio y a quien respondió (también a quien dijo
      // que no: con la fecha nueva quizá sí puede).
      const [received, answered] = await Promise.all([
        announcementRecipientIds(db, tenantId, oh.id),
        rsvpLeadIds(db, tenantId, oh.id),
      ])
      return [...new Set([...received, ...answered])]
    }
    case 'cancellation': {
      const [received, coming] = await Promise.all([
        announcementRecipientIds(db, tenantId, oh.id),
        rsvpLeadIds(db, tenantId, oh.id, 'yes'),
      ])
      return [...new Set([...received, ...coming])]
    }
  }
}

async function freezeRecipients(db: SupabaseClient, email: EmailRow, oh: any): Promise<void> {
  const ids   = await recipientLeadIds(db, oh, email.kind)
  const leads = await loadAudienceLeads(db, email.tenant_id, ids)
  const rows  = leads.map(lead => {
    const d = decideRecipient(lead, oh.languages as string[])
    return {
      email_id:    email.id,
      lead_id:     lead.id,
      tenant_id:   email.tenant_id,
      language:    d.language,
      status:      d.send ? 'pending' : 'skipped',
      skip_reason: d.send ? null : d.reason,
    }
  })
  for (const part of chunk(rows, 500)) {
    const { error } = await db
      .from('open_house_email_recipients')
      .upsert(part, { onConflict: 'email_id,lead_id', ignoreDuplicates: true })
    if (error) throw new Error(`freeze_failed: ${error.message}`)
  }
  await db.from('open_house_emails')
    .update({ recipients_frozen_at: new Date().toISOString() })
    .eq('id', email.id)
}

interface ContentRow { language: string; subject: string | null; body_json: unknown; resend_template_id: string | null }

function idempotencyKey(emailId: string, leadIds: string[]): string {
  const h = createHash('sha256').update([...leadIds].sort().join(',')).digest('hex').slice(0, 32)
  return `open-house/${emailId}/${h}`
}

function isRateLimit(err: { message?: string; name?: string; statusCode?: number } | null | undefined): boolean {
  if (!err) return false
  return err.statusCode === 429 || /rate.?limit|too many/i.test(`${err.name ?? ''} ${err.message ?? ''}`)
}

export async function dispatchOpenHouseEmail(
  db: SupabaseClient,
  emailId: string,
  opts: { deadline: number; now?: () => Date } ,
): Promise<DispatchResult> {
  const now = opts.now ?? (() => new Date())

  const { data: row } = await db
    .from('open_house_emails')
    .select('id, tenant_id, open_house_id, kind, scheduled_at, status, attempts, started_at, updated_at, recipients_frozen_at')
    .eq('id', emailId)
    .maybeSingle()
  if (!row) return { outcome: 'not_found', sent: 0 }
  const email = row as EmailRow
  if (!isDue(email, now())) return { outcome: 'not_due', sent: 0 }

  // 1. Claim optimista.
  const { data: claimed } = await db
    .from('open_house_emails')
    .update({ status: 'sending', started_at: now().toISOString(), attempts: email.attempts + 1 })
    .eq('id', email.id)
    .eq('status', email.status)
    .eq('updated_at', email.updated_at)
    .select('id')
  if (!claimed || claimed.length === 0) return { outcome: 'claimed_elsewhere', sent: 0 }

  // 2. El open house tiene que seguir en el estado que este correo supone.
  const { data: ohRow } = await db
    .from('open_houses')
    .select('id, tenant_id, property_id, starts_at, ends_at, timezone, public_notes, languages, audience_tag_ids, audience_match, status, revision')
    .eq('id', email.open_house_id)
    .eq('tenant_id', email.tenant_id)
    .maybeSingle()
  const oh = ohRow as any
  if (!oh) {
    await finish(db, email.id, { status: 'cancelled', last_error: 'El open house ya no existe.', finished_at: now().toISOString() })
    return { outcome: 'cancelled', sent: 0 }
  }
  if (email.kind === 'cancellation' ? oh.status !== 'cancelled' : oh.status !== 'scheduled') {
    await finish(db, email.id, { status: 'cancelled', last_error: 'El open house cambió de estado antes del envío.', finished_at: now().toISOString() })
    return { outcome: 'cancelled', sent: 0 }
  }
  if (email.kind !== 'cancellation' && new Date(oh.starts_at).getTime() <= now().getTime()) {
    await finish(db, email.id, { status: 'cancelled', last_error: 'El open house ya empezó: el correo dejó de tener sentido.', finished_at: now().toISOString() })
    return { outcome: 'cancelled', sent: 0 }
  }

  // 3. Remitente: se vuelve a comprobar en cada envío (el tenant pudo perder
  //    su dominio propio entre la confirmación y la hora programada).
  const senderRes = await resolveOpenHouseSender(db, email.tenant_id)
  if (!senderRes.ok) {
    await finish(db, email.id, { status: 'failed', last_error: senderRes.error, finished_at: now().toISOString() })
    return { outcome: 'failed', sent: 0, detail: senderRes.error }
  }
  const { identity, tenantSlug } = senderRes.sender

  const [{ data: property }, { data: contentRows }] = await Promise.all([
    db.from('properties')
      .select('name, address, city, state, slug, published_to_web, external_url')
      .eq('id', oh.property_id)
      .eq('tenant_id', email.tenant_id)
      .maybeSingle(),
    db.from('open_house_email_contents')
      .select('language, subject, body_json, resend_template_id')
      .eq('email_id', email.id)
      .eq('tenant_id', email.tenant_id),
  ])
  if (!property) {
    await finish(db, email.id, { status: 'cancelled', last_error: 'La propiedad ya no existe.', finished_at: now().toISOString() })
    return { outcome: 'cancelled', sent: 0 }
  }
  const p = property as any
  const contents = new Map<string, ContentRow>(((contentRows ?? []) as ContentRow[]).map(c => [c.language, c]))

  try {
    if (!email.recipients_frozen_at) await freezeRecipients(db, email, oh)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await finish(db, email.id, { status: 'pending', last_error: message })
    return { outcome: 'failed', sent: 0, detail: message }
  }

  const baseUrl      = appBaseUrl()
  const propertyName = (p.name as string | null) ?? (p.address as string)
  const address      = [p.address, p.city, p.state].filter(Boolean).join(', ')
  const propertyUrl  = propertyPublicUrl(tenantSlug, p)
  const calendarUrl  = openHouseIcsUrl(baseUrl, oh.id)
  const client       = resendForAccount(identity.account)

  let sentNow = 0
  let outOfTime = false
  let rateLimited = false

  // 4. Lotes. Cualquier excepción inesperada (una variable de entorno que
  // falta, un fallo de red) devuelve el correo a `pending` con el error a la
  // vista: sin esto quedaría en `sending` hasta la recuperación de 15 minutos
  // y la pantalla diría "enviando" sin explicar nada.
  try {
    while (Date.now() < opts.deadline) {
      const { data: pendingRows, error: pendingErr } = await db
        .from('open_house_email_recipients')
        .select('lead_id, language, attempts')
        .eq('email_id', email.id)
        .eq('status', 'pending')
        .order('lead_id')
        .limit(BATCH_SIZE)
      if (pendingErr) {
        await finish(db, email.id, { status: 'pending', last_error: pendingErr.message })
        return { outcome: 'failed', sent: sentNow, detail: pendingErr.message }
      }
      const pending = (pendingRows ?? []) as { lead_id: string; language: string; attempts: number }[]
      if (pending.length === 0) break

      // Datos frescos del lead: una baja o un rebote de la última hora cuenta.
      const leads = new Map<string, AudienceLeadWithContact>(
        (await loadAudienceLeads(db, email.tenant_id, pending.map(r => r.lead_id))).map(l => [l.id, l]),
      )

      const skipped: { lead_id: string; skip_reason: string }[] = []
      const crm:      { leadId: string; payload: any }[] = []
      const template: { leadId: string; payload: any }[] = []

      for (const r of pending) {
        const lead = leads.get(r.lead_id)
        if (!lead || !lead.email) { skipped.push({ lead_id: r.lead_id, skip_reason: 'no_email' }); continue }
        if (lead.emailBlocked)    { skipped.push({ lead_id: r.lead_id, skip_reason: 'email_blocked' }); continue }
        const content = contents.get(r.language)
        const crmContent = parseEmailContent(content?.body_json)
        const subject    = content?.subject?.trim() || null
        if (!content || (!(crmContent && subject) && !content.resend_template_id)) {
          skipped.push({ lead_id: r.lead_id, skip_reason: 'no_language' }); continue
        }

        const unsubscribeUrl = generateUnsubscribeUrl(lead.id)
        const vars = buildOpenHouseMergeVars({
          customerName:    lead.firstName,
          agentName:       lead.agentName,
          agentEmail:      lead.agentEmail,
          propertyName,
          propertyAddress: address,
          startsAt:        oh.starts_at,
          endsAt:          oh.ends_at,
          timeZone:        oh.timezone,
          language:        r.language,
          publicNotes:     oh.public_notes,
          propertyUrl,
          rsvpUrl:         openHouseRsvpUrl(baseUrl, tenantSlug, createRsvpToken(oh.id, lead.id)),
          calendarUrl,
        })
        const headers = {
          'List-Unsubscribe':      `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        }
        // Las respuestas llegan al agente del lead, que es quien firma.
        const replyTo = lead.agentEmail || undefined

        if (crmContent && subject) {
          const rendered = renderEmail({
            subject, content: crmContent, vars,
            signature: lead.agentSignature,
            unsubscribeUrl,
            locale: r.language as EmailLocale,
          })
          crm.push({ leadId: lead.id, payload: {
            from: identity.from, to: lead.email, headers, replyTo,
            subject: rendered.subject, html: rendered.html,
          } })
        } else {
          template.push({ leadId: lead.id, payload: {
            from: identity.from, to: lead.email, headers, replyTo,
            template: { id: content.resend_template_id as string, variables: { ...vars, unsubscribe_url: unsubscribeUrl } },
          } })
        }
      }

      if (skipped.length > 0) {
        await db.from('open_house_email_recipients').upsert(
          skipped.map(s => ({ email_id: email.id, lead_id: s.lead_id, tenant_id: email.tenant_id, status: 'skipped', skip_reason: s.skip_reason })),
          { onConflict: 'email_id,lead_id' },
        )
      }

      const sentRows:   { lead_id: string; resend_email_id: string; subject: string | null }[] = []
      const failedRows: { lead_id: string; error: string }[] = []

      // Contenido del CRM → API batch (100 por llamada).
      if (crm.length > 0) {
        const res = await client.batch.send(crm.map(c => c.payload), {
          idempotencyKey:  idempotencyKey(email.id, crm.map(c => c.leadId)),
          batchValidation: 'permissive',
        })
        if (res.error) {
          if (isRateLimit(res.error as any)) { rateLimited = true }
          else crm.forEach(c => failedRows.push({ lead_id: c.leadId, error: res.error!.message }))
        } else {
          const ids    = res.data?.data ?? []
          const errors = new Map<number, string>(((res.data as any)?.errors ?? []).map((e: any) => [e.index, e.message]))
          // En modo permisivo `data` trae sólo los aceptados, en orden: se
          // emparejan saltando los índices que fallaron.
          let cursor = 0
          crm.forEach((c, i) => {
            if (errors.has(i)) { failedRows.push({ lead_id: c.leadId, error: errors.get(i)! }); return }
            const id = ids[cursor++]?.id
            if (id) sentRows.push({ lead_id: c.leadId, resend_email_id: id, subject: c.payload.subject as string })
            else failedRows.push({ lead_id: c.leadId, error: 'Resend no devolvió id' })
          })
        }
        await sleep(PAUSE_BETWEEN_CALLS_MS)
      }

      // Templates de Resend → uno por uno (la API batch no es el camino
      // documentado para templates). Idempotencia por lead.
      for (const t of template) {
        if (rateLimited || Date.now() >= opts.deadline) break
        const res = await client.emails.send(t.payload, { idempotencyKey: `open-house/${email.id}/${t.leadId}` })
        if (res.error) {
          if (isRateLimit(res.error as any)) { rateLimited = true; break }
          failedRows.push({ lead_id: t.leadId, error: res.error.message })
        } else if (res.data?.id) {
          sentRows.push({ lead_id: t.leadId, resend_email_id: res.data.id, subject: null })
        }
        await sleep(PAUSE_BETWEEN_CALLS_MS)
      }

      const sentAt = new Date().toISOString()
      if (sentRows.length > 0) {
        const { error: upErr } = await db.from('open_house_email_recipients').upsert(
          sentRows.map(s => ({
            email_id: email.id, lead_id: s.lead_id, tenant_id: email.tenant_id,
            status: 'sent', resend_email_id: s.resend_email_id, sent_at: sentAt,
          })),
          { onConflict: 'email_id,lead_id' },
        )
        if (upErr) console.error(JSON.stringify({ service: 'open-house-dispatch', email_id: email.id, error: 'recipients_update_failed', detail: upErr.message }))

        // email_sends: atribución de rebotes, quejas, clicks y respuestas.
        const { error: sendsErr } = await db.from('email_sends').insert(sentRows.map(s => ({
          tenant_id:           email.tenant_id,
          lead_id:             s.lead_id,
          sequence_run_id:     null,
          step_order:          null,
          resend_email_id:     s.resend_email_id,
          resend_template_id:  null,
          send_type:           'open_house',
          open_house_email_id: email.id,
          subject:             s.subject,
          sent_at:             sentAt,
        })))
        if (sendsErr) console.error(JSON.stringify({ service: 'open-house-dispatch', email_id: email.id, error: 'email_sends_insert_failed', detail: sendsErr.message }))
        sentNow += sentRows.length
      }

      if (failedRows.length > 0) {
        const attemptsByLead = new Map(pending.map(r => [r.lead_id, r.attempts]))
        await db.from('open_house_email_recipients').upsert(
          failedRows.map(f => {
            const attempts = (attemptsByLead.get(f.lead_id) ?? 0) + 1
            return {
              email_id: email.id, lead_id: f.lead_id, tenant_id: email.tenant_id,
              attempts, last_error: f.error.slice(0, 500),
              status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
            }
          }),
          { onConflict: 'email_id,lead_id' },
        )
      }

      if (rateLimited) break
      // Un lote que no avanzó (nada enviado ni descartado) no gira en el mismo
      // proceso: los fallos reintentables los retoma la próxima ejecución.
      if (sentRows.length === 0 && skipped.length === 0) break
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(JSON.stringify({ service: 'open-house-dispatch', email_id: email.id, error: 'send_loop_failed', detail: message }))
    const counts = await countRecipients(db, email.id)
    await finish(db, email.id, {
      status: 'pending', sent_count: counts.sent, skipped_count: counts.skipped, failed_count: counts.failed,
      last_error: `El envío se interrumpió y se reintentará en la próxima ejecución: ${message}`.slice(0, 500),
    })
    return { outcome: 'failed', sent: sentNow, detail: message }
  }
  if (Date.now() >= opts.deadline) outOfTime = true

  // 5. Cierre con conteos reales.
  const counts = await countRecipients(db, email.id)
  const done   = counts.pending === 0
  await finish(db, email.id, {
    status:        done ? 'sent' : 'pending',
    sent_count:    counts.sent,
    skipped_count: counts.skipped,
    failed_count:  counts.failed,
    finished_at:   done ? new Date().toISOString() : null,
    last_error:    rateLimited ? 'Resend limitó la velocidad de envío; se reanuda en la próxima ejecución.' : (outOfTime && !done ? 'Se reanuda en la próxima ejecución.' : null),
  })

  console.log(JSON.stringify({
    service: 'open-house-dispatch', email_id: email.id, kind: email.kind,
    sent_now: sentNow, ...counts, done,
  }))
  return { outcome: done ? 'sent' : 'partial', sent: sentNow }
}

async function countRecipients(db: SupabaseClient, emailId: string) {
  const statuses = ['pending', 'sent', 'skipped', 'failed'] as const
  const results = await Promise.all(statuses.map(s =>
    db.from('open_house_email_recipients')
      .select('lead_id', { count: 'exact', head: true })
      .eq('email_id', emailId)
      .eq('status', s),
  ))
  return Object.fromEntries(statuses.map((s, i) => [s, results[i].count ?? 0])) as Record<(typeof statuses)[number], number>
}

/**
 * Etapa del orquestador: despacha los correos de open house vencidos (y
 * retoma los que quedaron en `sending` más de 15 minutos).
 */
export async function dispatchDueOpenHouseEmails(
  db: SupabaseClient,
  opts: { deadline: number },
): Promise<{ processed: number; sent: number }> {
  const nowIso   = new Date().toISOString()
  const staleIso = new Date(Date.now() - STALE_SENDING_MS).toISOString()
  const { data, error } = await db
    .from('open_house_emails')
    .select('id')
    .or(`and(status.eq.pending,scheduled_at.lte.${nowIso}),and(status.eq.sending,started_at.lt.${staleIso})`)
    .order('scheduled_at', { ascending: true })
    .limit(20)
  if (error) {
    console.error(JSON.stringify({ service: 'open-house-dispatch', error: error.message }))
    return { processed: 0, sent: 0 }
  }
  let processed = 0
  let sent = 0
  for (const row of (data ?? []) as { id: string }[]) {
    if (Date.now() >= opts.deadline) break
    try {
      const res = await dispatchOpenHouseEmail(db, row.id, { deadline: opts.deadline })
      processed++
      sent += res.sent
    } catch (err) {
      console.error(JSON.stringify({ service: 'open-house-dispatch', email_id: row.id, error: err instanceof Error ? err.message : String(err) }))
    }
  }
  return { processed, sent }
}
