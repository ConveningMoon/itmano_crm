// Colores de las gráficas: la única definición. Son hex y no tokens porque recharts
// los recibe como atributos de SVG. Deben coincidir con --gold-1 a --gold-5 de
// globals.css.
export const GOLD_RAMP = ['#F8E7BC', '#DDB968', '#B08D45', '#8A6E38', '#6F5A34'] as const

// Perdido no es un punto de la escala de etapas: es una salida del embudo.
export const LOST_COLOR = '#A89878'

const MAX_CATEGORIES = 5

/**
 * Una dona deja de leerse con más de 5 categorías en una sola familia de color:
 * las menores se suman en "Otras", sin perder conteos.
 */
export function foldCategories<T extends { name: string; value: number }>(
  rows: T[],
  max: number = MAX_CATEGORIES,
): { name: string; value: number }[] {
  const sorted = [...rows]
    .sort((a, b) => b.value - a.value)
    .map(({ name, value }) => ({ name, value }))
  if (sorted.length <= max) return sorted

  const kept = sorted.slice(0, max - 1)
  const others = sorted.slice(max - 1).reduce((sum, row) => sum + row.value, 0)
  return [...kept, { name: 'Otras', value: others }]
}

/**
 * El equivalente de foldCategories para series apiladas: decide qué series conservar
 * según su total y cuáles se suman en "Otras". En un empate decide el nombre, para
 * que una serie no cambie de tono entre cargas.
 */
export function foldSeriesKeys(
  totals: Record<string, number>,
  max: number = MAX_CATEGORIES,
): { kept: string[]; folded: string[] } {
  const keys = Object.keys(totals).sort((a, b) => totals[b] - totals[a] || a.localeCompare(b))
  if (keys.length <= max) return { kept: keys, folded: [] }
  return { kept: keys.slice(0, max - 1), folded: keys.slice(max - 1) }
}

/**
 * Asigna la rampa siguiendo una lista estable de claves, para que el color siga a
 * la categoría y no a su rango: filtrar no debe repintar a las que quedan.
 */
export function colorsByKey(stableKeys: string[]): Record<string, string> {
  return Object.fromEntries(
    stableKeys.map((key, i) => [key, GOLD_RAMP[Math.min(i, GOLD_RAMP.length - 1)]]),
  )
}
