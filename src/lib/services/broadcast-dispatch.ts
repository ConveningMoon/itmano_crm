import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resendForAccount } from '@/lib/resend'
import { BATCH_SIZE, PAUSE_BETWEEN_CALLS_MS, batchIdempotencyKey, sendPermissiveBatch, sleep } from '@/lib/email/batch-send'
import { parseEmailContent, type EmailContent } from '@/lib/email-content'
import { chunk, decideRecipient } from '@/lib/open-houses/audience'
import { parseBroadcastAudience } from '@/lib/broadcasts/audience'
import { broadcastGuardReason, broadcastQuotaError, MAX_BROADCAST_RECIPIENTS } from '@/lib/broadcasts/model'
import { resolveBroadcastLeadIds } from '@/lib/services/broadcast-audience'
import { renderEmail, type EmailLocale } from '@/lib/services/email-render'
import { loadAudienceLeads, type AudienceLeadWithContact } from '@/lib/services/open-house-audience'
import { resolveOpenHouseSender } from '@/lib/services/open-house-sender'
import { senderFromForAgent } from '@/lib/services/sender-identity'
import { generateUnsubscribeUrl } from '@/lib/services/unsubscribe-url'
import { monthlyEmailAllowance } from '@/lib/subscriptions/quota'
import { columns } from '@/lib/supabase/columns'

// Despachador de los correos grupales. Mismo contrato que el de open houses
// (open-house-dispatch.ts): lo llaman la confirmación "enviar ahora" y el
// orquestador horario, pueden coincidir, y cada paso es seguro de repetir:
//
//   1. CLAIM optimista con `updated_at` como testigo. El que pierde, se va.
//   2. CONGELAR destinatarios una vez, con la PK (broadcast_id, lead_id).
//   3. ENVIAR por lotes con Idempotency-Key derivada de los leads del lote.
//   4. Si se acaba el tiempo, vuelve a `pending` y la siguiente ejecución sigue.
//
// Dos cosas propias de un envío que alguien lanzó a mano:
//
//   · Se relee el estado antes de cada lote: cancelar a mitad de envío detiene
//     lo que falta, y el cierre nunca pisa un `cancelled` o un `paused`.
//   · La guarda de reputación se evalúa antes de cada lote con los rebotes y
//     quejas que ya llegaron por webhook.
//
// No escribe lead_events: el trigger de scoring marcaría a toda la lista como
// recién activa. Lo que puntúa es la respuesta del lead, por el webhook.

/* eslint-disable @typescript-eslint/no-explicit-any */

const MAX_ATTEMPTS     = 3
const STALE_SENDING_MS = 15 * 60 * 1000

const BROADCAST_COLUMNS = columns('email_broadcasts', [
  'id', 'tenant_id', 'status', 'scheduled_at', 'attempts', 'started_at', 'updated_at', 'audience', 'languages',
  'sender_agent_id', 'scope_agent_id', 'recipients_frozen_at', 'guard_overridden_at',
])
const CONTENT_COLUMNS = columns('email_broadcast_contents', ['language', 'subject', 'body_json'])
const AGENT_COLUMNS   = columns('agents', ['name', 'email', 'email_signature', 'sender_local_part'])
const TENANT_COLUMNS  = columns('tenants', ['postal_address'])

export const POSTAL_ADDRESS_REQUIRED_MESSAGE =
  'Un correo grupal necesita la dirección postal del negocio en el pie (la exige la ley CAN-SPAM). Agrégala antes de enviar.'

export const BROADCAST_OWN_DOMAIN_MESSAGE =
  'Los correos grupales sólo están disponibles cuando tu equipo envía desde su propio dominio verificado (planes Growth y Partner): un envío masivo desde el dominio compartido pondría en riesgo la entrega de todos. Configúralo en Configuración → Email.'

export type BroadcastDispatchOutcome =
  | 'sent' | 'partial' | 'not_due' | 'claimed_elsewhere' | 'stopped' | 'paused' | 'failed' | 'not_found'

