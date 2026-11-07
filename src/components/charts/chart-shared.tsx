'use client'

import { useId } from 'react'
import type { TooltipContentProps } from 'recharts'
import { CHART_TEXT } from '@/lib/charts/palette'

// Piezas que comparten las gráficas de recharts. Sólo las importan componentes
// cliente que ya viven detrás de lazy.tsx.

export const AXIS_TICK = { fill: CHART_TEXT.muted, fontSize: 11 } as const
export const GRID_STROKE = 'rgba(255,255,255,0.06)'

export const fmt = (n: number) => n.toLocaleString('en-US')

/** Siempre dos decimales: series con fracciones, como USD. */
export const fmtDecimals = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** id estable para <defs>: useId trae ":" y eso rompe url(#...) en algunos navegadores. */
export function useChartId(prefix: string): string {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
}

export interface TooltipRow {
  name:  string
  color: string
  value: string
}

/** Tooltip con tokens (fondo, borde y sombra de las superficies elevadas). */
export function ChartTooltipBody({ title, rows }: { title?: string; rows: TooltipRow[] }) {
  return (
    <div className="chart-tooltip">
      {title && <div className="chart-tooltip-title">{title}</div>}
      {rows.map(r => (
        <div key={r.name} className="chart-tooltip-row">
          <s style={{ background: r.color }} />
          <span>{r.name}</span>
          <b>{r.value}</b>
        </div>
      ))}
    </div>
  )
}

/**
 * Contenido de <Tooltip> para series numéricas: una fila por serie visible.
 * `format` cambia cómo se escribe el valor (por defecto, entero con separadores).
 */
export function SeriesTooltip({ active, payload, label, unit, format = fmt }: TooltipContentProps & {
  unit?:   string
  format?: (n: number) => string
}) {
  if (!active || !payload?.length) return null
  const rows = payload.map(p => ({
    name:  String(p.name ?? ''),
    color: String(p.color ?? p.stroke ?? p.payload?.color ?? 'currentColor'),
    value: `${format(Number(p.value ?? 0))}${unit ? ` ${unit}` : ''}`,
  }))
  return <ChartTooltipBody title={label == null ? undefined : String(label)} rows={rows} />
}
