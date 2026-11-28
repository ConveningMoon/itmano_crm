import type { SubscriptionStatus } from '@/lib/subscriptions'

/**
 * Una prueba (o prueba vencida) sale de ese estado sólo por el checkout de
 * Paddle o por el super_admin, nunca por una solicitud comercial: la solicitud
 * borraría el ancla de la prueba y daría acceso completo indefinido.
 */
export function canRequestPlanChange(status: SubscriptionStatus | string | null | undefined): boolean {
  return status !== 'trial' && status !== 'expired'
}

export const REQUEST_BLOCKED_MESSAGE =
  'Tu equipo está en período de prueba o ya terminó. Activa tu plan con pago desde Configuración para continuar.'
