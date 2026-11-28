import { isDegraded } from '@/lib/paddle/reducer'
import type { SubscriptionStatus } from '@/lib/subscriptions'

export interface TransitionSide {
  status: SubscriptionStatus
  trialEndsAt?: string | null
}

// Una prueba vencida pero aún sin marcar 'expired' (el cron corre una vez al
// día) ya cuenta como degradada: coincide con getTenantAccess.
function effectivelyDegraded(side: TransitionSide, now: Date): boolean {
  if (isDegraded(side.status)) return true
  return side.status === 'trial' && !!side.trialEndsAt && new Date(side.trialEndsAt).getTime() < now.getTime()
}

/**
 * Transición de modo degradado de un cambio manual de estado: 'enter' fija
 * degraded_at, 'leave' lo limpia y restaura; null si no cambia de lado.
 */
export function degradedTransition(
  prev: TransitionSide,
  next: TransitionSide,
  now: Date = new Date(),
): 'enter' | 'leave' | null {
  const before = effectivelyDegraded(prev, now)
  const after = effectivelyDegraded(next, now)
  if (!before && after) return 'enter'
  if (before && !after) return 'leave'
  return null
}

/**
 * Valor de degraded_at a escribir en un cambio manual: undefined = no tocar.
 * 'leave' lo limpia. Si el estado nuevo es degradado y no hay ancla guardada
 * (o se acaba de entrar), la ancla es el vencimiento de la prueba previa si ya
 * pasó, o ahora: así nunca queda un estado degradado sin degraded_at.
 */
export function manualDegradedAt(args: {
  transition: 'enter' | 'leave' | null
  nextStatus: SubscriptionStatus
  storedDegradedAt: string | null
  prev: { status: SubscriptionStatus; trialEndsAt: string | null } | null
  now: Date
}): string | null | undefined {
  const { transition, nextStatus, storedDegradedAt, prev, now } = args
  if (transition === 'leave') return null
  if (!isDegraded(nextStatus)) return undefined
  if (storedDegradedAt && transition !== 'enter') return undefined
  const pastTrialEnd = prev?.status === 'trial' && prev.trialEndsAt
    && new Date(prev.trialEndsAt).getTime() < now.getTime()
  return pastTrialEnd ? prev!.trialEndsAt! : now.toISOString()
}

/** trial_ends_at al marcar 'expired' a mano: el previo, sin pasar de ahora (nunca una fecha futura). */
export function expiredTrialEndsAt(previous: string | null | undefined, now: Date): string {
  if (previous && new Date(previous).getTime() < now.getTime()) return previous
  return now.toISOString()
}
