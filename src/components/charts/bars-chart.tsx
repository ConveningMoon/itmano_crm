'use client'

import {
  Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { usePrefersReducedMotion } from '@/components/motion/use-prefers-reduced-motion'
import { GOLD_RAMP } from '@/lib/charts/palette'
import { AXIS_TICK, fmt, SeriesTooltip, useChartId } from './chart-shared'

const MAX_BAR_WIDTH = 56

// Barras verticales. La barra mayor lleva degradado, brillo y su valor encima; las
// demás, el dorado oscuro de la rampa. El tooltip y su zona de contacto abarcan
// toda la columna (no sólo la barra), así una barra baja o angosta sigue siendo
// fácil de tocar. `everyLabel`: una etiqueta de cada N, para ejes largos (30 días).
export function BarsChart({ data, unit, height, everyLabel = 1 }: {
  data:        { label: string; value: number; color?: string }[]
  unit:        string
  height:      number
  everyLabel?: number
}) {
  const reduced = usePrefersReducedMotion()
  const id = useChartId('bars')
  const max = data.reduce((m, d) => Math.max(m, d.value), 0)
  // Con todo en cero no hay "mayor": ninguna barra se destaca.
  const topIndex = max > 0 ? data.findIndex(d => d.value === max) : -1

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 22, right: 4, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id={`${id}-top`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor={GOLD_RAMP[3]} />
            <stop offset="0.6" stopColor={GOLD_RAMP[1]} />
            <stop offset="1" stopColor={GOLD_RAMP[0]} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="label"
          tick={AXIS_TICK}
          axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          tickLine={false}
          interval={Math.max(0, Math.floor(everyLabel) - 1)}
        />
        <YAxis hide domain={[0, 'dataMax']} />
        <Tooltip
          content={p => <SeriesTooltip {...p} unit={unit} />}
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
        />
        <Bar
          dataKey="value"
          name={unit}
          maxBarSize={MAX_BAR_WIDTH}
          radius={[6, 6, 0, 0]}
          minPointSize={4}
          isAnimationActive={!reduced}
          animationDuration={600}
          animationEasing="ease-out"
        >
          {data.map((d, i) => (
            <Cell
              key={`${d.label}-${i}`}
              fill={i === topIndex ? `url(#${id}-top)` : (d.color ?? GOLD_RAMP[3])}
              style={i === topIndex ? { filter: 'drop-shadow(0 0 8px rgba(221,185,104,0.5))' } : undefined}
            />
          ))}
          <LabelList
            dataKey="value"
            position="top"
            content={({ x, y, width, index, value }) =>
              index === topIndex ? (
                <text
                  x={Number(x) + Number(width) / 2}
                  y={Number(y) - 7}
                  textAnchor="middle"
                  fontSize={11.5}
                  fontWeight={600}
                  fill="var(--text-primary)"
                >
                  {fmt(Number(value))}
                </text>
              ) : null
            }
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
