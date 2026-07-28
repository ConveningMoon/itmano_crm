// Reductor PURO de eventos de Paddle → patch de la fila `subscriptions`.
// Sin red, sin Supabase, sin Date.now(): toda la lógica de negocio del billing
// vive aquí y se testea como unidad. El route handler solo persiste el patch.

import type { SubscriptionStatus, SubscriptionPlan } from '@/lib/subscriptions'
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
  /**
   * Solo se escribe si el evento lo trae en custom_data. Lo inyecta
   * createCheckoutTransaction, que es quien sabe con certeza qué se compró
   * (incluido Partner, cuyo precio es a medida). Sin esto, un tenant que compra
   * Growth se quedaría con el plan por defecto y recibiría cuotas de Esencial.
   */
  plan?:                   SubscriptionPlan
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
  updated_at:              string
}

// NOTA: `requested_plan` NO se toca aquí a propósito. Una solicitud sales-led la
// resuelve un humano desde el Centro de control; una renovación rutinaria de
// Paddle no debe hacerla desaparecer sin que nadie la haya atendido.

const STATUS_MAP: Record<string, SubscriptionStatus> = {
  trialing: 'active',   // trialing de Paddle = acceso completo, igual que active
  active:   'active',
  past_due: 'past_due',
  paused:   'paused',
  canceled: 'cancelled',
}

// Fail-open deliberado: ante un status crudo desconocido (Paddle agrega estados
// sin avisar) es preferible dar acceso de más que cortarle el servicio a
// alguien que paga. Ver test explícito del fallback.
export function mapPaddleStatus(paddleStatus: string): SubscriptionStatus {
  return STATUS_MAP[paddleStatus] ?? 'active'
}

const PLAN_VALUES: SubscriptionPlan[] = ['esencial', 'growth', 'partner']

/** Lee el plan de custom_data, solo si es uno de los valores válidos. */
function planFromCustomData(customData: Record<string, unknown> | null): SubscriptionPlan | undefined {
  const raw = customData?.plan
  return typeof raw === 'string' && PLAN_VALUES.includes(raw as SubscriptionPlan)
    ? (raw as SubscriptionPlan)
    : undefined
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
  // Comparación NUMÉRICA, nunca lexicográfica. Los dos lados vienen de
  // formateadores distintos: Paddle emite "2026-08-01T10:00:00.635628Z" y
  // Postgres devuelve "2026-08-01 10:00:00.635628+00" — con espacio en vez de
  // 'T'. Como texto, cualquier fecha de Paddle resulta "mayor" que cualquiera
  // de Postgres (0x54 > 0x20) y la guardia no filtraría NADA.
  const prev = current.lastEventAt ? Date.parse(current.lastEventAt) : NaN
  const now  = Date.parse(event.occurredAt)
  if (!Number.isNaN(prev) && !Number.isNaN(now) && now <= prev) return null

  const status   = mapPaddleStatus(event.status)
  const degraded = isDegraded(status)
  const plan     = planFromCustomData(event.customData)

  // degraded_at ancla los plazos de 14 y 60 días: se fija en la ENTRADA al modo
  // degradado y no se toca mientras siga degradado, para que los plazos no se
  // reinicien con cada evento. Solo un `active` real limpia el ancla —
  // `past_due` no es degradado (isDegraded lo excluye) pero tampoco es una
  // vuelta al buen estado: es un reintento de cobro en curso, así que si ya
  // estábamos degradados el ancla se conserva en vez de reiniciarse.
  const degradedAt = degraded
    ? (current.degradedAt ?? event.occurredAt)
    : (status === 'active' ? null : current.degradedAt)

  return {
    status,
    ...(plan ? { plan } : {}),
    billing_cycle:          event.billingCycle,
    paddle_customer_id:     event.customerId,
    paddle_subscription_id: event.subscriptionId,
    paddle_price_id:        event.priceId,
    current_period_end:     event.currentPeriodEnd,
    cancel_at:              event.cancelAt,
    degraded_at:            degradedAt,
    last_event_at:          event.occurredAt,
    trial_ends_at:          null,
    updated_at:             event.occurredAt,
  }
}
