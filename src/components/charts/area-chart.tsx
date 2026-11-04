'use client'

import {
  Area, AreaChart as RAreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { usePrefersReducedMotion } from '@/components/motion/use-prefers-reduced-motion'
import { AXIS_TICK, GRID_STROKE, SeriesTooltip, useChartId } from './chart-shared'

// Área con línea dorada, degradado hacia transparente y un brillo suave. Las series
// se dibujan superpuestas (no apiladas): cada una es su propia cuenta. Si una
// tarjeta necesita una composición que suma un total, es una dona o una barra.
// El resumen en texto y el estado vacío los pone ChartFrame, en quien lo usa.
export function AreaChart({ data, series, height }: {
  data:   { label: string; [k: string]: string | number }[]
  series: { key: string; name: string; color: string }[]
  height: number
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
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
          <Tooltip
            content={p => <SeriesTooltip {...p} />}
            cursor={{ stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1 }}
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
