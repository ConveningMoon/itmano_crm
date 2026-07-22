import { Webhook } from 'svix'
import { NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { resend } from '@/lib/resend'
import { stripQuotedReply } from '@/lib/email/strip-quoted-reply'
import { assessLeadFit } from '@/lib/services/ai-lead-fit'

// Transactional email events Resend fires for our sends.
// email.unsubscribed does NOT exist for transactional emails (only for Audiences).
// Unsubscribe handling is a separate /api/unsubscribe endpoint (future PR).
const RESEND_EMAIL_EVENTS = [
  'email.sent',
  'email.delivered',
  'email.opened',
  'email.clicked',
  'email.bounced',
  'email.complained',
  'email.failed',
  'email.suppressed',
  'email.received',
] as const

// Maps Resend event types → internal lead_events.type values.
// email.bounced    → email_hard_bounce   (matches existing lead_score_rules row, -30)
// email.complained → email_spam_complaint (matches existing rule, -100, side_effect=force_perdido)
// email.received   → email_replied       (inbound = reply; reuses +30 rule)
// email.sent       → no-op (delivery tracking lives in email_sends.sent_at)
const OUTBOUND_TYPE_MAP: Partial<Record<typeof RESEND_EMAIL_EVENTS[number], string>> = {
  'email.delivered':  'email_delivered',
  'email.opened':     'email_opened',
  'email.clicked':    'email_clicked',
  'email.bounced':    'email_hard_bounce',
  'email.complained': 'email_spam_complaint',
  'email.failed':     'email_failed',
  'email.suppressed': 'email_suppressed',
}

// Human-readable descriptions for lead_events.description (NOT NULL column).
const EVENT_DESCRIPTIONS: Record<string, string> = {
  email_delivered:      'Email delivered via Resend',
  email_opened:         'Email opened via Resend',
  email_clicked:        'Email link clicked via Resend',
  email_hard_bounce:    'Email hard bounced via Resend',
  email_spam_complaint: 'Spam complaint received via Resend',
  email_failed:         'Email delivery failed via Resend',
  email_suppressed:     'Email suppressed by Resend',
  email_replied:        'Inbound email received (reply)',
}

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const ResendEventDataSchema = z.object({
  email_id: z.string().optional(),
  from:     z.string().optional(),
  to:       z.array(z.string()).optional(),
  subject:  z.string().optional(),
  // NOTE: email.received webhook payloads do NOT include body content.
  // text/html must be fetched via resend.emails.receiving.get(email_id).
  click:    z.object({ link: z.string() }).optional(),
  bounce:   z.object({ message: z.string() }).optional(),
}).passthrough()

const ResendEventSchema = z.object({
  type:       z.enum(RESEND_EMAIL_EVENTS),
  created_at: z.string(),
  data:       ResendEventDataSchema,
}).passthrough()

type ResendEvent = z.infer<typeof ResendEventSchema>

// ─── Logging ─────────────────────────────────────────────────────────────────

type LogResult =
  | 'inserted'
  | 'duplicate'
  | 'unknown_email'
  | 'no_lead_match'
  | 'ambiguous_inbound'
  | 'no_op'
  | 'validation_error'

function log(fields: {
  event_type: string
  event_id: string
  resend_email_id?: string | null
  lead_id?: string | null
  result: LogResult
}) {
  console.log(JSON.stringify({ service: 'resend-webhook', ...fields }))
}

// Inbound `from` may arrive as "Name <email@x.com>" or a bare address.
// Extract the bare email and lowercase it to match leads.email (which the
// intake route stores lowercased). Without this, replies never match a lead.
function extractEmail(raw: string): string {
  const m = raw.match(/<([^>]+)>/)
  return (m ? m[1] : raw).trim().toLowerCase()
}

// Convert HTML to plain text for storage — XSS prevention.
// Rules: block elements (<p><div><br><li>) become \n, all other tags stripped.
// Called only when the Resend API returns html but no text part.
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|tr|h[1-6]|blockquote)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ─── Outbound event handler ───────────────────────────────────────────────────
// Handles the 7 outbound event types. Looks up email_sends by resend_email_id,
// then inserts a lead_events row so the scoring trigger can process it.

