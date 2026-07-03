'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { usePrefersReducedMotion } from '@/components/motion/use-prefers-reduced-motion'

interface StatusDataPoint {
  agent: string
  new: number
  nurturing: number
  warm: number
  hot: number
  process: number
  closed: number
}

interface Props {
  data: StatusDataPoint[]
}

const tooltipStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  fontSize: '12px',
}

export function StatusDistributionChart({ data }: Props) {
  const reduced = usePrefersReducedMotion()
  const anim = {
    isAnimationActive: !reduced,
    animationBegin: 0,
    animationDuration: 700,
    animationEasing: 'ease-out' as const,
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} barSize={18} margin={{ left: -16, top: 8 }}>
        <XAxis
          dataKey="agent"
          tick={{ fill: '#A09D95', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#6B6860', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <Legend
          wrapperStyle={{ fontSize: '11px', color: 'var(--text-secondary)', paddingTop: '8px' }}
          iconSize={8}
          iconType="square"
        />
        <Bar {...anim} dataKey="new"       stackId="a" fill="#5B8EC9" name="Nuevo"      radius={[0, 0, 0, 0]} />
        <Bar {...anim} dataKey="nurturing" stackId="a" fill="#C9A96E" name="Nurturing"  />
        <Bar {...anim} dataKey="warm"      stackId="a" fill="#E07B3A" name="Tibio"      />
        <Bar {...anim} dataKey="hot"       stackId="a" fill="#E04040" name="Caliente"   />
        <Bar {...anim} dataKey="process"   stackId="a" fill="#9B72CF" name="En Proceso" />
        <Bar {...anim} dataKey="closed"    stackId="a" fill="#6BA368" name="Cerrado"    radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
