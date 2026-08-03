import 'server-only'
import { BUY_DIMS, SELL_DIMS } from '@/lib/scoring/vocabulary'
import { budgetTierFor, geoFitFor, EMPTY_PROFILE, type BusinessProfile } from '@/lib/business/profile'
import { parseAmount } from '@/lib/sources/parse-amount'

// Mapea la intención + respuestas de un envío al fit_profile del lead.
//
// El motor de scoring deriva el componente "fit" de leads.fit_profile — un mapa
// plano { dimensión: código } que recompute_lead_score cruza con lead_score_rules
// (category='fit', match_value=código). Este módulo convierte el arreglo
// autodescriptivo de respuestas en ese mapa, acotado por la intención del lead
// para que un formulario de compra no pueda inyectar dimensiones de venta.
//
// Hay DOS caminos, y el segundo existe porque el primero le pedía al formulario
// algo que no puede saber:
//
//   1. CÓDIGO DIRECTO — el formulario manda el bucket ya resuelto
//      (`financing: 'cash'`). Es el contrato documentado en el prompt de
//      integración y se guarda literal.
//
//   2. DATO CRUDO — el formulario manda el HECHO y el CRM lo clasifica contra el
//      perfil de la agencia (`budget_amount: 350000` → entry/mid/premium según
//      los cortes de ESE tenant; `area: 'Virginia Beach'` → zona_principal según
//      las zonas que declaró). Un formulario no puede saber si 300.000 es mucho
//      o poco para su agencia — pedirle el bucket era pedirle que adivinara.
//
// El dato crudo GANA sobre el código directo cuando llegan los dos: los cortes
// del tenant son la autoridad sobre lo que el formulario haya supuesto.

export type FitIntent = 'buy' | 'invest' | 'sell'

// Una respuesta del snapshot de form_submissions (ver CLAUDE.md → contrato de
// answers). Aquí sólo hacen falta `key` y `value`.
export interface FormAnswerItem {
  key:   string
  value: string | number | boolean
}

// Normaliza las muchas formas en que un formulario puede escribir la intención.
const INTENT_ALIASES: Record<string, FitIntent> = {
  buy: 'buy', purchase: 'buy', compra: 'buy', comprar: 'buy', comprador: 'buy',
  invest: 'invest', investment: 'invest', invierte: 'invest', invertir: 'invest',
  inversion: 'invest', inversionista: 'invest',
  sell: 'sell', sale: 'sell', vende: 'sell', vender: 'sell', vendedor: 'sell',
}

// Las dimensiones reconocidas por intención salen de `scoring/vocabulary`, que es
// la misma fuente que usan el análisis con IA y el panel de alcance de Ajustes.
//
// Antes eran una lista fija escrita a mano con las cuatro dimensiones de la
// migración 029. La 077 añadió `contingency`, `geo_fit` y `property_use` al
// modelo — con reglas y puntos en la base — pero esta lista no se actualizó, así
// que el intake las descartaba en silencio y el prompt de integración (que se
// arma con estos mismos grupos) nunca le dijo a nadie que las mandara.
export const FIT_DIMENSIONS: Record<FitIntent, readonly string[]> = {
  buy:    BUY_DIMS,
  invest: BUY_DIMS,
  sell:   SELL_DIMS,
}

// Unión de todas las dimensiones reconocidas — fallback cuando no llega intención
// (los formularios sólo mandan los campos de la suya, de todos modos).
const ALL_FIT_DIMENSIONS: readonly string[] = [...new Set([...BUY_DIMS, ...SELL_DIMS])]

/**
 * Claves de dato crudo que el CRM clasifica con el perfil de la agencia, y la
 * dimensión de fit que alimenta cada una.
 */
export const DERIVED_KEYS = {
  budget_amount: 'budget_tier',
  area:          'geo_fit',
} as const

export function normalizeIntent(raw: unknown): FitIntent | null {
  if (typeof raw !== 'string') return null
  return INTENT_ALIASES[raw.trim().toLowerCase()] ?? null
}

// El parseo de montos vive en sources/parse-amount (puro): lo comparten el
// intake y el diagnóstico de fuentes, que corre en el panel.
export { parseAmount } from '@/lib/sources/parse-amount'

/** El monto que el lead declaró en este envío, si mandó la clave `budget_amount`. */
export function extractBudgetAmount(answers: FormAnswerItem[] | undefined): number | null {
  if (!answers?.length) return null
  for (const a of answers) {
    if (a.key === 'budget_amount') {
      const n = parseAmount(a.value)
      if (n !== null) return n
    }
  }
  return null
}

// ─── Extracción ───────────────────────────────────────────────────────────────

/**
 * Dimensiones de fit reconocidas en este envío, acotadas por la intención.
 *
 * Las claves libres se ignoran. Los valores vacíos se descartan para no pisar una
 * respuesta ya conocida con un blanco al reenviar.
 *
 * `profile` sólo hace falta para el camino de dato crudo; sin él (o sin cortes y
 * zonas declarados) esas dimensiones simplemente no se derivan — `budgetTierFor`
 * y `geoFitFor` devuelven null antes que inventar un bucket.
 */
export function extractFitDimensions(
  intent: FitIntent | null,
  answers: FormAnswerItem[] | undefined,
  profile: BusinessProfile = EMPTY_PROFILE,
): Record<string, string> {
  if (!answers?.length) return {}
  const allowed = intent ? FIT_DIMENSIONS[intent] : ALL_FIT_DIMENSIONS
  const out: Record<string, string> = {}

  // 1) Códigos directos.
  for (const a of answers) {
    if (!allowed.includes(a.key)) continue
    const value = typeof a.value === 'string' ? a.value.trim() : String(a.value)
    if (value) out[a.key] = value
  }

  // 2) Datos crudos clasificados con el perfil. Van después a propósito: el corte
  //    del tenant manda sobre el bucket que el formulario haya supuesto.
  for (const a of answers) {
    const dimension = DERIVED_KEYS[a.key as keyof typeof DERIVED_KEYS]
    if (!dimension || !allowed.includes(dimension)) continue

    const bucket = a.key === 'budget_amount'
      ? budgetTierFor(parseAmount(a.value), profile)
      : geoFitFor(typeof a.value === 'string' ? a.value : String(a.value), profile)

    if (bucket) out[dimension] = bucket
  }

  return out
}
