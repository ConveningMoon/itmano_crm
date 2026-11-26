// Reglas del autoservicio de facturación (fase 5 del plan SaaS). PURO: decide
// qué puede hacer el cliente solo con su suscripción de Paddle y con qué
// mensaje se le dice que no. Lo usan las Server Actions, la tarjeta de
// Suscripción y test:unit.

import type { SubscriptionPlan, SubscriptionStatus } from '@/lib/subscriptions'
import type { Cycle } from '@/lib/paddle/items'

export interface BillingRow {
  plan:                   SubscriptionPlan
  status:                 SubscriptionStatus
  billingExempt:          boolean
  billingCycle:           Cycle | null
  paddleSubscriptionId:   string | null
  cancelAt:               string | null
  /** Precio negociado vigente (Partner por trato), si lo hay. */
  negotiatedPriceId:      string | null
}

export const SELF_SERVICE_MESSAGES = {
  exempt:      'Tu plan lo gestiona directamente el equipo ITMANO. Escríbenos para cualquier cambio.',
  noPaddle:    'Todavía no tienes una suscripción de pago. Elige un plan con "Pagar ahora".',
  pastDue:     'Tu último pago no se pudo cobrar. Actualiza tu método de pago en "Gestionar tarjeta y facturas" antes de cambiar de plan.',
  notActive:   'Tu suscripción no está activa. Elige un plan con "Pagar ahora" para volver.',
  negotiated:  'Tu plan Partner tiene una inversión acordada con ITMANO. Escríbenos para cambiarla.',
  samePlan:    'Ya tienes ese plan con ese ciclo de facturación.',
  cancelling:  'Tu suscripción tiene una cancelación programada. Reactívala antes de cambiar de plan.',
  notCancelling: 'Tu suscripción no tiene una cancelación programada.',
  alreadyCancelling: 'La cancelación ya está programada.',
  notPaused:   'Tu suscripción no está en pausa.',
} as const

/** Puede gestionarse en autoservicio: tiene suscripción viva en Paddle y no es un trato aparte. */
function liveSubscriptionBlock(row: BillingRow): string | null {
  if (row.billingExempt) return SELF_SERVICE_MESSAGES.exempt
  if (!row.paddleSubscriptionId) return SELF_SERVICE_MESSAGES.noPaddle
  if (row.status === 'past_due') return SELF_SERVICE_MESSAGES.pastDue
  if (row.status !== 'active') return SELF_SERVICE_MESSAGES.notActive
  return null
}

/** Motivo por el que no puede cambiar a `plan`/`cycle`, o null si puede. */
export function planChangeBlock(row: BillingRow, plan: SubscriptionPlan, cycle: Cycle): string | null {
  const live = liveSubscriptionBlock(row)
  if (live) return live
  if (row.negotiatedPriceId) return SELF_SERVICE_MESSAGES.negotiated
  if (row.cancelAt) return SELF_SERVICE_MESSAGES.cancelling
  if (row.plan === plan && row.billingCycle === cycle) return SELF_SERVICE_MESSAGES.samePlan
  return null
}

export function cancelBlock(row: BillingRow): string | null {
  // past_due también puede cancelar: no tiene por qué arreglar la tarjeta para irse.
  if (row.billingExempt) return SELF_SERVICE_MESSAGES.exempt
  if (!row.paddleSubscriptionId) return SELF_SERVICE_MESSAGES.noPaddle
  if (row.status !== 'active' && row.status !== 'past_due') return SELF_SERVICE_MESSAGES.notActive
  if (row.cancelAt) return SELF_SERVICE_MESSAGES.alreadyCancelling
  return null
}

export function resumeBlock(row: BillingRow): string | null {
  if (row.billingExempt) return SELF_SERVICE_MESSAGES.exempt
  if (!row.paddleSubscriptionId) return SELF_SERVICE_MESSAGES.noPaddle
  if (!row.cancelAt) return SELF_SERVICE_MESSAGES.notCancelling
  return null
}

/** Reanudar una suscripción pausada en Paddle (no la cancelación programada: esa es resumeBlock). */
export function resumePausedBlock(row: BillingRow): string | null {
  if (row.billingExempt) return SELF_SERVICE_MESSAGES.exempt
  if (!row.paddleSubscriptionId) return SELF_SERVICE_MESSAGES.noPaddle
  if (row.status !== 'paused') return SELF_SERVICE_MESSAGES.notPaused
  return null
}

/**
 * Qué ofrece la tarjeta de Suscripción:
 *   · self_service: suscripción viva en Paddle → cambiar, cancelar, reactivar.
 *   · paused: pausada en Paddle → sólo reanudarla (un checkout nuevo crearía
 *     una segunda suscripción) y el portal para cambiar la tarjeta.
 *   · request: exentos, Partner acordado o sin Paddle → solicitud a ITMANO.
 */
export function billingMode(row: BillingRow): 'self_service' | 'paused' | 'request' {
  if (row.billingExempt || row.negotiatedPriceId) return 'request'
  if (!row.paddleSubscriptionId) return 'request'
  if (row.status === 'active' || row.status === 'past_due') return 'self_service'
  if (row.status === 'paused') return 'paused'
  return 'request'
}
