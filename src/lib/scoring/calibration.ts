import { BUY_DIMS } from './vocabulary'

// ── Calibración del fit por mercado ───────────────────────────────────────────
//
// El modelo de puntos es de ITMANO y es el mismo para todos. Lo que SÍ cambia
// entre mercados es cuál de los factores predice de verdad un cierre: en un
// mercado con mucho comprador militar la preaprobación manda; en otro con
// inversores el horizonte de compra dice poco y el presupuesto todo.
//
// Pedirle a nadie que escriba números es pedirle que invente. Lo que sí sabe
// contestar el dueño de una agencia es un ORDEN: qué le importa más. Esta
// calibración toma ese orden y reasigna los MÁXIMOS que ya existen en el modelo
// global entre las dimensiones, sin inventar valores nuevos.
//
// Dos invariantes, y las dos importan:
//
//   1. El multiconjunto de máximos no cambia, así que el techo del fit por el
//      camino de compra queda IDÉNTICO. Las bandas de calidad y el panel de
//      alcance no se mueven — reordenar no puede volver inalcanzable la banda
//      Alta, que es el fallo silencioso que `reach.ts` existe para atrapar.
//
//   2. Los puntos NEGATIVOS no se escalan. Son penalizaciones calibradas por su
//      propio motivo ("ya trabaja con otro agente" resta 15 porque ese lead es
//      difícil, no porque esa dimensión pese poco). Escalarlas junto al máximo
//      convertiría un -15 en un -90 al subir la dimensión de rango.
//
// Módulo PURO: el panel de Ajustes lo llama en cada cambio para previsualizar.

// ── Forma de la evidencia ─────────────────────────────────────────────────────
// Vive aquí, en el módulo puro, y no junto a la consulta: el panel de Ajustes es
// un componente de cliente y `data/fit-evidence.ts` es server-only. Importar de
// allí una constante (no sólo un tipo) rompe el build — los tipos se borran al
// compilar, los valores no.

/** Cierres con perfil de fit por debajo de los cuales la evidencia no significa nada. */
export const MIN_CLOSES_FOR_EVIDENCE = 50

export interface BucketEvidence {
  matchValue: string
  leads:      number
  closed:     number
  /** % de cierre del bucket. null si no hay leads que lo hayan declarado. */
  closeRate:  number | null
}

export interface DimensionEvidence {
  dimension: string
  buckets:   BucketEvidence[]
  /**
   * Cuánto separa esta dimensión: diferencia en puntos porcentuales entre su
   * mejor y su peor bucket. null sin muestra suficiente.
   */
  spread:    number | null
}

export interface FitEvidence {
  /** Leads con algo declarado en fit_profile. */
  withFit:       number
  /** De esos, los que llegaron a `cerrado`. Es lo que hace falta acumular. */
  closedWithFit: number
  enough:        boolean
  dimensions:    DimensionEvidence[]
}

export interface CalibrationRule {
  category:   'fit' | 'engagement' | 'manual'
  dimension:  string
  matchValue: string | null
  points:     number
  isActive:   boolean
}

export interface CalibratedPoint {
  dimension:  string
  matchValue: string
  /** Puntos actuales, para poder mostrar el antes y el después. */
  from:       number
  to:         number
}

/** Máximo alcanzable de una dimensión de fit — lo mismo que mide `reach.ts`. */
function maxOf(rules: CalibrationRule[], dimension: string): number {
  const activos = rules.filter(r => r.category === 'fit' && r.dimension === dimension && r.isActive)
  if (activos.length === 0) return 0
  return Math.max(0, ...activos.map(r => r.points))
}

/**
 * Las dimensiones de compra que tiene sentido ordenar: las que suman algo.
 *
 * `property_use` queda fuera a propósito — sus tres opciones valen 0 desde la
 * migración 077 (para qué usará la propiedad no predice el cierre, sólo cambia
 * el discurso). Una dimensión que no suma no se puede escalar a un máximo nuevo,
 * y meterla en el orden sugeriría que darle prioridad hace algo.
 */
export function calibratableDimensions(rules: CalibrationRule[]): string[] {
  return BUY_DIMS.filter(d => maxOf(rules, d) > 0)
}

/** El orden vigente: las dimensiones calibrables de mayor a menor peso. */
export function currentOrder(rules: CalibrationRule[]): string[] {
  return calibratableDimensions(rules)
    .map(d => ({ d, max: maxOf(rules, d) }))
    .sort((a, b) => b.max - a.max || a.d.localeCompare(b.d))
    .map(x => x.d)
}

/**
 * Reasigna los máximos existentes según `order` y devuelve SÓLO los puntos que
 * cambian de valor.
 *
 * `order` debe ser una permutación de las dimensiones calibrables; lo que falte
 * se añade al final en su orden actual, así que una lista parcial no rompe nada.
 */
