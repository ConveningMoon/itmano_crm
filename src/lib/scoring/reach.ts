import { BUY_DIMS, SELL_DIMS } from './vocabulary'
import { SCORE_BANDS } from './temperature-band'

// ── Alcance del scoring ───────────────────────────────────────────────────────
//
// Responde una pregunta que hoy nadie puede contestar mirando la pantalla de
// Ajustes: con ESTA configuración de puntos, ¿hasta dónde puede llegar un lead?
//
// Importa porque los puntos son ajustables por tenant pero las bandas
// (Caliente/Tibio/Nurturing) son globales y están fijas en el trigger de
// Postgres. Si alguien baja los puntos lo suficiente, la banda Caliente se
// vuelve inalcanzable y el pipeline se queda plano en "Nuevo" — sin ningún
// error, sin ninguna alerta. Este cálculo es esa alerta.
//
// Módulo PURO: lo llama el cliente en cada tecleo para dar feedback inmediato.

/** Forma mínima de una regla — sirve tanto para ScoreRule como para el borrador. */
export interface ReachRule {
  category:  'fit' | 'engagement' | 'manual'
  dimension: string
  points:    number
  isActive:  boolean
}

export type ReachWarningCode = 'hot_unreachable' | 'warm_unreachable' | 'saturated'

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

  if (reachable < SCORE_BANDS.warm) {
    warnings.push({
      code: 'warm_unreachable',
      message: `Ningún lead puede pasar de ${reachable} puntos, así que ni siquiera llegará a Tibio. Todo el pipeline se quedará en Nurturing o Nuevo.`,
    })
  } else if (reachable < SCORE_BANDS.hot) {
    warnings.push({
      code: 'hot_unreachable',
      message: `Ningún lead puede pasar de ${reachable} puntos, así que la banda Caliente queda inalcanzable y esa tarjeta siempre marcará cero.`,
    })
  }

  // Con el tope en 100, un techo muy por encima aplasta a leads muy distintos en
  // el mismo número y el orden por temperatura deja de discriminar.
  if (ceiling >= 150) {
    warnings.push({
      code: 'saturated',
      message: `El techo teórico es ${ceiling} y el score corta en 100: leads bastante distintos van a empatar arriba y el orden por temperatura perderá resolución.`,
    })
  }

  return { fitBuyer, fitSeller, bestFit, engagement, manual, ceiling, reachable, warnings }
}
