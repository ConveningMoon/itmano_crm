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

// El estado mide si lo que ESTA fuente manda entra bien. NO mide cuántas
// dimensiones cubre: cuántas preguntas hace un formulario es una decisión de
// producto (más preguntas = mejor perfil, peor conversión), no un defecto.
// Mezclar las dos cosas hacía que un lead magnet impecable saliera en ámbar por
// no preguntar una dimensión de 5 puntos.
export type SourceStatus = 'sin_envios' | 'sin_calificar' | 'ok' | 'parcial' | 'no_puntua'

// Estado de la MEDICION, separado del contenido del formulario. Son dos
// problemas distintos con dos culpables distintos: uno se arregla cambiando las
// preguntas, el otro pegando un script. Mezclarlos en un solo badge hacia que
// "Califica bien" desapareciera en cuanto faltaba el beacon, que no tiene nada
// que ver con la calidad de las preguntas.
export type MeasurementStatus = 'sin_datos' | 'midiendo' | 'sin_medicion'

export interface SourceHealth {
  submissions: number
  /** Qué tan bien califica el CONTENIDO del formulario. */
  status:      SourceStatus
  /** Si la fuente está reportando visitas. Independiente del contenido. */
  measurement: MeasurementStatus
  /** Dimensiones de fit que sí llegan bien. */
  reconocidas: string[]
  /** `dimension: valor` que llega pero no casa ningún bucket del modelo. */
  valoresInvalidos: Array<{ key: string; value: string }>
  /** Zonas que llegan y no casan ninguna de las declaradas por la agencia. */
  zonasSinCasar: string[]
  /** Manda el nivel ya resuelto en vez del dato en bruto. */
  mandaNivelResuelto: boolean
  /**
   * Dimensiones del modelo que esta fuente nunca pregunta. Es una OPORTUNIDAD,
   * no un fallo: no cambia el estado, sólo se informa.
   */
  nuncaLlegan: string[]
  /** Preguntas propias que no alimentan ninguna dimensión (texto libre). */
  preguntasLibres: number
  /**
   * Llegan envíos pero NINGUNA visita: la página no tiene el beacon instalado.
   * Sin él, "Vistas" y "Conversión" quedan en cero para siempre y no hay forma
   * de saber cuánta gente vio la página y no la llenó.
   */
  faltaBeacon: boolean
}

const EMPTY: SourceHealth = {
  submissions: 0, status: 'sin_envios', measurement: 'sin_datos', reconocidas: [],
  valoresInvalidos: [], zonasSinCasar: [], mandaNivelResuelto: false,
  nuncaLlegan: [], preguntasLibres: 0, faltaBeacon: false,
}

// Un formulario de contacto puro (mensaje + motivo) no intenta calificar, y eso
// está bien. Uno con muchas preguntas propias y ninguna reconocida SÍ lo intenta
// y no lo consigue — es el caso de las claves slugificadas del texto en español.
const MIN_PREGUNTAS_PARA_SOSPECHAR = 3
const CLAVES_DE_CONTACTO = new Set(['message', 'reason', 'mensaje', 'motivo'])

/**
 * Diagnostica una fuente a partir de sus envíos.
 *
 * `profile` hace falta para juzgar las zonas: una zona sólo es "sin casar" si la
 * agencia declaró las suyas. Sin perfil no se acusa a nadie.
 */
