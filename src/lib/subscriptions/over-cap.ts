import { PLANS } from '@/lib/plans'
import { GRACE_DAYS } from '@/lib/subscriptions/access'
import type { SubscriptionPlan } from '@/lib/subscriptions'

// Propiedades publicadas por encima del tope del plan (bajada de plan, o un
// Esencial que ya tenía publicadas al desplegar). Lógica pura: el cron decide
// con `selectOverCapAction` y la reactivación usa `planPublishCap`.

/** Tope de propiedades publicadas del plan. null = ilimitado; Esencial = 0. */
export function planPublishCap(plan: SubscriptionPlan): number | null {
  const web = PLANS[plan].limits.webProperties
  if (web === 'unlimited') return null
  return web ?? 0
}

export type OverCapAction = 'mark' | 'clear' | 'wait' | 'unpublish' | 'none'

/**
 * Qué hacer con un tenant según sus publicadas y desde cuándo está sobre el
 * tope: fijar `over_cap_since` ('mark'), limpiarlo ('clear'), esperar la gracia
 * ('wait'), despublicar las sobrantes ('unpublish') o nada ('none').
 */
export function selectOverCapAction(input: {
  published: number
  cap: number | null
  overCapSince: string | Date | null
  now: Date
}): OverCapAction {
  const { published, cap, overCapSince, now } = input
  if (cap === null) return overCapSince ? 'clear' : 'none'
  if (published <= cap) return overCapSince ? 'clear' : 'none'
  if (!overCapSince) return 'mark'
  const since = new Date(overCapSince).getTime()
  const deadline = since + GRACE_DAYS.properties * 86_400_000
  return now.getTime() >= deadline ? 'unpublish' : 'wait'
}
