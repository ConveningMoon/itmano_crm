'use client'

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, Label } from 'recharts'
import { usePrefersReducedMotion } from '@/components/motion/use-prefers-reduced-motion'
import { colorsByKey, foldCategories } from '@/lib/charts/palette'

interface DataPoint {
  name: string
  value: number
}

interface Props {
  data: DataPoint[]
  total: number
}

const tooltipStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  fontSize: '12px',
}

interface CenterLabelProps {
  viewBox?: { cx?: number; cy?: number }
  total: number
}

function CenterLabel({ viewBox, total }: CenterLabelProps) {
  const cx = viewBox?.cx ?? 0
  const cy = viewBox?.cy ?? 0
  return (
    <g>
      <text x={cx} y={cy - 6} textAnchor="middle" dominantBaseline="middle" fill="#E8E6E1" fontSize={26} fontWeight={600}>
        {total}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" dominantBaseline="middle" fill="#8A877F" fontSize={12}>
        leads
      </text>
    </g>
  )
}

export function LeadsDonutChart({ data, total }: Props) {
  const reduced = usePrefersReducedMotion()
  const rows = foldCategories(data)
  const colors = colorsByKey(rows.map(r => r.name))
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={rows}
          cx="50%"
          cy="45%"
          innerRadius={68}
          outerRadius={100}
          paddingAngle={3}
          dataKey="value"
          isAnimationActive={!reduced}
          animationBegin={0}
          animationDuration={700}
          animationEasing="ease-out"
        >
          {rows.map(r => (
            <Cell key={r.name} fill={colors[r.name]} />
          ))}
          <Label
            content={(props) => <CenterLabel viewBox={props.viewBox as { cx?: number; cy?: number }} total={total} />}
            position="center"
          />
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend
          iconSize={8}
          iconType="circle"
          wrapperStyle={{ fontSize: '12px', color: 'var(--text-secondary)', paddingTop: '8px' }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
