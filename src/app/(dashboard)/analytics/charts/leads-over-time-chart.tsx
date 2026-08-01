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

// Cohortes: el mes es el de ALTA del lead, la etapa es la de HOY. Las cinco
// series suman el total del mes porque un lead está en exactamente una etapa —
// por eso van apiladas de verdad (un solo stackId). Antes cada área tenía el
// suyo, así que se superponían y el eje no significaba nada.
interface MonthDataPoint {
  month:     string
  nuevo:     number
  nutricion: number
  enProceso: number
  cerrado:   number
  perdido:   number
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
  // Hex literal como en el resto de charts: recharts no resuelve CSS variables.
  const series = [
    { key: 'nuevo',     name: 'Nuevo',        color: '#5B8EC9' },
    { key: 'nutricion', name: 'En nutrición', color: '#C9A96E' },
    { key: 'enProceso', name: 'En proceso',   color: '#9B72CF' },
    { key: 'cerrado',   name: 'Cerrado',      color: '#6BA368' },
    { key: 'perdido',   name: 'Perdido',      color: '#6B6860' },
  ]
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
        {series.map(s => (
          <Area
            key={s.key}
            {...anim}
            type="monotone"
            dataKey={s.key}
            stackId="a"
            stroke={s.color}
            fill={s.color}
            fillOpacity={0.18}
            strokeWidth={2}
            name={s.name}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}
