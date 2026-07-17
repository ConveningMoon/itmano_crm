'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { usePrefersReducedMotion } from '@/components/motion/use-prefers-reduced-motion'
import type { AiDailySeries } from '@/lib/data/ai-usage'

// Diagrama del Centro de control: costo diario de IA (últimos 30 días),
// apilado por tenant. Reemplaza al listado plano de requests recientes — el
// dato operativo importante es CUÁNTO se gasta, DÓNDE y su tendencia.
// Client-only (recharts); recibe la serie ya agregada del server.

// Paleta fija por posición (hex, como los demás charts — recharts pinta SVG).
const SERIES_COLORS = ['#C9A96E', '#5B8EC9', '#5AAFA0', '#C97B6B', '#B87BA3', '#6BA368']

function fmtCost(v: number): string {
  if (v === 0) return '$0.00'
  if (v < 0.01) return `$${v.toFixed(4)}`
  if (v < 1) return `$${v.toFixed(3)}`
  return `$${v.toFixed(2)}`
}

function fmtDay(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-419', { day: 'numeric', month: 'short' })
}

interface TooltipEntry { name: string; value: number; color: string }

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + p.value, 0)
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: 'var(--text-primary)',
    }}>
      <div style={{ fontWeight: 500, marginBottom: '4px' }}>{label ? fmtDay(label) : ''}</div>
      {payload.filter(p => p.value > 0).map(p => (
        <div key={p.name} style={{ color: 'var(--text-secondary)' }}>
          <span style={{ color: p.color }}>●</span> {p.name}: {fmtCost(p.value)}
        </div>
      ))}
      <div style={{ marginTop: '4px', color: 'var(--accent-gold)', fontWeight: 500 }}>Total: {fmtCost(total)}</div>
    </div>
  )
}

export function AiUsageDailyChart({ series }: { series: AiDailySeries }) {
  const reduced = usePrefersReducedMotion()

  const data = series.days.map(d => ({
    date: d.date,
    requests: d.requests,
    ...Object.fromEntries(series.tenantNames.map(name => [name, d.byTenant[name] ?? 0])),
  }))

  const hasData = series.days.some(d => d.costUsd > 0)

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      borderRadius: '12px', overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
        Costo diario de IA · últimos 30 días
      </div>
      {!hasData ? (
        <div style={{ padding: '28px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
          Sin uso de IA en los últimos 30 días.
        </div>
      ) : (
        <div style={{ padding: '16px 12px 8px' }}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} margin={{ left: 4, right: 12, top: 4, bottom: 0 }}>
              <XAxis
                dataKey="date"
                tickFormatter={fmtDay}
                tick={{ fill: '#6B6860', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={28}
              />
              <YAxis
                tickFormatter={(v: number) => `$${v}`}
                tick={{ fill: '#6B6860', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Legend
                wrapperStyle={{ fontSize: '11px', color: '#A09D95' }}
                iconType="circle"
                iconSize={7}
              />
              {series.tenantNames.map((name, i) => (
                <Bar
                  key={name}
                  dataKey={name}
                  stackId="cost"
                  fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                  radius={i === series.tenantNames.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                  isAnimationActive={!reduced}
                  animationBegin={0}
                  animationDuration={700}
                  animationEasing="ease-out"
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
