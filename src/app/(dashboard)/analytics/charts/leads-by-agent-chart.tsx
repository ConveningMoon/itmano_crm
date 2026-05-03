'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface AgentDataPoint {
  name: string
  fullName: string
  total: number
  hot: number
  closed: number
  color: string
}

interface Props {
  data: AgentDataPoint[]
}

const tooltipStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  fontSize: '12px',
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ payload: AgentDataPoint }>
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{ ...tooltipStyle, padding: '8px 12px' }}>
      <div style={{ fontWeight: 500, marginBottom: '4px', color: 'var(--text-primary)' }}>{d.fullName}</div>
      <div style={{ color: 'var(--text-secondary)' }}>Total: {d.total}</div>
      <div style={{ color: '#E04040' }}>Calientes: {d.hot}</div>
      <div style={{ color: '#6BA368' }}>Cerrados: {d.closed}</div>
    </div>
  )
}

export function LeadsByAgentChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 0 }}>
        <XAxis
          type="number"
          tick={{ fill: '#6B6860', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: '#A09D95', fontSize: 13 }}
          axisLine={false}
          tickLine={false}
          width={70}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <Bar dataKey="total" radius={[0, 4, 4, 0]} barSize={20}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