export interface BroadcastDispatchResult {
  outcome: BroadcastDispatchOutcome
  sent:    number
  detail?: string
}

interface BroadcastRow {
  id: string
  tenant_id: string
  status: string
  scheduled_at: string | null
  attempts: number
  started_at: string | null
  updated_at: string
  audience: unknown
  languages: string[]
  sender_agent_id: string | null
  scope_agent_id: string | null
  recipients_frozen_at: string | null
  guard_overridden_at: string | null
}

function isDue(row: BroadcastRow, now: Date): boolean {
  if (row.status === 'pending') return !!row.scheduled_at && new Date(row.scheduled_at).getTime() <= now.getTime()
  if (row.status === 'sending') {
    return !row.started_at || now.getTime() - new Date(row.started_at).getTime() > STALE_SENDING_MS
  }
  return false
}

/** Cierra el turno de este proceso. Sólo si sigue `sending`: alguien pudo cancelarlo. */
async function finish(db: SupabaseClient, id: string, fields: Record<string, unknown>) {
  const { error } = await db.from('email_broadcasts').update(fields).eq('id', id).eq('status', 'sending')
  if (error) {
    console.error(JSON.stringify({ service: 'broadcast-dispatch', broadcast_id: id, error: 'finish_update_failed', detail: error.message }))
  }
}

async function countRecipients(db: SupabaseClient, id: string) {
  const statuses = ['pending', 'sent', 'skipped', 'failed'] as const
  const results = await Promise.all(statuses.map(s =>
    db.from('email_broadcast_recipients')
      .select('lead_id', { count: 'exact', head: true })
      .eq('broadcast_id', id)
      .eq('status', s),
  ))
  return Object.fromEntries(statuses.map((s, i) => [s, results[i].count ?? 0])) as Record<(typeof statuses)[number], number>
}

/** Congela la lista. Devuelve el motivo si el envío no puede salir. */
async function freezeRecipients(db: SupabaseClient, row: BroadcastRow): Promise<string | null> {
  const audience = parseBroadcastAudience(row.audience)
  const { ids, overflow } = await resolveBroadcastLeadIds(db, row.tenant_id, row.scope_agent_id, audience)
  if (overflow) return `La audiencia creció y ahora pasa del tope de ${MAX_BROADCAST_RECIPIENTS} destinatarios por envío. Acótala y vuelve a intentarlo.`

  const leads = await loadAudienceLeads(db, row.tenant_id, ids)
  const rows = leads.map(lead => {
    const d = decideRecipient(lead, row.languages)
    return {
      broadcast_id: row.id,
      lead_id:      lead.id,
      tenant_id:    row.tenant_id,
      language:     d.language,
      status:       d.send ? 'pending' : 'skipped',
      skip_reason:  d.send ? null : d.reason,
    }
  })

  const quotaError = broadcastQuotaError(
    await monthlyEmailAllowance(row.tenant_id),
    rows.filter(r => r.status === 'pending').length,
  )
  if (quotaError) return quotaError

  for (const part of chunk(rows, 500)) {
    const { error } = await db
      .from('email_broadcast_recipients')
      .upsert(part, { onConflict: 'broadcast_id,lead_id', ignoreDuplicates: true })
    if (error) throw new Error(`freeze_failed: ${error.message}`)
  }
  const { error } = await db.from('email_broadcasts')
    .update({ recipients_frozen_at: new Date().toISOString() })
    .eq('id', row.id)
  if (error) throw new Error(`freeze_failed: ${error.message}`)
  return null
}

async function readHealth(db: SupabaseClient, tenantId: string, id: string) {
  const { data, error } = await db.rpc('email_broadcast_metrics', { p_tenant_id: tenantId, p_broadcast_ids: [id] })
  if (error) throw new Error(error.message)
  const m = (data as any)?.[id]
  return { leads: (m?.leads as number) ?? 0, bounced: (m?.bounced as number) ?? 0, complained: (m?.complained as number) ?? 0 }
}

