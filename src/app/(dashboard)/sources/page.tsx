import { getChannelsWithMetrics } from '@/lib/data/channels'
import { SourcesClient } from './sources-client'
import { GitBranch, Users, Eye, TrendingUp } from 'lucide-react'

const TENANT_ID = 'tenant-aj'

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>
}) {
  const { window: windowParam } = await searchParams
  const windowDays = Number(windowParam ?? 30)
  const validWindow = [7, 30, 90].includes(windowDays) ? windowDays : 30

  const channels = await getChannelsWithMetrics(TENANT_ID, validWindow)

  const totalLeads     = channels.reduce((s, c) => s + c.metrics.leadsInWindow, 0)
  const totalViews     = channels.reduce((s, c) => s + c.metrics.pageViewsInWindow, 0)
  const avgConversion  = totalViews > 0 ? Math.round((totalLeads / totalViews) * 100) : 0

  const kpis = [
    { label: 'Leads generados',   value: String(totalLeads),      icon: <Users size={18} />,      color: '#5B8EC9' },
    { label: 'Vistas totales',    value: String(totalViews),      icon: <Eye size={18} />,        color: 'var(--accent-teal)' },
    { label: 'Conversión global', value: `${avgConversion}%`,     icon: <TrendingUp size={18} />, color: 'var(--accent-green)' },
    { label: 'Fuentes activas',   value: String(channels.filter(c => c.active).length), icon: <GitBranch size={18} />, color: 'var(--accent-gold)' },
  ]

  return (
    <>
      <style>{`.source-card:hover { border-color: var(--border-accent) !important; }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
            Fuentes de Adquisición
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            Canales activos · últimos {validWindow} días
          </p>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {kpis.map((kpi, i) => (
          <div
            key={i}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {kpi.label}
              </span>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(201,169,110,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: kpi.color,
              }}>
                {kpi.icon}
              </div>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Client: tabs + window selector + cards */}
      <SourcesClient channels={channels} windowDays={validWindow} />
    </>
  )
}
