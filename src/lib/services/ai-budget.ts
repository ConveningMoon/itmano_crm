// Aritmética de los dos tramos del presupuesto de IA. PURO a propósito: sin
// `server-only`, sin Supabase y sin red, para que `test:unit` lo cubra sin
// tocar la base. La parte que consulta al tenant vive en `ai-limit.ts`.
//
// El presupuesto mensual de un tenant (`tenants.ai_monthly_limit_usd`) se parte
// en dos según QUIÉN pide:
//
//   núcleo        el análisis de fit de cada lead. Corre solo —intake de
//                 formularios, webhook de respuestas, contacto—, nadie lo
//                 pulsa, y al quedarse sin presupuesto NO falla: se salta
//                 (`skip('budget_blocked')` en ai-lead-fit.ts). Un tenant que
//                 gastó el mes generando newsletters se quedaba sin scoring
//                 interpretado por IA sin un solo error a la vista.
//   discrecional  todo lo demás. Alguien pulsó un botón y lee el mensaje de
//                 por qué no se pudo.
//
// La reserva son los ÚLTIMOS dólares del mismo tope, no una bolsa aparte: un
// solo contador (`ai_usage_events`), ninguna columna nueva, y sigue funcionando
// para un tenant al que el super_admin le subió el límite a mano.

import { PLANS, TRIAL } from '@/lib/plans'
import type { SubscriptionPlan } from '@/lib/subscriptions'
import type { AiFeature } from '@/lib/services/ai-feature-labels'

/**
 * Las features que gastan de la reserva. La lista es corta a propósito: lo que
 * entra aquí deja de poder fallar de cara al usuario, así que sólo pertenece
 * algo que (a) se dispare sin intervención humana y (b) degrade el producto en
 * silencio al no correr.
 */
export const AI_CORE_FEATURES = ['lead_fit'] as const

/**
 * Techo de la reserva como fracción del tope. Existe para el caso en que el
 * tope de un tenant se baje por debajo de la reserva de su plan: sin este
 * recorte, el tramo discrecional quedaría en cero y el usuario no podría
 * generar absolutamente nada, sin que nadie hubiera decidido eso.
 */
export const MAX_RESERVE_RATIO = 0.5

export function isCoreFeature(feature: AiFeature): boolean {
  return (AI_CORE_FEATURES as readonly string[]).includes(feature)
}

/** Reserva efectiva de un tenant, ya recortada al tope que de verdad tiene. */
export function reserveUsdFor(plan: SubscriptionPlan, limitUsd: number): number {
  if (!Number.isFinite(limitUsd) || limitUsd <= 0) return 0
  const declarada = PLANS[plan].limits.aiCoreReserveUsd
  return Math.min(declarada, limitUsd * MAX_RESERVE_RATIO)
}

/** Lo que puede gastar todo lo que NO es núcleo. */
export function discretionaryLimitUsd(plan: SubscriptionPlan, limitUsd: number): number {
  if (!Number.isFinite(limitUsd) || limitUsd <= 0) return 0
  return limitUsd - reserveUsdFor(plan, limitUsd)
}

/** El techo que le aplica a quien pregunta. */
export function ceilingUsdFor(plan: SubscriptionPlan, limitUsd: number, core: boolean): number {
  if (!Number.isFinite(limitUsd) || limitUsd <= 0) return 0
  return core ? limitUsd : discretionaryLimitUsd(plan, limitUsd)
}

/**
 * Con cuánto presupuesto nace un tenant. Lo escribe `createTenant`.
 *
 * Tiene que ser explícito porque `tenants.ai_monthly_limit_usd` tiene un
 * DEFAULT de $10 en la base, y un default de columna no sabe de planes: un
 * tenant Partner creado sin pasar este valor arrancaba con $10 en vez de $75 y
 * se quedaba sin IA en los primeros días. Era el mismo hueco al revés en
 * Esencial ($10 donde el plan dice $12).
 *
 * El super_admin puede ajustarlo después desde el Centro de control
 * (`updateTenant`); esto es sólo el punto de partida.
 */
export function initialAiBudgetUsd(plan: SubscriptionPlan, startTrial: boolean): number {
  // La prueba vive como plan 'growth' pero con presupuesto de cortesía propio:
  // gana sobre el del plan (ver TRIAL en plans.ts).
  return startTrial ? TRIAL.aiBudgetUsd : planAiBudgetUsd(plan)
}

/**
 * El presupuesto que un plan le asigna a un tenant. Lo usan el alta
 * (initialAiBudgetUsd) y el cambio de plan (paddle/persist.ts) para no tener
 * dos ideas distintas de cuánto le toca a un Growth.
 */
export function planAiBudgetUsd(plan: SubscriptionPlan): number {
  return PLANS[plan].limits.aiBudgetUsd
}
