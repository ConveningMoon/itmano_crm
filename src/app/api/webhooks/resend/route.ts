import { Webhook } from 'svix'
import { NextRequest, NextResponse } from 'next/server'

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

type ResendEmailEvent = { type: typeof RESEND_EMAIL_EVENTS[number]; [key: string]: unknown }

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

  let event: unknown
  try {
    const wh = new Webhook(secret)
    event = wh.verify(rawBody, {
      'svix-id':        svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    })
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Phase 3 PR 1: log only — event writes to lead_events in the next PR
  const { type } = event as ResendEmailEvent
  console.log(`[resend-webhook] ${type}`, JSON.stringify(event, null, 2))

  return NextResponse.json({ received: true })
}
