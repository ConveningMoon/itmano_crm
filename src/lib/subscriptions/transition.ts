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