async function handleOutboundEvent(
  db: ReturnType<typeof createAdminClient>,
  event: ResendEvent,
  svixId: string,
  internalType: string,
) {
  const emailId = event.data.email_id

  // email_id should always be present for outbound events, but guard anyway.
  if (!emailId) {
    log({ event_type: event.type, event_id: svixId, result: 'validation_error' })
    return
  }

  // Resolve lead from email_sends. The webhook has no direct lead context —
  // email_sends is the join table between Resend IDs and CRM lead IDs.
  const { data: send, error: lookupError } = await db
    .from('email_sends')
    .select('lead_id, tenant_id')
    .eq('resend_email_id', emailId)
    .maybeSingle()

  if (lookupError) throw lookupError

  if (!send) {
    // Legitimate: events can arrive before email_sends is populated if there's
    // a race between the send cron and Resend's webhook delivery.
    log({ event_type: event.type, event_id: svixId, resend_email_id: emailId, result: 'unknown_email' })
    return
  }

  const metadata: Record<string, unknown> = { resend_email_id: emailId }
  if (event.data.subject)        metadata.subject = event.data.subject
  if (event.data.click?.link)    metadata.click_url = event.data.click.link
  if (event.data.bounce?.message) metadata.bounce_message = event.data.bounce.message

  const { error: insertError } = await db.from('lead_events').insert({
    lead_id:     send.lead_id,
    tenant_id:   send.tenant_id,
    type:        internalType,
    description: EVENT_DESCRIPTIONS[internalType] ?? `Resend event: ${event.type}`,
    dedup_key:   svixId,
    created_at:  event.created_at,
    metadata,
  })

  if (insertError) {
    // 23505 = unique_violation — dedup constraint fired, duplicate delivery.
    if (insertError.code === '23505') {
      log({ event_type: event.type, event_id: svixId, resend_email_id: emailId, lead_id: send.lead_id, result: 'duplicate' })
      return
    }
    throw insertError
  }

  log({ event_type: event.type, event_id: svixId, resend_email_id: emailId, lead_id: send.lead_id, result: 'inserted' })

  // Set email_blocked flag for delivery-blocking events. Best-effort — a failure
  // here must not affect the webhook's 200 (the lead_event is already committed).
  // Independent of the scoring recompute triggered by trg_lead_event_scoring.
  const blockReason =
    internalType === 'email_hard_bounce'   ? 'hard_bounce'    :
    internalType === 'email_spam_complaint' ? 'spam_complaint' :
    null
  if (blockReason) {
    try {
      await db
        .from('leads')
        .update({ email_blocked: true, email_blocked_reason: blockReason })
        .eq('id', send.lead_id)
    } catch (blockErr) {
      console.error(JSON.stringify({
        service:  'resend-webhook',
        event_id: svixId,
        lead_id:  send.lead_id,
        error:    'block_flag_set_failed',
        detail:   String(blockErr),
      }))
    }
  }
}

// ─── Inbound event handler ────────────────────────────────────────────────────
// email.received = someone replied to one of our sequences. Resolve the lead by
// the sender's email address and insert an email_replied event (+30 points).
//
// Multi-tenant routing: the reply's `to` address is OUR sending address, so it
// identifies the tenant — se compara contra tenants.email_from_address (cada
// tenant tiene una dirección única, sea de su dominio propio Growth/Partner o
// de un slug del dominio compartido de ITMANO en Esencial). Con tenant
// resuelto, la búsqueda del lead queda scoped y la ambigüedad entre tenants
// (mismo email de lead en dos equipos) desaparece: leads es único por
// (tenant_id, email). Si el `to` no matchea ningún tenant (config vieja,
// forward raro), cae al comportamiento global anterior: match único o skip.

