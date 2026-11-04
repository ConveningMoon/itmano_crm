'use client'

import { useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { usePrefersReducedMotion } from '@/components/motion/use-prefers-reduced-motion'
import { ChartTooltipBody, fmt } from './chart-shared'

function DonutTooltip({ active, payload, total }: TooltipContentProps & { total: number }) {
  const p = active ? payload?.[0] : undefined
  if (!p) return null
  const value = Number(p.value ?? 0)
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <ChartTooltipBody
      title={String(p.name ?? '')}
      rows={[{ name: `${pct}%`, color: String(p.payload?.color ?? ''), value: fmt(value) }]}
    />
  )
}

// Dona con leyenda propia: nombre y número al lado (la de recharts no alinea cifras).
// Pasar el cursor, o tocar una fila de la leyenda, atenúa el resto. El resumen en
// texto y el estado vacío los pone ChartFrame, en quien lo usa.
export function DonutChart({ data, centerValue, centerLabel }: {
  data:        { name: string; value: number; color: string }[]
  centerValue: string | number
  centerLabel: string
}) {
  const reduced = usePrefersReducedMotion()
  const [active, setActive] = useState<number | null>(null)
  const total = data.reduce((sum, d) => sum + d.value, 0)

  return (
    <div className="donut-block">
      <div className="donut-chart">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="68%"
              outerRadius="100%"
              paddingAngle={data.length > 1 ? 2 : 0}
              stroke="none"
              startAngle={90}
              endAngle={-270}
              isAnimationActive={!reduced}
              animationDuration={700}
              animationEasing="ease-out"
              onMouseEnter={(_, i) => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              {data.map((d, i) => (
                <Cell
                  key={d.name}
                  fill={d.color}
                  fillOpacity={active === null || active === i ? 1 : 0.35}
                />
              ))}
            </Pie>
            <Tooltip content={p => <DonutTooltip {...p} total={total} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center" aria-hidden="true">
          <b>{typeof centerValue === 'number' ? fmt(centerValue) : centerValue}</b>
          <span>{centerLabel}</span>
        </div>
      </div>
      <ul className="donut-legend">
        {data.map((d, i) => (
          <li
            key={d.name}
            data-dim={(active !== null && active !== i) || undefined}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
          >
            <s style={{ background: d.color }} />
            <span>{d.name}</span>
            <b>{fmt(d.value)}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}
