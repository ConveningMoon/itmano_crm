import { NextRequest, NextResponse } from 'next/server'
import { getPaddle } from '@/lib/paddle/env'
import { applySubscriptionEvent } from '@/lib/paddle/persist'
import type { PaddleSubscriptionEvent } from '@/lib/paddle/reducer'
import type { BillingCycle } from '@/lib/paddle/env'
import { createAdminClient } from '@/lib/supabase/admin'

// Webhook de Paddle Billing. Cuatro reglas no negociables (spec §5):
//   1. Body CRUDO — cualquier parseo previo invalida la firma HMAC.
//   2. Verificar antes de confiar — unmarshal valida firma y ventana de replay.
//   3. Idempotencia por event_id — Paddle garantiza entrega at-least-once.
//   4. Orden — el reductor descarta eventos anteriores al último aplicado.

const HANDLED = new Set([
  'subscription.created',
  'subscription.updated',
  'subscription.canceled',
])

export async function POST(request: NextRequest) {
  const signature = request.headers.get('paddle-signature') ?? ''
  const secret    = process.env.PADDLE_NOTIFICATION_WEBHOOK_SECRET

  if (!secret) {
    console.error(JSON.stringify({ service: 'paddle-webhook', error: 'missing_secret' }))
    return NextResponse.json({ error: 'not configured' }, { status: 500 })
  }

  // Regla 1: el cuerpo tal cual llegó.
  const raw = await request.text()

  // Regla 2: verificar antes de confiar.
  let event
  try {
    event = await getPaddle().webhooks.unmarshal(raw, secret, signature)
  } catch {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }
  if (!event) return NextResponse.json({ error: 'invalid payload' }, { status: 400 })

  const supabase = createAdminClient()

  // Regla 3: el event_id es PK. Si ya existe, este evento ya se procesó.
  const { error: dupError } = await supabase.from('paddle_webhook_events').insert({
    event_id:    event.eventId,
    event_type:  event.eventType,
    occurred_at: event.occurredAt,
    payload:     JSON.parse(raw),
  })
  if (dupError) {
    // 23505 = unique_violation. Reentrega: responder 200 para que Paddle pare.
    if (dupError.code === '23505') return NextResponse.json({ ok: true, duplicate: true })
    console.error(JSON.stringify({ service: 'paddle-webhook', error: dupError.message }))
    return NextResponse.json({ error: 'storage failed' }, { status: 500 })
  }

  if (!HANDLED.has(event.eventType)) return NextResponse.json({ ok: true, ignored: true })

  // El SDK tipa `event.data` distinto por cada variante del enorme union
  // `EventEntity` (una por cada uno de los ~50 tipos de evento de Paddle); acceder
  // a campos de suscripción sobre ese union exige `any`. Confirmado contra
  // node_modules/@paddle/paddle-node-sdk/dist/types/notifications/entities/subscription/
  // que subscription.created|updated|canceled comparten esta forma real:
  //   id, status, customerId, items[].price.id, billingCycle.interval,
  //   currentBillingPeriod.endsAt, scheduledChange.{action,effectiveAt}, customData.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = event.data as any
  const normalized: PaddleSubscriptionEvent = {
    eventId:          event.eventId,
    eventType:        event.eventType,
    occurredAt:       event.occurredAt,
    subscriptionId:   d.id,
    customerId:       d.customerId,
    status:           d.status,
    priceId:          d.items?.[0]?.price?.id ?? null,
    billingCycle:     (d.billingCycle?.interval as BillingCycle | undefined) ?? null,
    currentPeriodEnd: d.currentBillingPeriod?.endsAt ?? null,
    cancelAt:         d.scheduledChange?.action === 'cancel' ? (d.scheduledChange.effectiveAt ?? null) : null,
    customData:       (d.customData as Record<string, unknown> | null) ?? null,
  }

  try {
    const result = await applySubscriptionEvent(normalized)
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    console.error(JSON.stringify({
      service: 'paddle-webhook', event_id: event.eventId,
      error: err instanceof Error ? err.message : String(err),
    }))
    // 500 para que Paddle reintente.
    return NextResponse.json({ error: 'processing failed' }, { status: 500 })
  }
}
