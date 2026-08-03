import 'server-only'
import { BUY_DIMS, SELL_DIMS } from '@/lib/scoring/vocabulary'
import { budgetTierFor, geoFitFor, EMPTY_PROFILE, type BusinessProfile } from '@/lib/business/profile'

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

// ─── Montos ───────────────────────────────────────────────────────────────────

// Un solo número con separadores de miles/decimales en cualquier convención, y
// con sufijo k/M opcional. La ambigüedad real es "350.000": en es-ES son
// trescientos cincuenta mil y en en-US son 350 con decimales. Se resuelve por
// forma, no por locale — un grupo de EXACTAMENTE tres dígitos tras un único
// separador es separador de miles. (Un presupuesto de 350,5 no existe.)
function parseSingleAmount(raw: string): number | null {
  const s = raw.replace(/\s| /g, '')
  if (!s) return null

  // Sufijo de escala antes de tocar los separadores: "350k", "1.2M".
  const suffix = /([kK])$|([mM])$/.exec(s)
  const scale  = suffix ? (suffix[1] ? 1_000 : 1_000_000) : 1
  const body   = suffix ? s.slice(0, -1) : s

  const digits = body.replace(/[^0-9.,]/g, '')
  if (!/[0-9]/.test(digits)) return null

  let normalized: string
  const lastDot   = digits.lastIndexOf('.')
  const lastComma = digits.lastIndexOf(',')

  if (lastDot >= 0 && lastComma >= 0) {
    // Conviven los dos: el último es el decimal, el otro agrupa millares.
    const decimalSep = lastDot > lastComma ? '.' : ','
    const groupSep   = decimalSep === '.' ? ',' : '.'
    normalized = digits.split(groupSep).join('').replace(decimalSep, '.')
  } else {
    const sep = lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : null
    if (sep === null) {
      normalized = digits
    } else {
      const parts = digits.split(sep)
      const tail  = parts[parts.length - 1]
      // Más de un separador, o un grupo final de 3 dígitos → miles.
      normalized = parts.length > 2 || tail.length === 3
        ? parts.join('')
        : parts.join('.')
    }
  }

  const n = Number.parseFloat(normalized)
  if (!Number.isFinite(n) || n < 0) return null
  return n * scale
}

/**
 * Monto declarado por el lead, a partir de lo que sea que el formulario mandó.
 *
 * Acepta un número, una cadena con separadores en cualquier convención, y un
 * RANGO ("300.000 - 400.000", "entre 300k y 400k"), que se resuelve al punto
 * medio: el lead que dice "entre 300 y 400" no está declarando 300.
 *
 * `null` cuando no hay nada parseable — nunca 0, que sería afirmar que su
 * presupuesto es cero.
 */
export function parseAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? raw : null
  if (typeof raw !== 'string') return null

  // Los separadores de rango se distinguen del signo menos por venir DESPUÉS de
  // un número — incluido su sufijo de escala: "300k-400k" es un rango, y sin
  // contemplar la `k` se leía como el número 300400 seguido de sufijo, o sea
  // trescientos millones. `y`/`a`/`to` van rodeados de espacios para no partir
  // cadenas tipo "1a2b3".
  const partes = raw
    .split(/(?<=[0-9kKmM\s])\s*(?:-|–|—|\bal?\b|\by\b|\bto\b|\bhasta\b)\s*(?=[0-9$€])/i)
    .map(p => parseSingleAmount(p))
    .filter((n): n is number => n !== null)

  if (partes.length === 0) return null
  if (partes.length === 1) return partes[0]
  return Math.round((Math.min(...partes) + Math.max(...partes)) / 2)
}

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
