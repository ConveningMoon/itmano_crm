'use client'

import dynamic from 'next/dynamic'

// recharts es el paquete de cliente más grande del CRM (~110 kB gzip). Sólo las
// gráficas que lo usan pasan por aquí: se piden aparte y en paralelo, así los
// números y las tablas salen con el primer HTML y el dibujo entra encima cuando
// llega su código. `ssr: false` porque recharts mide el contenedor con el DOM; su
// render en servidor no dibuja nada útil y sí duplica el payload.
//
// El embudo, el anillo, la lista de barras y la minigráfica son SVG/HTML de
// servidor y NO se importan por aquí.
//
// `loading` no recibe las props del componente, así que el hueco toma su altura
// del contenedor (`--chart-h`): el skeleton ocupa lo mismo que la gráfica y nada
// salta cuando ésta aparece.

const BAR_HEIGHTS = [0.45, 0.75, 0.55, 0.9, 0.65, 0.8, 0.5]

function ChartFallback() {
  return (
    <div role="status" aria-label="Cargando gráfico" className="chart-skeleton">
      {BAR_HEIGHTS.map((h, i) => (
        <div key={i} className="skeleton" style={{ height: `${Math.round(h * 80)}%`, borderRadius: 6 }} />
      ))}
    </div>
  )
}

function DonutFallback() {
  return (
    <div role="status" aria-label="Cargando gráfico" className="donut-block">
      <div className="donut-chart"><div className="skeleton chart-skeleton-ring" /></div>
      <div className="donut-legend">
        {[78, 64, 70, 52].map((w, i) => (
          <div key={i} className="skeleton" style={{ height: 12, width: `${w}%`, borderRadius: 6 }} />
        ))}
      </div>
    </div>
  )
}

const AreaChartImpl = dynamic(
  () => import('./area-chart').then(m => m.AreaChart),
  { ssr: false, loading: () => <ChartFallback /> },
)
const BarsChartImpl = dynamic(
  () => import('./bars-chart').then(m => m.BarsChart),
  { ssr: false, loading: () => <ChartFallback /> },
)
const DonutChartImpl = dynamic(
  () => import('./donut-chart').then(m => m.DonutChart),
  { ssr: false, loading: () => <DonutFallback /> },
)

const AiUsageDailyChartImpl = dynamic(
  () => import('./ai-usage-chart').then(m => m.AiUsageDailyChart),
  { ssr: false, loading: () => <div className="chart-slot" style={slot(240)}><ChartFallback /></div> },
)

type AreaProps = React.ComponentProps<typeof AreaChartImpl>
type BarsProps = React.ComponentProps<typeof BarsChartImpl>
type DonutProps = React.ComponentProps<typeof DonutChartImpl>

function slot(height: number): React.CSSProperties {
  return { '--chart-h': `${height}px`, minHeight: `${height}px` } as React.CSSProperties
}

export function AreaChart(props: AreaProps) {
  return <div className="chart-slot" style={slot(props.height)}><AreaChartImpl {...props} /></div>
}

export function BarsChart(props: BarsProps) {
  return <div className="chart-slot" style={slot(props.height)}><BarsChartImpl {...props} /></div>
}

export function DonutChart(props: DonutProps) {
  return <DonutChartImpl {...props} />
}

export function AiUsageDailyChart(props: React.ComponentProps<typeof AiUsageDailyChartImpl>) {
  return <AiUsageDailyChartImpl {...props} />
}
