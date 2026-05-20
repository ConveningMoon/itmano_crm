import { Webhook } from 'svix'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'

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
}

// ─── Inbound event handler ────────────────────────────────────────────────────
// email.received = someone replied to one of our sequences. Resolve the lead by
// the sender's email address and insert an email_replied event (+30 points).
//
// Multi-tenant note: if two tenants have a lead with the same email address,
// we skip rather than guess. At one active tenant this never fires. A per-tenant
// inbound mailbox strategy is deferred to Phase 4/5.

async function handleInboundEvent(
  db: ReturnType<typeof createAdminClient>,
  event: ResendEvent,
  svixId: string,
) {
  const fromAddress = event.data.from

  if (!fromAddress) {
    log({ event_type: event.type, event_id: svixId, result: 'validation_error' })
    return
  }

  const { data: matches, error: lookupError } = await db
    .from('leads')
    .select('id, tenant_id')
    .eq('email', fromAddress)

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
    metadata:    { from: fromAddress, subject: event.data.subject ?? null },
  })

  if (insertError) {
    if (insertError.code === '23505') {
      log({ event_type: event.type, event_id: svixId, lead_id: match.id, result: 'duplicate' })
      return
    }
    throw insertError
  }

  log({ event_type: event.type, event_id: svixId, lead_id: match.id, result: 'inserted' })
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
