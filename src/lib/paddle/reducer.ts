// Reductor PURO de eventos de Paddle → patch de la fila `subscriptions`.
// Sin red, sin Supabase, sin Date.now(): toda la lógica de negocio del billing
// vive aquí y se testea como unidad. El route handler solo persiste el patch.

import type { SubscriptionStatus } from '@/lib/subscriptions'
import type { BillingCycle } from '@/lib/paddle/env'

export interface PaddleSubscriptionEvent {
  eventId:          string
  eventType:        string
  occurredAt:       string
  subscriptionId:   string
  customerId:       string
  /** Estado crudo de Paddle: trialing | active | past_due | paused | canceled */
  status:           string
  priceId:          string | null
  billingCycle:     BillingCycle | null
  currentPeriodEnd: string | null
  /** Cancelación agendada a fin de período. */
  cancelAt:         string | null
  customData:       Record<string, unknown> | null
}

export interface SubscriptionSnapshot {
  status:      SubscriptionStatus
  lastEventAt: string | null
  degradedAt:  string | null
}

export interface SubscriptionPatch {
  status:                  SubscriptionStatus
  billing_cycle:           BillingCycle | null
  paddle_customer_id:      string
  paddle_subscription_id:  string
  paddle_price_id:         string | null
  current_period_end:      string | null
  cancel_at:               string | null
  degraded_at:             string | null
  last_event_at:           string
  /** Al empezar a pagar el trial deja de existir. */
  trial_ends_at:           null
  /** Un pago resuelve cualquier solicitud sales-led pendiente. */
  requested_plan:          null
  updated_at:              string
}

const STATUS_MAP: Record<string, SubscriptionStatus> = {
  trialing: 'active',   // trialing de Paddle = acceso completo, igual que active
  active:   'active',
  past_due: 'past_due',
  paused:   'paused',
  canceled: 'cancelled',
}

export function mapPaddleStatus(paddleStatus: string): SubscriptionStatus {
  return STATUS_MAP[paddleStatus] ?? 'active'
}

/**
 * Estados que activan el modo degradado. `past_due` NO está: un fallo de tarjeta
 * no es un impago — Paddle Retain hace el dunning primero (spec §10.4).
 */
export function isDegraded(status: SubscriptionStatus): boolean {
  return status === 'paused' || status === 'cancelled'
}

/**
 * Traduce un evento a un patch, o devuelve null si el evento es viejo.
 *
 * Paddle no garantiza el orden de entrega, así que un evento con `occurredAt`
 * anterior o igual al último aplicado se descarta: aplicarlo revertiría el
 * estado a uno ya superado.
 */
export function reduceSubscriptionEvent(
  event: PaddleSubscriptionEvent,
  current: SubscriptionSnapshot,
): SubscriptionPatch | null {
  if (current.lastEventAt && event.occurredAt <= current.lastEventAt) return null

  const status   = mapPaddleStatus(event.status)
  const degraded = isDegraded(status)

  // degraded_at ancla los plazos de 14 y 60 días: se fija en la ENTRADA al modo
  // degradado y no se toca mientras siga degradado, para que los plazos no se
  // reinicien con cada evento. Se limpia al reactivar.
  const degradedAt = degraded
    ? (current.degradedAt ?? event.occurredAt)
    : null

  return {
    status,
    billing_cycle:          event.billingCycle,
    paddle_customer_id:     event.customerId,
    paddle_subscription_id: event.subscriptionId,
    paddle_price_id:        event.priceId,
    current_period_end:     event.currentPeriodEnd,
    cancel_at:              event.cancelAt,
    degraded_at:            degradedAt,
    last_event_at:          event.occurredAt,
    trial_ends_at:          null,
    requested_plan:         null,
    updated_at:             event.occurredAt,
  }
}
