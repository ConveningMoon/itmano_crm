'use client'

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, Label } from 'recharts'
import { usePrefersReducedMotion } from '@/components/motion/use-prefers-reduced-motion'

interface DataPoint {
  name: string
  value: number
  emoji: string
}

interface Props {
  data: DataPoint[]
  total: number
}

const DONUT_COLORS = ['#C9A96E', '#5B8EC9', '#5AAFA0', '#C97B6B', '#B87BA3', '#6BA368']

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
      <text x={cx} y={cy + 14} textAnchor="middle" dominantBaseline="middle" fill="#6B6860" fontSize={12}>
        leads
      </text>
    </g>
  )
}

export function LeadsDonutChart({ data, total }: Props) {
  const reduced = usePrefersReducedMotion()
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
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
          {data.map((_, i) => (
            <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
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
