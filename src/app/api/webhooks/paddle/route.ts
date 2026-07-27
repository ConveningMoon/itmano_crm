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

// Se manejan TODOS los eventos de suscripción, no solo created/updated/canceled.
// La doc de Paddle dice que subscription.updated "may also occur immediately
// after a dedicated lifecycle event" — "puede", no "siempre". Apostar a esa
// palabra dejaría el modo degradado inerte si Paddle no emitiera el updated tras
// un past_due o un paused. Manejar los dedicados no cuesta nada: todos llevan la
// misma entidad Subscription (confirmado en el SDK — SubscriptionActivatedEvent,
// SubscriptionTrialingEvent, SubscriptionPastDueEvent, SubscriptionPausedEvent y
// SubscriptionResumedEvent tipan `data` como SubscriptionNotification, igual que
// updated/canceled), el reductor decide por `status`, y los duplicados los
// absorben la PK de event_id y la guardia de orden.
const HANDLED = new Set([
  'subscription.created',
  'subscription.updated',
  'subscription.activated',
  'subscription.trialing',
  'subscription.past_due',
  'subscription.paused',
  'subscription.resumed',
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
  } catch (err) {
    // Sin este log, un secreto mal pegado en Vercel es invisible — el 401 no
    // deja rastro alguno. Será lo primero que se mire el día del go-live.
    console.error(JSON.stringify({
      service: 'paddle-webhook', error: 'invalid_signature',
      detail: err instanceof Error ? err.message : String(err),
    }))
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
    if (dupError.code !== '23505') { // 23505 = unique_violation
      console.error(JSON.stringify({ service: 'paddle-webhook', error: dupError.message }))
      return NextResponse.json({ error: 'storage failed' }, { status: 500 })
    }
    // Ya existe la fila — pero eso NO significa que el evento se aplicara. Si un
    // intento anterior insertó la fila y luego murió aplicando el patch,
    // `processed_at` sigue en NULL y hay que reintentar: darlo por duplicado
    // sellaría el evento sin efecto PARA SIEMPRE, porque el reintento de Paddle
    // (o el botón "replay" del dashboard) volvería a chocar con la misma PK.
    // Reprocesar es seguro: si el intento anterior sí escribió, el reductor lo
    // descarta por `occurred_at`.
    const { data: prev, error: prevError } = await supabase
      .from('paddle_webhook_events')
      .select('processed_at')
      .eq('event_id', event.eventId)
      .maybeSingle()
    if (prevError) {
      console.error(JSON.stringify({ service: 'paddle-webhook', error: prevError.message }))
      return NextResponse.json({ error: 'storage failed' }, { status: 500 })
    }
    if (prev?.processed_at) return NextResponse.json({ ok: true, duplicate: true })
    // processed_at es NULL: cae al procesamiento de abajo en vez de responder aquí.
  }

  if (!HANDLED.has(event.eventType)) return NextResponse.json({ ok: true, ignored: true })

  // El SDK tipa `event.data` distinto por cada variante del enorme union
  // `EventEntity` (una por cada uno de los ~50 tipos de evento de Paddle); acceder
  // a campos de suscripción sobre ese union exige `any`. Confirmado contra
  // node_modules/@paddle/paddle-node-sdk/dist/types/notifications/entities/subscription/
  // que los 8 eventos de HANDLED comparten esta forma real (created usa
  // SubscriptionCreatedNotification, los otros 7 usan SubscriptionNotification —
  // idénticas en los campos que leemos):
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