export function recalibrate(rules: CalibrationRule[], order: string[]): CalibratedPoint[] {
  const calibrables = calibratableDimensions(rules)
  const orden = [
    ...order.filter(d => calibrables.includes(d)),
    ...currentOrder(rules).filter(d => !order.includes(d)),
  ]
  // Los máximos disponibles, de mayor a menor: es el conjunto que se reparte.
  const maximos = calibrables.map(d => maxOf(rules, d)).sort((a, b) => b - a)

  const salida: CalibratedPoint[] = []
  orden.forEach((dimension, i) => {
    const objetivo = maximos[i]
    const actual   = maxOf(rules, dimension)
    if (objetivo === undefined) return

    const dela = rules
      .filter(r => r.category === 'fit' && r.dimension === dimension && r.matchValue !== null)
      // De mayor a menor: el primero no negativo se lleva el máximo exacto (sin
      // redondeo), y los siguientes conservan su proporción respecto a él.
      .sort((a, b) => b.points - a.points)

    let cima = true
    for (const r of dela) {
      if (r.points < 0) continue
      const nuevo = cima ? objetivo : Math.round((r.points * objetivo) / actual)
      cima = false
      if (nuevo !== r.points) {
        salida.push({ dimension, matchValue: r.matchValue!, from: r.points, to: nuevo })
      }
    }
  })
  return salida
}

// ── Calibración automática ────────────────────────────────────────────────────
//
// El orden de los factores deja de depender de que alguien mueva flechas: el
// cron diario lo ajusta solo cuando hay evidencia. Con barandas, porque una
// agencia cierra pocas operaciones y el ruido de una semana no debe reordenar
// el modelo:
//
//   - Sin MIN_CLOSES_FOR_EVIDENCE cierres con perfil no se toca nada.
//   - Como mucho una vez cada AUTO_CALIBRATION_COOLDOWN_DAYS días (cuenta
//     también una calibración manual o un restablecimiento).
//   - Un factor adelanta a otro sólo si separa al menos
//     AUTO_CALIBRATION_MIN_GAP_PP puntos porcentuales más. Las diferencias
//     menores son ruido y conservan el orden vigente (ordenamiento estable).
//
// Un factor sin muestra suficiente (spread null) no sube, pero sí puede ser
// adelantado por uno que demuestre separar. No se limita a "un puesto por
// pasada": varios factores valen lo mismo (5), y un factor atascado detrás de
// sus iguales nunca llegaría a moverse.

export const AUTO_CALIBRATION_MIN_GAP_PP = 5
export const AUTO_CALIBRATION_COOLDOWN_DAYS = 7

export type AutoCalibrationPlan =
  | { apply: true; before: string[]; after: string[]; changes: CalibratedPoint[] }
  | { apply: false; reason: 'sin_evidencia' | 'reciente' | 'sin_cambios' }

export function planAutoCalibration(args: {
  /** Reglas EFECTIVAS del tenant (globales con sus overrides): el estado actual. */
  effective:   CalibrationRule[]
  /** Reglas GLOBALES: la base sobre la que se reparten los máximos. */
  global:      CalibrationRule[]
  evidence:    FitEvidence
  lastCalibrationAt: Date | null
  now:         Date
}): AutoCalibrationPlan {
  const { effective, global, evidence, lastCalibrationAt, now } = args
  if (!evidence.enough) return { apply: false, reason: 'sin_evidencia' }

  if (lastCalibrationAt) {
    const dias = (now.getTime() - lastCalibrationAt.getTime()) / 86_400_000
    if (dias < AUTO_CALIBRATION_COOLDOWN_DAYS) return { apply: false, reason: 'reciente' }
  }

  const before = currentOrder(effective)
  const spread = new Map(evidence.dimensions.map(d => [d.dimension, d.spread]))

  // Inserción con umbral: cada factor sube mientras separe claramente más que
  // el que tiene encima.
  const after: string[] = []
  for (const d of before) {
    const propio = spread.get(d) ?? null
    let i = after.length
    while (i > 0 && propio !== null && propio - (spread.get(after[i - 1]) ?? 0) >= AUTO_CALIBRATION_MIN_GAP_PP) i--
    after.splice(i, 0, d)
  }

  if (after.join() === before.join()) return { apply: false, reason: 'sin_cambios' }

  // Dos factores con el mismo máximo (varios valen 5) pueden intercambiarse sin
  // que cambie un solo punto. Si el resultado es idéntico a lo vigente no hay
  // nada que aplicar: si no, el cron registraría la misma "calibración" vacía
  // cada semana.
  const changes = recalibrate(global, after)
  const objetivo = new Map(
    global.filter(r => r.category === 'fit' && r.matchValue !== null)
      .map(r => [`${r.dimension}|${r.matchValue}`, r.points]),
  )
  for (const c of changes) objetivo.set(`${c.dimension}|${c.matchValue}`, c.to)
  const igual = effective
    .filter(r => r.category === 'fit' && r.matchValue !== null)
    .every(r => objetivo.get(`${r.dimension}|${r.matchValue}`) === r.points)
  if (igual) return { apply: false, reason: 'sin_cambios' }

  return { apply: true, before, after, changes }
}
