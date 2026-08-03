import { BUCKETS, BUY_DIMS, SELL_DIMS, type Dimension } from '@/lib/scoring/vocabulary'
import { geoFitFor, type BusinessProfile } from '@/lib/business/profile'
import { parseAmount } from '@/lib/sources/parse-amount'

// ── Salud de una fuente ───────────────────────────────────────────────────────
//
// El CRM no puede arreglar un formulario que vive en otro repo, ni enterarse de
// que cambió. Lo que SÍ puede es mirar lo que llega y decir si está entrando
// bien — que es la única señal honesta, porque se calcula del tráfico real y no
// de comparar configuraciones.
//
// Detecta la desviación que YA existe, no sólo la futura: una web que lleva
// meses mandando `timeline: "immediately"` sale marcada al primer envío.
//
// Módulo PURO: recibe los envíos ya leídos y devuelve el diagnóstico.

const FIT_DIMENSIONS_ALL = new Set<string>([...BUY_DIMS, ...SELL_DIMS])

export interface SubmissionAnswer { key: string; value: unknown }
export interface SubmissionLike { answers: SubmissionAnswer[] }

export type SourceStatus = 'sin_envios' | 'ok' | 'parcial' | 'no_puntua'

export interface SourceHealth {
  submissions: number
  status:      SourceStatus
  /** Dimensiones de fit que sí llegan bien. */
  reconocidas: string[]
  /** `dimension: valor` que llega pero no casa ningún bucket del modelo. */
  valoresInvalidos: Array<{ key: string; value: string }>
  /** Zonas que llegan y no casan ninguna de las declaradas por la agencia. */
  zonasSinCasar: string[]
  /** Manda el nivel ya resuelto en vez del dato en bruto. */
  mandaNivelResuelto: boolean
  /** Dimensiones del modelo que esta fuente nunca pregunta. */
  nuncaLlegan: string[]
}

const EMPTY: SourceHealth = {
  submissions: 0, status: 'sin_envios', reconocidas: [],
  valoresInvalidos: [], zonasSinCasar: [], mandaNivelResuelto: false, nuncaLlegan: [],
}

/**
 * Diagnostica una fuente a partir de sus envíos.
 *
 * `profile` hace falta para juzgar las zonas: una zona sólo es "sin casar" si la
 * agencia declaró las suyas. Sin perfil no se acusa a nadie.
 */
export function diagnoseSource(
  submissions: SubmissionLike[],
  profile: BusinessProfile,
): SourceHealth {
  if (submissions.length === 0) return EMPTY

  const reconocidas = new Set<string>()
  const invalidos = new Map<string, string>()
  const zonasSinCasar = new Set<string>()
  let mandaNivelResuelto = false

  for (const s of submissions) {
    for (const a of s.answers ?? []) {
      const key = String(a.key ?? '').trim()
      const value = typeof a.value === 'string' ? a.value.trim() : String(a.value ?? '')
      if (!key || !value) continue

      if (key === 'budget_amount') {
        if (parseAmount(value) !== null) reconocidas.add('budget_amount')
        else invalidos.set(`${key}::${value}`, value)
        continue
      }

      if (key === 'area') {
        const fit = geoFitFor(value, profile)
        if (fit === null) {
          // Sin zonas declaradas no hay nada que reprochar; con ellas, esto es
          // un "no lo sé" y tampoco lo es.
          if (profile.primaryAreas.length > 0 || profile.secondaryAreas.length > 0) {
            reconocidas.add('area')
          }
        } else if (fit === 'fuera_de_zona') {
          // Puede ser legítimo (un lead de Miami) o una desviación (la zona está
          // mal escrita en una de las dos puntas). Se reporta y decide quien mira.
          zonasSinCasar.add(value)
          reconocidas.add('area')
        } else {
          reconocidas.add('area')
        }
        continue
      }

      if (!FIT_DIMENSIONS_ALL.has(key)) continue // pregunta libre: legítima

      // Manda el nivel ya resuelto: funciona, pero se queda congelado si la
      // agencia cambia sus rangos o sus zonas.
      if (key === 'budget_tier' || key === 'geo_fit') mandaNivelResuelto = true

      const buckets = BUCKETS[key as Dimension] as readonly string[] | undefined
      if (buckets && buckets.includes(value)) reconocidas.add(key)
      else invalidos.set(`${key}::${value}`, value)
    }
  }

  const valoresInvalidos = [...invalidos.entries()]
    .map(([k, value]) => ({ key: k.split('::')[0], value }))
    .slice(0, 12)

  const esperadas = [...BUY_DIMS, 'budget_amount', 'area']
    .filter(d => d !== 'budget_tier' && d !== 'geo_fit' && d !== 'property_use')
  const nuncaLlegan = esperadas.filter(d => !reconocidas.has(d))

  const status: SourceStatus =
    reconocidas.size === 0                             ? 'no_puntua'
    : valoresInvalidos.length > 0 || nuncaLlegan.length > 0 ? 'parcial'
    : 'ok'

  return {
    submissions: submissions.length,
    status,
    reconocidas: [...reconocidas].sort(),
    valoresInvalidos,
    zonasSinCasar: [...zonasSinCasar].slice(0, 8),
    mandaNivelResuelto,
    nuncaLlegan,
  }
}

export const STATUS_COPY: Record<SourceStatus, { label: string; tone: 'ok' | 'warn' | 'bad' | 'mute' }> = {
  sin_envios: { label: 'Sin envíos',            tone: 'mute' },
  ok:         { label: 'Recibiendo bien',       tone: 'ok'   },
  parcial:    { label: 'Califica a medias',     tone: 'warn' },
  no_puntua:  { label: 'No califica al lead',   tone: 'bad'  },
}

/** Frase concreta de qué arreglar, o null si no hay nada. */
export function healthHint(h: SourceHealth, profile: BusinessProfile): string | null {
  if (h.status === 'sin_envios') return null
  if (h.status === 'no_puntua') {
    return 'Ningún envío de esta fuente alimenta el score: las claves o los valores no coinciden con el contrato. Abre "Opciones de integración" y compáralo.'
  }
  const partes: string[] = []
  if (h.valoresInvalidos.length > 0) {
    partes.push(`llegan valores que el modelo no reconoce (${h.valoresInvalidos.slice(0, 3).map(v => `${v.key}: "${v.value}"`).join(', ')})`)
  }
  if (h.mandaNivelResuelto) {
    partes.push('manda el nivel ya resuelto (budget_tier / geo_fit) en vez del dato en bruto, así que no se entera si cambias tus rangos o tus zonas')
  }
  if (h.zonasSinCasar.length > 0 && (profile.primaryAreas.length > 0 || profile.secondaryAreas.length > 0)) {
    partes.push(`recibe zonas fuera de las tuyas (${h.zonasSinCasar.slice(0, 3).join(', ')}) — si alguna debería contar, decláratela en Ajustes → Tu negocio`)
  }
  if (h.nuncaLlegan.length > 0) {
    partes.push(`nunca pregunta: ${h.nuncaLlegan.join(', ')}`)
  }
  return partes.length > 0 ? `Esta fuente ${partes.join('; ')}.` : null
}
