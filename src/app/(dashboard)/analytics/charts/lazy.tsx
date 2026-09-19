'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

// Los cuatro gráficos de /analytics (y el del centro de control) traen recharts,
// que es el paquete de cliente más grande del CRM: ~110 kB gzip que el
// navegador descargaba, parseaba y ejecutaba ANTES de pintar la página, para
// unos dibujos que están por debajo de los KPIs y de la tabla.
//
// Con `ssr: false` el JS del gráfico se pide aparte y en paralelo: los números
// y las tablas salen con el primer HTML y el dibujo entra encima cuando su
// código llega. El hueco lo ocupa un skeleton de la MISMA altura que el
// ResponsiveContainer de cada gráfico, así que nada salta al aparecer.
//
// `ssr: false` (y no sólo la carga diferida) porque recharts mide el
// contenedor con el DOM: su render en servidor no dibuja nada útil y sí
// duplica el payload de la página.

function ChartFallback({ height }: { height: number }) {
  return (
    <div
      role="status"
      aria-label="Cargando gráfico"
      style={{ width: '100%', height: `${height}px`, display: 'flex', alignItems: 'flex-end', gap: '10px', padding: '12px 0' }}
    >
      {[0.45, 0.75, 0.55, 0.9, 0.65, 0.8].map((h, i) => (
        <Skeleton key={i} w="100%" h={Math.round(height * h * 0.8)} r={6} />
      ))}
    </div>
  )
}

export const LeadsDonutChart = dynamic(
  () => import('./leads-donut-chart').then(m => m.LeadsDonutChart),
  { ssr: false, loading: () => <ChartFallback height={260} /> },
)

export const LeadsByAgentChart = dynamic(
  () => import('./leads-by-agent-chart').then(m => m.LeadsByAgentChart),
  { ssr: false, loading: () => <ChartFallback height={220} /> },
)

export const LeadsOverTimeChart = dynamic(
  () => import('./leads-over-time-chart').then(m => m.LeadsOverTimeChart),
  { ssr: false, loading: () => <ChartFallback height={280} /> },
)

export const StageDistributionChart = dynamic(
  () => import('./stage-distribution-chart').then(m => m.StageDistributionChart),
  { ssr: false, loading: () => <ChartFallback height={220} /> },
)
