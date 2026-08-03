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

/** Los buckets de `geo_fit`, de mejor a peor encaje. */
export const GEO_FITS = ['zona_principal', 'zona_secundaria', 'fuera_de_zona'] as const
export type GeoFit = typeof GEO_FITS[number]

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
  /** Zonas donde la agencia trabaja habitualmente. */
  primaryAreas:     string[]
  /** Zonas que atiende sin ser su foco. Fuera de ambas, fuera_de_zona. */
  secondaryAreas:   string[]
}

export const EMPTY_PROFILE: BusinessProfile = {
  currency: null, commissionModel: null,
  commissionBuy: null, commissionSell: null,
  budgetEntryMax: null, budgetPremiumMin: null,
  primaryAreas: [], secondaryAreas: [],
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

/**
 * Normaliza para comparar zonas: sin tildes, sin mayúsculas, sin sobrantes.
 *
 * Los guiones y guiones bajos cuentan como espacio porque muchos formularios
 * mandan la zona slugificada: `virginia_beach` tiene que casar con la zona
 * "Virginia Beach" que declaró la agencia. Sin esto, geo_fit se quedaba sin
 * clasificar para cualquier formulario que no escribiera la zona a mano.
 */
function normalizeArea(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().toLowerCase()
}

// Respuestas que significan "no lo sé", no "fuera de zona". `fuera_de_zona`
// RESTA 10 puntos: es una afirmación sobre el lead, y no saber dónde quiere
// vivir no es estar fuera del área. Los formularios ofrecen esta opción con
// nombres distintos, así que se reconocen las formas habituales; lo que no esté
// aquí se trata como una zona real, que es el comportamiento conservador.
const UNKNOWN_AREA = new Set([
  'no se', 'no lo se', 'no estoy seguro', 'no estoy segura', 'aun no lo se',
  'not sure', 'notsure', 'unknown', 'nao sei', 'ainda nao sei', 'n/a', 'na', '-',
])

/** `aguja` aparece en `pajar` como secuencia de palabras completas. */
function containsWords(pajar: string, aguja: string): boolean {
  const p = ` ${pajar.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()} `
  const a = ` ${aguja.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()} `
  return a.trim().length > 0 && p.includes(a)
}

/**
 * En qué bucket de `geo_fit` cae una zona PARA ESTA AGENCIA.
 *
 * Igual que con el presupuesto: sin zonas declaradas devuelve null, no
 * `fuera_de_zona`. Restarle 10 puntos a un lead por una zona que nadie definió
 * sería castigarlo por un hueco de configuración.
 *
 * El match es por contención en ambos sentidos: el lead escribe "Virginia
 * Beach, VA" y la agencia declaró "Virginia Beach".
 */
export function geoFitFor(area: string | null | undefined, p: BusinessProfile): GeoFit | null {
  if (!area || !area.trim()) return null
  if (p.primaryAreas.length === 0 && p.secondaryAreas.length === 0) return null

  const a = normalizeArea(area)
  if (UNKNOWN_AREA.has(a)) return null

  // Sólo en una dirección: la respuesta del lead CONTIENE la zona declarada.
  // Al revés ("Virginia Beach" contiene "Virginia") un lead que elige el estado
  // entero se acreditaba como si hubiera dicho la ciudad.
  //
  // Y por palabras completas, no por substring: "Norfolk" no debe casar con una
  // zona declarada "Nor", ni "Charleston" con "Charles".
  const casa = (lista: string[]) => lista.some(z => {
    const n = normalizeArea(z)
    return n.length > 0 && containsWords(a, n)
  })

  if (casa(p.primaryAreas))   return 'zona_principal'
  if (casa(p.secondaryAreas)) return 'zona_secundaria'
  return 'fuera_de_zona'
}

/** Qué le falta al perfil para ser útil. Vacío = completo. */
export function missingFields(p: BusinessProfile): string[] {
  const faltan: string[] = []
  if (!p.currency)                     faltan.push('la moneda')
  if (!p.commissionModel)              faltan.push('el modelo de comisión')
  if (p.commissionBuy === null && p.commissionSell === null) faltan.push('al menos una comisión')
  if (!hasBudgetBands(p))              faltan.push('los rangos de presupuesto')
  if (p.primaryAreas.length === 0)     faltan.push('las zonas donde trabajas')
  return faltan
}
