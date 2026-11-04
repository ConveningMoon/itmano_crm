// Minigráfica de tendencia para una KpiCard. Server Component: sólo emite SVG.
// Es decorativa (aria-hidden): la cifra de la tarjeta ya dice lo importante.

const VIEW_W = 62
const VIEW_H = 20
const PAD = 2 // que el trazo y el punto final no se recorten en el borde

/**
 * Puntos [x, y] en el espacio del SVG. El valor mayor queda arriba. Sin variación
 * (un solo valor o todos iguales) la línea va a media altura en vez de dividir
 * entre cero; sin valores, no hay puntos.
 */
export function sparklinePoints(values: number[], width: number, height: number): [number, number][] {
  const n = values.length
  if (n === 0) return []

  const min = Math.min(...values)
  const range = Math.max(...values) - min
  const usable = Math.max(0, height - PAD * 2)

  return values.map((v, i): [number, number] => {
    const x = n === 1 ? width / 2 : PAD + (i * (width - PAD * 2)) / (n - 1)
    const y = range === 0 ? height / 2 : PAD + (1 - (v - min) / range) * usable
    return [x, y]
  })
}

export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const points = sparklinePoints(values, VIEW_W, VIEW_H)
  const [lastX, lastY] = points[points.length - 1]

  return (
    <svg className="spark" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} aria-hidden="true">
      <polyline
        className="spark-line"
        points={points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
        fill="none"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle className="spark-dot" cx={lastX} cy={lastY} r={2} />
    </svg>
  )
}