export async function dispatchBroadcast(
  db: SupabaseClient,
  broadcastId: string,
  opts: { deadline: number; now?: () => Date },
): Promise<BroadcastDispatchResult> {
  const now = opts.now ?? (() => new Date())

  const { data: found } = await db.from('email_broadcasts').select(BROADCAST_COLUMNS).eq('id', broadcastId).maybeSingle()
  if (!found) return { outcome: 'not_found', sent: 0 }
  const row = found as unknown as BroadcastRow
  if (!isDue(row, now())) return { outcome: 'not_due', sent: 0 }

  // 1. Claim optimista.
  const { data: claimed } = await db
    .from('email_broadcasts')
    .update({ status: 'sending', started_at: now().toISOString(), attempts: row.attempts + 1 })
    .eq('id', row.id)
    .eq('status', row.status)
    .eq('updated_at', row.updated_at)
    .select('id')
  if (!claimed || claimed.length === 0) return { outcome: 'claimed_elsewhere', sent: 0 }

  const fail = async (message: string): Promise<BroadcastDispatchResult> => {
    await finish(db, row.id, { status: 'failed', last_error: message.slice(0, 500), finished_at: now().toISOString() })
    return { outcome: 'failed', sent: 0, detail: message }
  }

  // 2. Remitente y pie: se comprueban en cada ejecución. El tenant pudo perder
  //    su dominio propio, o vaciar su dirección, entre confirmar y enviar.
  const senderRes = await resolveOpenHouseSender(db, row.tenant_id, BROADCAST_OWN_DOMAIN_MESSAGE)
  if (!senderRes.ok) return fail(senderRes.error)
  const { identity } = senderRes.sender

  const [{ data: tenant }, { data: contentRows }, { data: senderAgent }] = await Promise.all([
    db.from('tenants').select(TENANT_COLUMNS).eq('id', row.tenant_id).maybeSingle(),
    db.from('email_broadcast_contents').select(CONTENT_COLUMNS).eq('broadcast_id', row.id).eq('tenant_id', row.tenant_id),
    row.sender_agent_id
      ? db.from('agents').select(AGENT_COLUMNS).eq('id', row.sender_agent_id).eq('tenant_id', row.tenant_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const postalAddress = ((tenant as any)?.postal_address as string | null)?.trim() || null
  if (!postalAddress) return fail(POSTAL_ADDRESS_REQUIRED_MESSAGE)

  const contents = new Map<string, { subject: string; content: EmailContent }>()
  for (const c of (contentRows ?? []) as any[]) {
    const content = parseEmailContent(c.body_json)
    if (content && c.subject) contents.set(c.language as string, { subject: c.subject as string, content })
  }

  // 3. Lista congelada.
  try {
    if (!row.recipients_frozen_at) {
      const blocked = await freezeRecipients(db, row)
      if (blocked) return fail(blocked)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await finish(db, row.id, { status: 'pending', last_error: message.slice(0, 500) })
    return { outcome: 'failed', sent: 0, detail: message }
  }

  const client = resendForAccount(identity.account)
  let sentNow = 0
  let rateLimited = false

  // 4. Lotes.
  try {
    while (Date.now() < opts.deadline) {
      const { data: current } = await db.from('email_broadcasts').select('status').eq('id', row.id).maybeSingle()
      if ((current as any)?.status !== 'sending') return { outcome: 'stopped', sent: sentNow }

      if (!row.guard_overridden_at) {
        const reason = broadcastGuardReason(await readHealth(db, row.tenant_id, row.id))
        if (reason) {
          const counts = await countRecipients(db, row.id)
          await finish(db, row.id, {
            status: 'paused', last_error: reason.slice(0, 500),
            sent_count: counts.sent, skipped_count: counts.skipped, failed_count: counts.failed,
          })
          return { outcome: 'paused', sent: sentNow, detail: reason }
        }
      }

      const { data: pendingRows, error: pendingErr } = await db
        .from('email_broadcast_recipients')
        .select('lead_id, language, attempts')
        .eq('broadcast_id', row.id)
        .eq('status', 'pending')
        .order('lead_id')
        .limit(BATCH_SIZE)
      if (pendingErr) throw new Error(pendingErr.message)
      const pending = (pendingRows ?? []) as { lead_id: string; language: string; attempts: number }[]
      if (pending.length === 0) break

      // Datos frescos del lead: una baja o un rebote de la última hora cuenta.
      const leads = new Map<string, AudienceLeadWithContact>(
        (await loadAudienceLeads(db, row.tenant_id, pending.map(r => r.lead_id))).map(l => [l.id, l]),
      )

      const skipped: { lead_id: string; skip_reason: string }[] = []
      const items: { leadId: string; payload: any }[] = []

      for (const r of pending) {
        const lead = leads.get(r.lead_id)
        if (!lead || !lead.email) { skipped.push({ lead_id: r.lead_id, skip_reason: 'no_email' }); continue }
        if (lead.emailBlocked)    { skipped.push({ lead_id: r.lead_id, skip_reason: 'email_blocked' }); continue }
        const version = contents.get(r.language)
        if (!version)             { skipped.push({ lead_id: r.lead_id, skip_reason: 'no_language' }); continue }

        const fixed = senderAgent as any
        const agent = fixed
          ? { name: (fixed.name as string) ?? '', email: (fixed.email as string | null) ?? '', signature: (fixed.email_signature as string | null) ?? null, senderLocalPart: (fixed.sender_local_part as string | null) ?? null }
          : { name: lead.agentName, email: lead.agentEmail, signature: lead.agentSignature, senderLocalPart: lead.agentSenderLocalPart }

        const unsubscribeUrl = generateUnsubscribeUrl(lead.id)
        const rendered = renderEmail({
          subject:   version.subject,
          content:   version.content,
          vars:      { customer_name: lead.firstName, agent_name: agent.name, agent_email: agent.email },
          signature: agent.signature,
          unsubscribeUrl,
          postalAddress,
          locale:    r.language as EmailLocale,
        })
        items.push({ leadId: lead.id, payload: {
          from:    senderFromForAgent(identity, agent),
          to:      lead.email,
          replyTo: agent.email || undefined,
          headers: {
            'List-Unsubscribe':      `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
          subject: rendered.subject,
          html:    rendered.html,
        } })
      }

      if (skipped.length > 0) {
        await db.from('email_broadcast_recipients').upsert(
          skipped.map(s => ({ broadcast_id: row.id, lead_id: s.lead_id, tenant_id: row.tenant_id, status: 'skipped', skip_reason: s.skip_reason })),
          { onConflict: 'broadcast_id,lead_id' },
        )
      }

      let sentInBatch = 0
      if (items.length > 0) {
        const res = await sendPermissiveBatch(client, items, batchIdempotencyKey(`broadcast/${row.id}`, items.map(i => i.leadId)))
        rateLimited = res.rateLimited
        sentInBatch = res.sent.length

        const sentAt = new Date().toISOString()
        if (res.sent.length > 0) {
          const { error: upErr } = await db.from('email_broadcast_recipients').upsert(
            res.sent.map(s => ({
              broadcast_id: row.id, lead_id: s.item.leadId, tenant_id: row.tenant_id,
              status: 'sent', resend_email_id: s.id, sent_at: sentAt,
            })),
            { onConflict: 'broadcast_id,lead_id' },
          )
          if (upErr) console.error(JSON.stringify({ service: 'broadcast-dispatch', broadcast_id: row.id, error: 'recipients_update_failed', detail: upErr.message }))

          // email_sends: atribución de rebotes, quejas, clicks y respuestas.
          const { error: sendsErr } = await db.from('email_sends').insert(res.sent.map(s => ({
            tenant_id:          row.tenant_id,
            lead_id:            s.item.leadId,
            sequence_run_id:    null,
            step_order:         null,
            resend_email_id:    s.id,
            resend_template_id: null,
            send_type:          'broadcast',
            broadcast_id:       row.id,
            subject:            s.item.payload.subject as string,
            sent_at:            sentAt,
          })))
          if (sendsErr) console.error(JSON.stringify({ service: 'broadcast-dispatch', broadcast_id: row.id, error: 'email_sends_insert_failed', detail: sendsErr.message }))
          sentNow += res.sent.length
        }

        if (res.failed.length > 0) {
          const attemptsByLead = new Map(pending.map(r => [r.lead_id, r.attempts]))
          await db.from('email_broadcast_recipients').upsert(
            res.failed.map(f => {
              const attempts = (attemptsByLead.get(f.leadId) ?? 0) + 1
              return {
                broadcast_id: row.id, lead_id: f.leadId, tenant_id: row.tenant_id,
                attempts, last_error: f.error.slice(0, 500),
                status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
              }
            }),
            { onConflict: 'broadcast_id,lead_id' },
          )
        }
        await sleep(PAUSE_BETWEEN_CALLS_MS)
      }

      if (rateLimited) break
      // Un lote que no avanzó no gira en el mismo proceso: los fallos
      // reintentables los retoma la próxima ejecución.
      if (sentInBatch === 0 && skipped.length === 0) break
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(JSON.stringify({ service: 'broadcast-dispatch', broadcast_id: row.id, error: 'send_loop_failed', detail: message }))
    const counts = await countRecipients(db, row.id)
    await finish(db, row.id, {
      status: 'pending', sent_count: counts.sent, skipped_count: counts.skipped, failed_count: counts.failed,
      last_error: `El envío se interrumpió y se reintentará en la próxima ejecución: ${message}`.slice(0, 500),
    })
    return { outcome: 'failed', sent: sentNow, detail: message }
  }

  // 5. Cierre con conteos reales.
  const counts = await countRecipients(db, row.id)
  const done   = counts.pending === 0
  await finish(db, row.id, {
    status:        done ? 'sent' : 'pending',
    sent_count:    counts.sent,
    skipped_count: counts.skipped,
    failed_count:  counts.failed,
    finished_at:   done ? new Date().toISOString() : null,
    last_error:    done ? null : rateLimited
      ? 'Resend limitó la velocidad de envío; se reanuda en la próxima ejecución.'
      : 'Se reanuda en la próxima ejecución.',
  })

  console.log(JSON.stringify({ service: 'broadcast-dispatch', broadcast_id: row.id, sent_now: sentNow, ...counts, done }))
  return { outcome: done ? 'sent' : 'partial', sent: sentNow }
}

/** Etapa del orquestador: los envíos vencidos y los que quedaron a medias. */
export async function dispatchDueBroadcasts(
  db: SupabaseClient,
  opts: { deadline: number },
): Promise<{ processed: number; sent: number }> {
  const nowIso   = new Date().toISOString()
  const staleIso = new Date(Date.now() - STALE_SENDING_MS).toISOString()
  const { data, error } = await db
    .from('email_broadcasts')
    .select('id')
    .or(`and(status.eq.pending,scheduled_at.lte.${nowIso}),and(status.eq.sending,started_at.lt.${staleIso})`)
    .order('scheduled_at', { ascending: true })
    .limit(20)
  if (error) {
    console.error(JSON.stringify({ service: 'broadcast-dispatch', error: error.message }))
    return { processed: 0, sent: 0 }
  }
  let processed = 0
  let sent = 0
  for (const row of (data ?? []) as { id: string }[]) {
    if (Date.now() >= opts.deadline) break
    try {
      const res = await dispatchBroadcast(db, row.id, { deadline: opts.deadline })
      processed++
      sent += res.sent
    } catch (err) {
      console.error(JSON.stringify({ service: 'broadcast-dispatch', broadcast_id: row.id, error: err instanceof Error ? err.message : String(err) }))
    }
  }
  return { processed, sent }
}
