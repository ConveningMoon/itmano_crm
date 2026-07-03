'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { usePrefersReducedMotion } from '@/components/motion/use-prefers-reduced-motion'

interface MonthDataPoint {
  month: string
  leads: number
  nurturing: number
  hot: number
  closed: number
}

interface Props {
  data: MonthDataPoint[]
}

const tooltipStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  fontSize: '12px',
}

export function LeadsOverTimeChart({ data }: Props) {
  const reduced = usePrefersReducedMotion()
  const anim = {
    isAnimationActive: !reduced,
    animationBegin: 0,
    animationDuration: 700,
    animationEasing: 'ease-out' as const,
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fill: '#6B6860', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#6B6860', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend
          wrapperStyle={{ fontSize: '12px', color: 'var(--text-secondary)', paddingTop: '12px' }}
          iconSize={8}
          iconType="circle"
        />
        <Area
          {...anim}
          type="monotone"
          dataKey="leads"
          stackId="1"
          stroke="#C9A96E"
          fill="#C9A96E"
          fillOpacity={0.15}
          strokeWidth={2}
          name="Nuevos leads"
        />
        <Area
          {...anim}
          type="monotone"
          dataKey="nurturing"
          stackId="2"
          stroke="#5B8EC9"
          fill="#5B8EC9"
          fillOpacity={0.1}
          strokeWidth={2}
          name="En nurturing"
        />
        <Area
          {...anim}
          type="monotone"
          dataKey="hot"
          stackId="3"
          stroke="#E04040"
          fill="#E04040"
          fillOpacity={0.1}
          strokeWidth={2}
          name="Calientes"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