// Resuelve el tenant dueño de la dirección destino del inbound. tenants es una
// tabla chica — se trae completa y se normaliza en proceso porque
// email_from_address puede estar guardado como "Nombre <email@dominio>".
async function resolveTenantByToAddress(
  db: ReturnType<typeof createAdminClient>,
  toRaw: string[] | undefined,
): Promise<string | null> {
  if (!toRaw || toRaw.length === 0) return null
  const toAddresses = new Set(toRaw.map(extractEmail))

  const { data: tenants, error } = await db
    .from('tenants')
    .select('id, email_from_address')
  if (error) throw error

  const matches = ((tenants ?? []) as { id: string; email_from_address: string | null }[])
    .filter(t => t.email_from_address && toAddresses.has(extractEmail(t.email_from_address)))

  return matches.length === 1 ? matches[0].id : null
}

async function handleInboundEvent(
  db: ReturnType<typeof createAdminClient>,
  event: ResendEvent,
  svixId: string,
) {
  const fromRaw = event.data.from

  if (!fromRaw) {
    log({ event_type: event.type, event_id: svixId, result: 'validation_error' })
    return
  }

  // Normalize "Name <email>" → "email" (lowercased) so the lookup matches leads.email
  const fromAddress = extractEmail(fromRaw)

  const tenantId = await resolveTenantByToAddress(db, event.data.to)

  let leadQuery = db
    .from('leads')
    .select('id, tenant_id, agent_id')
    .eq('email', fromAddress)
  if (tenantId) leadQuery = leadQuery.eq('tenant_id', tenantId)

  const { data: matches, error: lookupError } = await leadQuery

  if (lookupError) throw lookupError

  if (!matches || matches.length === 0) {
    log({ event_type: event.type, event_id: svixId, result: 'no_lead_match' })
    return
  }

  if (matches.length > 1) {
    // Ambiguous: same email in multiple tenants. Log for ops visibility.
    console.log(JSON.stringify({
      service:      'resend-webhook',
      event_type:   event.type,
      event_id:     svixId,
      from_address: fromAddress,
      match_count:  matches.length,
      result:       'ambiguous_inbound',
    }))
    return
  }

  const match = matches[0]

  const { error: insertError } = await db.from('lead_events').insert({
    lead_id:     match.id,
    tenant_id:   match.tenant_id,
    type:        'email_replied',
    description: EVENT_DESCRIPTIONS['email_replied'],
    dedup_key:   svixId,
    created_at:  event.created_at,
    metadata:    { from: fromAddress, from_raw: fromRaw, subject: event.data.subject ?? null },
  })

  if (insertError) {
    if (insertError.code === '23505') {
      log({ event_type: event.type, event_id: svixId, lead_id: match.id, result: 'duplicate' })
      return
    }
    throw insertError
  }

  log({ event_type: event.type, event_id: svixId, lead_id: match.id, result: 'inserted' })

  // Reanaliza el fit del lead con IA (si el tenant lo tiene activado): una
  // respuesta agrega información. Fire-and-forget; el servicio verifica el gate.
  after(() => assessLeadFit({ leadId: match.id, tenantId: match.tenant_id, reason: 'email_reply' }))

  // Fetch the full email body via the Resend API.
  // The email.received webhook carries metadata only (from/to/subject/email_id)
  // — body content is never included in the webhook payload (Resend design).
  // We must call resend.emails.receiving.get(email_id) to retrieve text/html.
  // Best-effort: a failure here must not block the webhook's 200 or the
  // lead_event already committed above.
  let bodyText: string | null = null
  const inboundEmailId = event.data.email_id
  if (inboundEmailId) {
    try {
      const { data: received, error: fetchErr } = await resend.emails.receiving.get(inboundEmailId)
      if (fetchErr) {
        console.error(JSON.stringify({
          service:  'resend-webhook',
          event_id: svixId,
          lead_id:  match.id,
          error:    'receiving_get_failed',
          detail:   String(fetchErr),
        }))
      } else if (received) {
        const raw = received.text
          ? received.text.trim()
          : received.html
            ? htmlToText(received.html)
            : null
        // Strip the quoted/forwarded block — store only what the lead wrote.
        bodyText = raw ? (stripQuotedReply(raw) || null) : null
      }
    } catch (fetchEx) {
      console.error(JSON.stringify({
        service:  'resend-webhook',
        event_id: svixId,
        lead_id:  match.id,
        error:    'receiving_get_exception',
        detail:   String(fetchEx),
      }))
    }
  }

  // ── Persist full reply in lead_email_replies ──────────────────────────────
  // Best-effort: a failure here must not block the webhook's 200.
  // Idempotent via the (lead_id, provider_message_id) unique index — re-delivery
  // of the same svix-id is silently ignored (23505).
  try {
    await db.from('lead_email_replies').insert({
      tenant_id:           match.tenant_id,
      lead_id:             match.id,
      from_email:          fromAddress,
      subject:             event.data.subject ?? null,
      body_text:           bodyText,
      received_at:         event.created_at,
      provider_message_id: svixId,
    })
  } catch (replyErr) {
    // 23505 = duplicate delivery — idempotent, ignore
    const code = (replyErr as { code?: string })?.code
    if (code !== '23505') {
      console.error(JSON.stringify({
        service:  'resend-webhook',
        event_id: svixId,
        lead_id:  match.id,
        error:    'reply_insert_failed',
        detail:   String(replyErr),
      }))
    }
  }

  // ── Notification → Telegram ───────────────────────────────────────────────
  // Best-effort: insert an email_replied notification so the pg_net trigger
  // dispatches a Telegram message to the tenant owner.
  try {
    const subj    = event.data.subject
    const SNIPPET = 200
    const snippet = bodyText ? bodyText.slice(0, SNIPPET) : null
    const parts: string[] = []
    if (subj)    parts.push(`Asunto: "${subj}"`)
    if (snippet) parts.push(`"${snippet}${bodyText && bodyText.length > SNIPPET ? '…' : ''}"`)

    await db.from('notifications').insert({
      tenant_id: match.tenant_id,
      type:      'email_replied',
      lead_id:   match.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      agent_id:  (match as any).agent_id ?? null,
      message:   parts.join('\n') || 'Sin contenido',
    })
  } catch (notifErr) {
    console.error(JSON.stringify({
      service:   'resend-webhook',
      event_id:  svixId,
      lead_id:   match.id,
      error:     'notification_insert_failed',
      detail:    String(notifErr),
    }))
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET is not configured')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  // Svix requires the raw body bytes — do NOT use request.json()
  const rawBody = await request.text()

  const svixId        = request.headers.get('svix-id')
  const svixTimestamp = request.headers.get('svix-timestamp')
  const svixSignature = request.headers.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing Svix headers' }, { status: 401 })
  }

  let rawEvent: unknown
  try {
    const wh = new Webhook(secret)
    rawEvent = wh.verify(rawBody, {
      'svix-id':        svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    })
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Validate shape — return 200 on failure to prevent infinite Resend retries.
  const parsed = ResendEventSchema.safeParse(rawEvent)
  if (!parsed.success) {
    console.log(JSON.stringify({
      service:    'resend-webhook',
      event_id:   svixId,
      result:     'validation_error',
      zod_errors: parsed.error.flatten(),
    }))
    return NextResponse.json({ received: true })
  }

  const event = parsed.data

  try {
    const db = createAdminClient()
    const internalType = OUTBOUND_TYPE_MAP[event.type]

    if (internalType) {
      await handleOutboundEvent(db, event, svixId, internalType)
    } else if (event.type === 'email.received') {
      await handleInboundEvent(db, event, svixId)
    } else {
      // email.sent — delivery tracking lives in email_sends.sent_at, no lead_event needed.
      log({ event_type: event.type, event_id: svixId, result: 'no_op' })
    }
  } catch (err) {
    // Genuine infrastructure error — return 500 so Resend retries.
    console.error(JSON.stringify({ service: 'resend-webhook', event_id: svixId, event_type: event.type, error: String(err) }))
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
