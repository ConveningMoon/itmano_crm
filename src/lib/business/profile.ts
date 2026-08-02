// Perfil de negocio del tenant: lo que la agencia sabe de su mercado y el CRM
// no puede deducir.
//
// Módulo PURO. Lo comparten el formulario de Ajustes, el intake y el análisis
// con IA, así que no importa nada de Supabase.

export const CURRENCIES = ['USD', 'EUR'] as const
export type Currency = typeof CURRENCIES[number]

export const COMMISSION_MODELS = ['percentage', 'flat'] as const
export type CommissionModel = typeof COMMISSION_MODELS[number]

/** Los buckets de `budget_tier` que ya usa el fit, de mayor a menor. */
export const BUDGET_TIERS = ['premium', 'mid', 'entry'] as const
export type BudgetTier = typeof BUDGET_TIERS[number]

export interface BusinessProfile {
  currency:         Currency | null
  commissionModel:  CommissionModel | null
  /** % o monto por operación de COMPRA, según commissionModel. */
  commissionBuy:    number | null
  /** % o monto por operación de VENTA. */
  commissionSell:   number | null
  /** Hasta aquí el presupuesto es "entry" para esta agencia. */
  budgetEntryMax:   number | null
  /** Desde aquí, "premium". Entre ambos, "mid". */
  budgetPremiumMin: number | null
}

export const EMPTY_PROFILE: BusinessProfile = {
  currency: null, commissionModel: null,
  commissionBuy: null, commissionSell: null,
  budgetEntryMax: null, budgetPremiumMin: null,
}

export const CURRENCY_SYMBOL: Record<Currency, string> = { USD: '$', EUR: '€' }

/** Los dos cortes de presupuesto están puestos y son coherentes. */
export function hasBudgetBands(p: BusinessProfile): boolean {
  return p.budgetEntryMax !== null
    && p.budgetPremiumMin !== null
    && p.budgetEntryMax < p.budgetPremiumMin
}

/**
 * En qué bucket cae un presupuesto concreto PARA ESTA AGENCIA.
 *
 * Es la pieza que faltaba: `budget_tier` se usa en el fit y el prompt de la IA
 * dice que el nivel es "relativo al mercado de la agencia", pero hasta ahora
 * nadie le daba los números de esa agencia. 300.000 es de entrada en un mercado
 * y premium en otro; sin estos cortes eso se resolvía adivinando.
 *
 * Devuelve null cuando el perfil no tiene los cortes: es "no lo sé", que es
 * distinto de "es de entrada".
 */
export function budgetTierFor(amount: number | null | undefined, p: BusinessProfile): BudgetTier | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount) || amount < 0) return null
  if (!hasBudgetBands(p)) return null

  if (amount <= p.budgetEntryMax!)    return 'entry'
  if (amount >= p.budgetPremiumMin!)  return 'premium'
  return 'mid'
}

/**
 * Lo que la agencia se llevaría por una operación de ese tamaño.
 *
 * `null` cuando falta el dato — nunca 0. Un cero diría "esta operación no deja
 * nada", que es una afirmación; la ausencia de perfil no lo es.
 */
export function expectedCommission(
  amount: number | null | undefined,
  p: BusinessProfile,
  side: 'buy' | 'sell',
): number | null {
  const rate = side === 'buy' ? p.commissionBuy : p.commissionSell
  if (rate === null || rate === undefined || !p.commissionModel) return null

  // Un monto fijo no depende del tamaño de la operación: se cobra igual.
  if (p.commissionModel === 'flat') return rate

  if (amount === null || amount === undefined || !Number.isFinite(amount) || amount < 0) return null
  return Math.round((amount * rate) / 100)
}

/** Monto en la moneda del perfil, sin decimales (aquí nadie mira los céntimos). */
export function formatMoney(amount: number | null | undefined, currency: Currency | null): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '—'
  const symbol = currency ? CURRENCY_SYMBOL[currency] : ''
  return `${symbol}${Math.round(amount).toLocaleString('es-ES')}`
}

/** Qué le falta al perfil para ser útil. Vacío = completo. */
export function missingFields(p: BusinessProfile): string[] {
  const faltan: string[] = []
  if (!p.currency)                     faltan.push('la moneda')
  if (!p.commissionModel)              faltan.push('el modelo de comisión')
  if (p.commissionBuy === null && p.commissionSell === null) faltan.push('al menos una comisión')
  if (!hasBudgetBands(p))              faltan.push('los rangos de presupuesto')
  return faltan
}