export function diagnoseSource(
  submissions: SubmissionLike[],
  profile: BusinessProfile,
  /** Visitas registradas del canal. Sólo se juzga cuando ya hay envíos. */
  pageViews = 0,
): SourceHealth {
  if (submissions.length === 0) return EMPTY

  const reconocidas = new Set<string>()
  const invalidos = new Map<string, string>()
  const zonasSinCasar = new Set<string>()
  const libres = new Set<string>()
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

      if (!FIT_DIMENSIONS_ALL.has(key)) {
        if (!CLAVES_DE_CONTACTO.has(key)) libres.add(key)
        continue // pregunta libre: legítima, se guarda y se muestra
      }

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

  // El estado del FORMULARIO no mira la medición: son dos problemas con dos
  // culpables distintos. Ámbar sólo por defectos del contenido.
  const faltaBeacon = submissions.length > 0 && pageViews === 0
  const hayDefecto = valoresInvalidos.length > 0 || zonasSinCasar.size > 0 || mandaNivelResuelto

  const status: SourceStatus =
    reconocidas.size > 0
      ? (hayDefecto ? 'parcial' : 'ok')
      // Nada reconocido: distinguir el que no lo intenta del que lo intenta y falla.
      : (libres.size >= MIN_PREGUNTAS_PARA_SOSPECHAR ? 'no_puntua' : 'sin_calificar')

  return {
    submissions: submissions.length,
    status,
    measurement: faltaBeacon ? 'sin_medicion' : 'midiendo',
    reconocidas: [...reconocidas].sort(),
    valoresInvalidos,
    zonasSinCasar: [...zonasSinCasar].slice(0, 8),
    mandaNivelResuelto,
    nuncaLlegan,
    preguntasLibres: libres.size,
    faltaBeacon,
  }
}

export type Tone = 'ok' | 'warn' | 'bad' | 'mute'

/** Estado del FORMULARIO: qué tan bien califica lo que pregunta. */
export const STATUS_COPY: Record<SourceStatus, { label: string; tone: Tone }> = {
  sin_envios:    { label: 'Sin envíos',          tone: 'mute' },
  sin_calificar: { label: 'Solo contacto',       tone: 'mute' },
  ok:            { label: 'Califica bien',       tone: 'ok'   },
  parcial:       { label: 'Revisar respuestas',  tone: 'warn' },
  no_puntua:     { label: 'No califica al lead', tone: 'bad'  },
}

/** Estado de la FUENTE: si está reportando lo que hace falta para medirla. */
export const MEASUREMENT_COPY: Record<MeasurementStatus, { label: string; tone: Tone }> = {
  sin_datos:    { label: 'Sin datos',      tone: 'mute' },
  midiendo:     { label: 'Midiendo',       tone: 'ok'   },
  sin_medicion: { label: 'Sin medición',   tone: 'warn' },
}

/** Qué le pasa a la medición de esta fuente, o null si va bien. */
export function measurementHint(h: SourceHealth): string | null {
  if (h.measurement !== 'sin_medicion') return null
  return 'Llegan envíos pero ninguna visita: a la página le falta el script de medición. Sin él, Vistas y Conversión se quedan en cero y no sabes cuánta gente llegó y no llenó el formulario — que es lo que dice si el problema está en el tráfico o en el formulario. El script está en "Opciones de integración".'
}

/** Frase concreta de qué arreglar, o null si no hay nada. */
export function healthHint(h: SourceHealth, profile: BusinessProfile): string | null {
  if (h.status === 'sin_envios') return null
  if (h.status === 'sin_calificar') {
    return 'Esta fuente sólo recoge el contacto — no hace preguntas que califiquen. Es lo esperado en un formulario de contacto; si quieres que puntúe, añádele preguntas de calificación.'
  }
  if (h.status === 'no_puntua') {
    return `Esta fuente hace ${h.preguntasLibres} preguntas propias y ninguna alimenta el score: las claves o los valores no coinciden con el contrato. Abre "Opciones de integración" y compáralo.`
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
  const defectos = partes.length > 0 ? `Esta fuente ${partes.join('; ')}.` : null
  // La cobertura se informa aparte y en tono de oportunidad: preguntar más da
  // mejor perfil, pero también alarga el formulario. Lo decide el tenant.
  const cobertura = h.nuncaLlegan.length > 0
    ? `Podría calificar mejor si preguntara: ${h.nuncaLlegan.join(', ')}.`
    : null
  return [defectos, cobertura].filter(Boolean).join(' ') || null
}
