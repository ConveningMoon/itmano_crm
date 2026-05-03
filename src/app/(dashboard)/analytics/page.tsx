import { MOCK_LEADS, MOCK_AGENTS, MOCK_SOURCES, SOURCE_CONFIG } from '@/lib/mockdata'
import { LeadsDonutChart } from './charts/leads-donut-chart'
import { LeadsByAgentChart } from './charts/leads-by-agent-chart'
import { LeadsOverTimeChart } from './charts/leads-over-time-chart'
import { StatusDistributionChart } from './charts/status-distribution-chart'
import { Users, Flame, TrendingUp, Activity } from 'lucide-react'

const CARD: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '12px',
  padding: '20px',
}

const CARD_HEADER: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 500,
  color: 'var(--text-primary)',
  marginBottom: '2px',
}

const CARD_SUBTITLE: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-muted)',
  marginBottom: '16px',
}

export default function AnalyticsPage() {
  // ─── KPIs ───────────────────────────────────────────────────
  const totalLeads = MOCK_LEADS.length
  const hotLeads = MOCK_LEADS.filter(l => l.temperatureScore >= 70).length
  const closedLeads = MOCK_LEADS.filter(l =>
    l.status === 'closed' || l.status === 'process_completed'
  ).length
  const conversionRate = Math.round((closedLeads / totalLeads) * 100)
  const avgScore = Math.round(
    MOCK_LEADS.reduce((sum, l) => sum + l.temperatureScore, 0) / totalLeads
  )

  // ─── Source donut ────────────────────────────────────────────
  const sourceCounts: Record<string, number> = {}
  MOCK_LEADS.forEach(lead => {
    const source = MOCK_SOURCES.find(s => s.id === lead.sourceId)
    const type = source?.type ?? 'manual'
    sourceCounts[type] = (sourceCounts[type] ?? 0) + 1
  })
  const sourceData = Object.entries(sourceCounts).map(([type, count]) => ({
    name: SOURCE_CONFIG[type]?.label ?? type,
    value: count,
    emoji: SOURCE_CONFIG[type]?.icon ?? '📌',
  }))

  // ─── Agents bar ──────────────────────────────────────────────
  const agentData = MOCK_AGENTS.map(agent => {
    const leads = MOCK_LEADS.filter(l => l.agentId === agent.id)
    return {
      name: agent.name.split(' ')[0],
      fullName: agent.name,
      total: leads.length,
      hot: leads.filter(l => l.temperatureScore >= 70).length,
      closed: leads.filter(l => l.status === 'closed' || l.status === 'process_completed').length,
      color: agent.accentColor,
    }
  })

  // ─── Monthly area chart (enriched mock) ──────────────────────
  const enrichedMonthlyData = [
    { month: 'Oct', leads: 68, nurturing: 45, hot: 12, closed: 3 },
    { month: 'Nov', leads: 12, nurturing: 8,  hot: 3,  closed: 1 },
    { month: 'Dic', leads: 0,  nurturing: 15, hot: 5,  closed: 2 },
    { month: 'Ene', leads: 3,  nurturing: 20, hot: 8,  closed: 2 },
    { month: 'Feb', leads: 0,  nurturing: 18, hot: 9,  closed: 3 },
    { month: 'Mar', leads: 0,  nurturing: 22, hot: 10, closed: 2 },
    { month: 'Abr', leads: 0,  nurturing: 25, hot: 12, closed: 3 },
  ]

  // ─── Status distribution by agent ────────────────────────────
  const statusData = MOCK_AGENTS.map(agent => {
    const leads = MOCK_LEADS.filter(l => l.agentId === agent.id)
    return {
      agent: agent.name.split(' ')[0],
      new:       leads.filter(l => l.status === 'new').length,
      nurturing: leads.filter(l => l.status === 'nurturing').length,
      warm:      leads.filter(l => l.status === 'warm').length,
      hot:       leads.filter(l => l.status === 'hot').length,
      process:   leads.filter(l => l.status === 'process_started').length,
      closed:    leads.filter(l => l.status === 'closed' || l.status === 'process_completed').length,
    }
  })

  // ─── Avg temp by agent ───────────────────────────────────────
  const tempByAgent = MOCK_AGENTS.map(agent => {
    const leads = MOCK_LEADS.filter(l => l.agentId === agent.id)
    const avgTemp = Math.round(leads.reduce((s, l) => s + l.temperatureScore, 0) / leads.length)
    return {
      agent,
      avgTemp,
      totalLeads: leads.length,
      hotLeads: leads.filter(l => l.temperatureScore >= 70).length,
    }
  }).sort((a, b) => b.avgTemp - a.avgTemp)

  const kpis = [
    {
      label: 'Total Leads',
      value: String(totalLeads),
      trend: '+12 este mes',
      positive: true,
      icon: <Users size={18} />,
      color: 'var(--accent-gold)',
    },
    {
      label: 'Leads Calientes',
      value: String(hotLeads),
      trend: '+3 esta semana',
      positive: true,
      icon: <Flame size={18} />,
      color: '#E04040',
    },
    {
      label: 'Tasa de Conversión',
      value: `${conversionRate}%`,
      trend: '+2% vs mes anterior',
      positive: true,
      icon: <TrendingUp size={18} />,
      color: 'var(--accent-green)',
    },
    {
      label: 'Score Promedio',
      value: `${avgScore} pts`,
      trend: '+5 pts vs mes anterior',
      positive: true,
      icon: <Activity size={18} />,
      color: '#9B72CF',
    },
  ]

  return (
    <div>
      {/* FILA 1 — KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {kpis.map((kpi, i) => (
          <div
            key={i}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '18px 20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {kpi.label}
              </span>
              <div style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                background: `${kpi.color}1F`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: kpi.color,
              }}>
                {kpi.icon}
              </div>
            </div>
            <div style={{ fontSize: '26px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>
              {kpi.value}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px' }}>
              <TrendingUp size={12} color={kpi.positive ? 'var(--accent-green)' : '#E04040'} />
              <span style={{ fontSize: '11px', color: kpi.positive ? 'var(--accent-green)' : '#E04040' }}>
                {kpi.trend}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* FILA 2 — Donut + Bar horizontal */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        <div style={CARD}>
          <div style={CARD_HEADER}>Leads por Fuente</div>
          <div style={CARD_SUBTITLE}>Distribución por canal de captación</div>
          <LeadsDonutChart data={sourceData} total={totalLeads} />
        </div>
        <div style={CARD}>
          <div style={CARD_HEADER}>Leads por Agente</div>
          <div style={CARD_SUBTITLE}>Comparativa de captación del equipo</div>
          <LeadsByAgentChart data={agentData} />
        </div>
      </div>

      {/* FILA 3 — Area chart */}
      <div style={{ ...CARD, marginBottom: '24px' }}>
        <div style={CARD_HEADER}>Evolución de Leads</div>
        <div style={CARD_SUBTITLE}>Flujo mensual por temperatura · Oct 2025 – Abr 2026</div>
        <LeadsOverTimeChart data={enrichedMonthlyData} />
      </div>

      {/* FILA 4 — Stacked bar + Temp table */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div style={CARD}>
          <div style={CARD_HEADER}>Estados por Agente</div>
          <div style={CARD_SUBTITLE}>Distribución de pipeline por agente</div>
          <StatusDistributionChart data={statusData} />
        </div>

        <div style={CARD}>
          <div style={CARD_HEADER}>Temperatura Promedio</div>
          <div style={CARD_SUBTITLE}>Score promedio y leads calientes por agente</div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '4px' }}>
            <thead>
              <tr>
                {['#', 'Agente', 'Leads', '🔥', 'Score'].map(col => (
                  <th key={col} style={{
                    fontSize: '10px',
                    fontWeight: 500,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    padding: '0 0 10px',
                    textAlign: col === 'Leads' || col === '🔥' ? 'center' : 'left',
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tempByAgent.map((row, i) => {
                const barColor = row.avgTemp >= 70 ? '#E04040' : row.avgTemp >= 40 ? '#E07B3A' : '#C9A96E'
                const barWidth = Math.round((row.avgTemp / 100) * 80)
                return (
                  <tr
                    key={row.agent.id}
                    style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none' }}
                  >
                    <td style={{ padding: '10px 8px 10px 0', fontSize: '12px', color: 'var(--text-muted)', width: '20px' }}>
                      {i + 1}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: `${row.agent.accentColor}22`,
                          border: `1px solid ${row.agent.accentColor}44`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '10px',
                          fontWeight: 600,
                          color: row.agent.accentColor,
                          flexShrink: 0,
                        }}>
                          {row.agent.avatarInitials}
                        </div>
                        <span style={{ fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                          {row.agent.name.split(' ')[0]}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 8px', fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                      {row.totalLeads}
                    </td>
                    <td style={{ padding: '10px 8px', fontSize: '13px', color: '#E04040', textAlign: 'center' }}>
                      {row.hotLeads}
                    </td>
                    <td style={{ padding: '10px 0 10px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '80px', height: '4px', borderRadius: '2px', background: 'var(--bg-overlay)', flexShrink: 0 }}>
                          <div style={{ width: `${barWidth}px`, height: '100%', borderRadius: '2px', background: barColor }} />
                        </div>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', minWidth: '28px' }}>
                          {row.avgTemp}
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
