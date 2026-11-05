'use client'

import {
  Area, AreaChart as RAreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { usePrefersReducedMotion } from '@/components/motion/use-prefers-reduced-motion'
import type { TooltipContentProps } from 'recharts'
import { AXIS_TICK, ChartTooltipBody, GRID_STROKE, fmt, useChartId } from './chart-shared'

// Área con línea dorada, degradado hacia transparente y un brillo suave. Las series
// se dibujan superpuestas (no apiladas): cada una es su propia cuenta. Si una
// tarjeta necesita una composición que suma un total, es una dona o una barra.
// El resumen en texto y el estado vacío los pone ChartFrame, en quien lo usa.
// `decimals` es para series con fracciones (p. ej. USD): el eje admite decimales y
// el tooltip siempre muestra 2. `unit` se pega al valor del tooltip.
const fmtDecimals = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function AreaTooltip({ active, payload, label, unit, decimals }: TooltipContentProps & { unit?: string; decimals: boolean }) {
  if (!active || !payload?.length) return null
  const format = decimals ? fmtDecimals : fmt
  const rows = payload.map(p => ({
    name:  String(p.name ?? ''),
    color: String(p.color ?? p.stroke ?? p.payload?.color ?? 'currentColor'),
    value: `${format(Number(p.value ?? 0))}${unit ? ` ${unit}` : ''}`,
  }))
  return <ChartTooltipBody title={label == null ? undefined : String(label)} rows={rows} />
}

export function AreaChart({ data, series, height, unit, decimals = false }: {
  data:   { label: string; [k: string]: string | number }[]
  series: { key: string; name: string; color: string }[]
  height: number
  unit?:  string
  decimals?: boolean
}) {
  const reduced = usePrefersReducedMotion()
  const id = useChartId('area')

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <RAreaChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -16 }}>
          <defs>
            {series.map(s => (
              <linearGradient key={s.key} id={`${id}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={s.color} stopOpacity={0.32} />
                <stop offset="1" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={decimals} width={44} />
          <Tooltip
            content={p => <AreaTooltip {...p} unit={unit} decimals={decimals} />}
            cursor={{ stroke: 'var(--border-hover)', strokeWidth: 1 }}
          />
          {series.map(s => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2.5}
              strokeLinecap="round"
              fill={`url(#${id}-${s.key})`}
              activeDot={{ r: 5, stroke: 'var(--bg-surface)', strokeWidth: 2 }}
              style={{ filter: `drop-shadow(0 0 5px ${s.color}66)` }}
              isAnimationActive={!reduced}
              animationDuration={700}
              animationEasing="ease-out"
            />
          ))}
        </RAreaChart>
      </ResponsiveContainer>
      {series.length > 1 && (
        <div className="chart-legend">
          {series.map(s => (
            <span key={s.key}><s style={{ background: s.color }} />{s.name}</span>
          ))}
        </div>
      )}
    </div>
  )
}
