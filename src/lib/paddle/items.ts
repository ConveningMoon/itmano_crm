// Ítems de una suscripción de Paddle (fase 5 del plan SaaS). PURO: lo usan el
// checkout, el cambio de plan, la sincronización de asientos y test:unit.
//
// Partner de catálogo (D3) = precio base (incluye PARTNER_SEAT.includedLogins
// logins) + un ítem de asiento con cantidad = logins extra. Un Partner con
// precio negociado (excepción) es un solo ítem y no cobra asientos: el trato
// ya fija cuántos logins incluye.

import { PARTNER_SEAT } from '@/lib/plans'
import type { SubscriptionPlan } from '@/lib/subscriptions'

export type Cycle = 'month' | 'year'

export interface CatalogPrices {
  plans: Record<SubscriptionPlan, Record<Cycle, string | null>>
  seat:  Record<Cycle, string | null>
}

export interface PaddleItem {
  priceId:  string
  quantity: number
}

/** Logins por encima de los incluidos en Partner. Nunca negativo. */
export function extraSeats(logins: number): number {
  return Math.max(0, Math.floor(logins) - PARTNER_SEAT.includedLogins)
}

/** true si el precio es uno de los de catálogo (de cualquier plan o asiento). */
export function isCatalogPrice(priceId: string | null | undefined, prices: CatalogPrices): boolean {
  if (!priceId) return false
  const all = [
    ...Object.values(prices.plans).flatMap(c => [c.month, c.year]),
    prices.seat.month, prices.seat.year,
  ]
  return all.includes(priceId)
}

export function isSeatPrice(priceId: string | null | undefined, prices: CatalogPrices): boolean {
  return !!priceId && (priceId === prices.seat.month || priceId === prices.seat.year)
}

/** Plan y ciclo de un precio de catálogo (sin asientos), o null. */
export function planOfPrice(priceId: string | null | undefined, prices: CatalogPrices): { plan: SubscriptionPlan; cycle: Cycle } | null {
  if (!priceId) return null
  for (const plan of Object.keys(prices.plans) as SubscriptionPlan[]) {
    for (const cycle of ['month', 'year'] as Cycle[]) {
      if (prices.plans[plan][cycle] === priceId) return { plan, cycle }
    }
  }
  return null
}

/**
 * Precio que identifica la suscripción: el primero que no sea un asiento.
 * Paddle no garantiza el orden de los ítems, así que no basta con items[0].
 */
export function primaryPriceId(itemPriceIds: (string | null | undefined)[], prices: CatalogPrices): string | null {
  const ids = itemPriceIds.filter((p): p is string => !!p)
  return ids.find(p => !isSeatPrice(p, prices)) ?? ids[0] ?? null
}

export type ItemsResult =
  | { ok: true; items: PaddleItem[] }
  | { ok: false; reason: 'missing_price' | 'missing_seat_price' }

/**
 * Ítems para un plan y ciclo. `negotiatedPriceId` (sólo Partner) sustituye al
 * catálogo y no lleva asientos. Los asientos se cobran sólo si hay extra: un
 * ítem con cantidad 0 no es válido en Paddle.
 */
export function subscriptionItems(input: {
  plan:               SubscriptionPlan
  cycle:              Cycle
  logins:             number
  prices:             CatalogPrices
  negotiatedPriceId?: string | null
}): ItemsResult {
  const { plan, cycle, logins, prices } = input
  if (plan === 'partner' && input.negotiatedPriceId) {
    return { ok: true, items: [{ priceId: input.negotiatedPriceId, quantity: 1 }] }
  }
  const base = prices.plans[plan][cycle]
  if (!base) return { ok: false, reason: 'missing_price' }
  const items: PaddleItem[] = [{ priceId: base, quantity: 1 }]
  if (plan === 'partner') {
    const seats = extraSeats(logins)
    if (seats > 0) {
      const seat = prices.seat[cycle]
      if (!seat) return { ok: false, reason: 'missing_seat_price' }
      items.push({ priceId: seat, quantity: seats })
    }
  }
  return { ok: true, items }
}

/**
 * Precio negociado vigente de un Partner, si lo hay: un paddle_price_id que no
 * es de catálogo. Con catálogo completo, el precio guardado de un Partner que ya
 * pagó es el de catálogo y esto devuelve null.
 */
export function negotiatedPartnerPrice(
  plan: SubscriptionPlan,
  storedPriceId: string | null | undefined,
  prices: CatalogPrices,
): string | null {
  if (plan !== 'partner' || !storedPriceId) return null
  return isCatalogPrice(storedPriceId, prices) ? null : storedPriceId
}

/**
 * Ítems que debería tener una suscripción de catálogo, o null si ya están bien.
 *
 *   · Cada precio de plan con cantidad 1: el checkout de Paddle deja cambiar la
 *     cantidad, y 2 × Esencial para un mismo equipo no significa nada.
 *   · Partner: un ítem de asiento con los logins extra (ninguno si no hay).
 *     Otro plan: sin asientos.
 *   · Lo que no es de catálogo (un add-on puesto a mano en Paddle) no se toca.
 *
 * El ciclo de los asientos sale del precio del plan, no de la base de datos:
 * Paddle es quien cobra.
 */
export function reconcileItems(
  current: PaddleItem[],
  opts: { extraSeats: number; prices: CatalogPrices },
): PaddleItem[] | null {
  const { prices } = opts
  const plans = current.filter(i => planOfPrice(i.priceId, prices))
  const others = current.filter(i => !planOfPrice(i.priceId, prices) && !isSeatPrice(i.priceId, prices))
  const primary = plans[0] ? planOfPrice(plans[0].priceId, prices) : null
  if (!primary) return null

  const wanted: PaddleItem[] = plans.map(i => ({ priceId: i.priceId, quantity: 1 }))
  if (primary.plan === 'partner' && opts.extraSeats > 0) {
    const seat = prices.seat[primary.cycle]
    if (seat) wanted.push({ priceId: seat, quantity: opts.extraSeats })
  }
  wanted.push(...others)

  const key = (items: PaddleItem[]) => items.map(i => `${i.priceId}x${i.quantity}`).sort().join(',')
  return key(wanted) === key(current) ? null : wanted
}

/** "$12.34" desde el importe en centavos que devuelve Paddle. */
export function formatPaddleAmount(minorUnits: string | number, currency: string): string {
  const n = Number(minorUnits) / 100
  const formatted = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
  return currency === 'USD' ? `$${formatted}` : `${formatted} ${currency}`
}
