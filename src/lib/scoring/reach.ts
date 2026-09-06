import { BUY_DIMS, SELL_DIMS } from './vocabulary'
import { QUALITY_CUTS } from './score-bands'

// ── Alcance del scoring ───────────────────────────────────────────────────────
//
// Responde una pregunta que hoy nadie puede contestar mirando la pantalla de
// Ajustes: con ESTA configuración de puntos, ¿hasta dónde puede llegar un lead?
//
// Importa porque los puntos son ajustables pero los cortes de banda están fijos.
// Si alguien baja los puntos lo suficiente, la banda Alta se vuelve inalcanzable
// y toda la cartera se aplasta abajo — sin ningún error, sin ninguna alerta.
// Este cálculo es esa alerta.
//
// Módulo PURO: lo llama el cliente en cada tecleo para dar feedback inmediato.

/** Forma mínima de una regla — sirve tanto para ScoreRule como para el borrador. */
export interface ReachRule {
  category:  'fit' | 'engagement' | 'manual'
  dimension: string
  points:    number
  isActive:  boolean
}

export type ReachWarningCode = 'alta_unreachable' | 'media_unreachable' | 'saturated'

export interface ReachWarning {
  code:    ReachWarningCode
  message: string
}

export interface ScoreReach {
  /** Mejor fit posible por el camino de comprador. */
  fitBuyer:   number
  /** Mejor fit posible por el camino de vendedor. */
  fitSeller:  number
  /** El mayor de los dos: un lead es comprador O vendedor, nunca ambos. */
  bestFit:    number
  /** Suma de las señales de engagement positivas (un lead que hizo de todo). */
  engagement: number
  /** Suma de las acciones manuales positivas. */
  manual:     number
  /** Total teórico antes del tope. */
  ceiling:    number
  /** Lo que realmente puede mostrar un lead, con el clamp a 100. */
  reachable:  number
  warnings:   ReachWarning[]
}

/**
 * Mejor puntaje alcanzable en una dimensión de fit. Cada dimensión aporta UNA
 * vez (el lead declara un solo bucket), así que es el máximo entre sus reglas
 * activas — y nunca negativo: si todas las opciones restan, el lead simplemente
 * no declara nada en esa dimensión y no suma ni resta.
 */
function bestForDimension(rules: ReachRule[], dimension: string): number {
  const active = rules.filter(r => r.category === 'fit' && r.dimension === dimension && r.isActive)
  if (active.length === 0) return 0
  return Math.max(0, ...active.map(r => r.points))
}

/** Suma de los puntos positivos de una categoría acumulativa. */
function sumPositive(rules: ReachRule[], category: 'engagement' | 'manual'): number {
  return rules
    .filter(r => r.category === category && r.isActive && r.points > 0)
    .reduce((sum, r) => sum + r.points, 0)
}

export function computeScoreReach(rules: ReachRule[]): ScoreReach {
  const fitBuyer  = BUY_DIMS.reduce((sum, d) => sum + bestForDimension(rules, d), 0)
  const fitSeller = SELL_DIMS.reduce((sum, d) => sum + bestForDimension(rules, d), 0)
  const bestFit   = Math.max(fitBuyer, fitSeller)

  const engagement = sumPositive(rules, 'engagement')
  const manual     = sumPositive(rules, 'manual')

  const ceiling   = bestFit + engagement + manual
  const reachable = Math.max(0, Math.min(100, ceiling))

  const warnings: ReachWarning[] = []

  if (reachable < QUALITY_CUTS.media) {
    warnings.push({
      code: 'media_unreachable',
      message: `Ningún lead puede pasar de ${reachable} puntos, así que ninguno llegará siquiera a calidad Media. Toda la cartera se verá igual de mala.`,
    })
  } else if (reachable < QUALITY_CUTS.alta) {
    warnings.push({
      code: 'alta_unreachable',
      message: `Ningún lead puede pasar de ${reachable} puntos, así que la banda Alta queda inalcanzable y la tarjeta de calidad alta siempre marcará cero.`,
    })
  }

  // Con el tope en 100, un techo muy por encima aplasta a leads muy distintos en
  // el mismo número y el orden por calidad deja de discriminar. El aviso NO
  // lidera con el techo crudo: ese número (que puede pasar de 200) no le dice
  // nada a nadie. Lo que importa es la consecuencia.
  if (ceiling >= 150) {
    warnings.push({
      code: 'saturated',
      message: 'Un lead que acumule varias señales desborda el tope de 100 con holgura, así que leads bastante distintos van a empatar arriba y el orden por calidad perderá resolución. Considera bajar los puntos de las señales acumulativas.',
    })
  }

  return { fitBuyer, fitSeller, bestFit, engagement, manual, ceiling, reachable, warnings }
}
