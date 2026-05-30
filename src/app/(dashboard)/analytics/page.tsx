import { createAdminClient } from '@/lib/supabase/admin'
import { mapAgent, mapLead, type AgentRow, type LeadRow } from '@/lib/db'
import { getChannelsWithMetrics } from '@/lib/data/channels'
import { listSequences } from '@/lib/data/email-sequences'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { LeadsDonutChart } from './charts/leads-donut-chart'
import { LeadsByAgentChart } from './charts/leads-by-agent-chart'
import { LeadsOverTimeChart } from './charts/leads-over-time-chart'
import { StatusDistributionChart } from './charts/status-distribution-chart'
import { Users, Flame, TrendingUp, Activity, GitBranch, Mail } from 'lucide-react'
import Link from 'next/link'

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

export default async function AnalyticsPage() {
  const { tenant_id } = await getCurrentTenantContext()
  const supabase = createAdminClient()

  const leadsQ  = supabase.from('leads').select('*, acquisition_channels!acquisition_channel_id(channel_type, name)')
  const agentsQ = supabase.from('agents').select('*')

  const [{ data: rawLeads }, { data: rawAgents }, channels, sequences] = await Promise.all([
    tenant_id ? leadsQ.eq('tenant_id', tenant_id)  : leadsQ,
    tenant_id ? agentsQ.eq('tenant_id', tenant_id) : agentsQ,
    getChannelsWithMetrics(tenant_id, 30),
    listSequences(tenant_id),
  ])

  const leads  = (rawLeads  ?? []).map(r => mapLead(r as LeadRow))
  const agents = (rawAgents ?? []).map(r => mapAgent(r as AgentRow))

  // ─── KPIs ───────────────────────────────────────────────────
  const totalLeads = leads.length
  const hotLeads = leads.filter(l => (l.temperatureScore ?? 0) >= 70).length
  const closedLeads = leads.filter(l =>
    l.status === 'closed' || l.status === 'process_completed'
  ).length
  const conversionRate = totalLeads > 0 ? Math.round((closedLeads / totalLeads) * 100) : 0
  const avgScore = totalLeads > 0
    ? Math.round(leads.reduce((sum, l) => sum + (l.temperatureScore ?? 0), 0) / totalLeads)
    : 0

  // ─── Channel-type donut ──────────────────────────────────────
  const CHANNEL_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
    lead_magnet:   { label: 'Lead Magnet',    icon: '📄' },
    event:         { label: 'Evento',         icon: '🏠' },
    contact_form:  { label: 'Formulario',     icon: '🌐' },
    manychat_flow: { label: 'ManyChat',       icon: '💬' },
    manual:        { label: 'Manual',         icon: '✍️' },
  }
  const sourceCounts: Record<string, number> = {}
  leads.forEach(lead => {
    // reason: Supabase returns untyped join data without generated schema
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (rawLeads ?? []).find(r => r.id === lead.id) as any
    const type = raw?.acquisition_channels?.channel_type ?? 'manual'
    sourceCounts[type] = (sourceCounts[type] ?? 0) + 1
  })
  const sourceData = Object.entries(sourceCounts).map(([type, count]) => {
    const cfg = CHANNEL_TYPE_LABELS[type]
    return {
      name: cfg?.label ?? type,
      value: count,
      emoji: cfg?.icon ?? '📌',
    }
  })

  // ─── Agents bar ──────────────────────────────────────────────
  const agentData = agents.map(agent => {
    const agentLeads = leads.filter(l => l.agentId === agent.id)
    return {
      name: agent.name.split(' ')[0],
      fullName: agent.name,
      total: agentLeads.length,
      hot: agentLeads.filter(l => (l.temperatureScore ?? 0) >= 70).length,
      closed: agentLeads.filter(l => l.status === 'closed' || l.status === 'process_completed').length,
      color: agent.accentColor,
    }
  })

  // ─── Monthly area chart (real data, last 7 months) ───────────
  const MONTH_LABELS: Record<number, string> = {
    0: 'Ene', 1: 'Feb', 2: 'Mar', 3: 'Abr', 4: 'May', 5: 'Jun',
    6: 'Jul', 7: 'Ago', 8: 'Sep', 9: 'Oct', 10: 'Nov', 11: 'Dic',
  }
  const now = new Date()
  const months: { month: string; leads: number; nurturing: number; hot: number; closed: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = d.getMonth()
    const monthLeads = leads.filter(l => {
      const ld = new Date(l.createdAt)
      return ld.getFullYear() === y && ld.getMonth() === m
    })
    months.push({
      month:     MONTH_LABELS[m],
      leads:     monthLeads.length,
      nurturing: monthLeads.filter(l => l.status === 'nurturing').length,
      hot:       monthLeads.filter(l => (l.temperatureScore ?? 0) >= 70).length,
      closed:    monthLeads.filter(l => l.status === 'closed' || l.status === 'process_completed').length,
    })
  }
  const enrichedMonthlyData = months

  // ─── Status distribution by agent ────────────────────────────
  const statusData = agents.map(agent => {
    const agentLeads = leads.filter(l => l.agentId === agent.id)
    return {
      agent: agent.name.split(' ')[0],
      new:       agentLeads.filter(l => l.status === 'new').length,
      nurturing: agentLeads.filter(l => l.status === 'nurturing').length,
      warm:      agentLeads.filter(l => l.status === 'warm').length,
      hot:       agentLeads.filter(l => l.status === 'hot').length,
      process:   agentLeads.filter(l => l.status === 'process_started').length,
      closed:    agentLeads.filter(l => l.status === 'closed' || l.status === 'process_completed').length,
    }
  })

  // ─── Avg temp by agent ───────────────────────────────────────
  const tempByAgent = agents.map(agent => {
    const agentLeads = leads.filter(l => l.agentId === agent.id)
    const avgTemp = agentLeads.length > 0
      ? Math.round(agentLeads.reduce((s, l) => s + (l.temperatureScore ?? 0), 0) / agentLeads.length)
      : 0
    return {
      agent,
      avgTemp,
      totalLeads: agentLeads.length,
      hotLeads: agentLeads.filter(l => (l.temperatureScore ?? 0) >= 70).length,
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
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
      {/* FILA 5 — Secuencias de email */}
      {(() => {
        const totalActive    = sequences.reduce((s, q) => s + q.activeRunCount,    0)
        const totalCompleted = sequences.reduce((s, q) => s + q.completedRunCount, 0)
        const totalCancelled = sequences.reduce((s, q) => s + q.cancelledRunCount, 0)
        const totalRuns      = totalActive + totalCompleted + totalCancelled
        const completionRate = totalRuns > 0 ? Math.round((totalCompleted / totalRuns) * 100) : 0

        return (
          <div style={{ ...CARD, marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Mail size={16} color="var(--accent-gold)" />
                <span style={CARD_HEADER}>Desempeño de Secuencias de Email</span>
              </div>
              <Link href="/emails" style={{ fontSize: '12px', color: 'var(--accent-gold)', textDecoration: 'none', fontWeight: 500 }}>
                Ver detalle →
              </Link>
            </div>
            <div style={{ ...CARD_SUBTITLE, marginBottom: '16px' }}>
              Resumen de runs por secuencia · El envío real se activa en Fase 3 (Resend)
            </div>

            {/* Summary KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
              {[
                { label: 'Runs activos',    value: totalActive,    color: 'var(--accent-gold)'  },
                { label: 'Completados',      value: totalCompleted, color: 'var(--accent-green)' },
                { label: 'Cancelados',       value: totalCancelled, color: 'var(--accent-coral)' },
                { label: 'Tasa de completado', value: `${completionRate}%`, color: 'var(--accent-blue)' },
              ].map(stat => (
                <div key={stat.label} style={{
                  background: 'var(--bg-elevated)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                }}>
                  <div style={{ fontSize: '20px', fontWeight: 600, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Per-sequence table */}
            {sequences.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Secuencia', 'Fuente', 'Pasos', 'Activos', 'Completados', 'Cancelados'].map(col => (
                      <th key={col} style={{
                        fontSize: '10px', fontWeight: 500, color: 'var(--text-muted)',
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                        padding: '0 8px 10px 0', textAlign: col === 'Secuencia' || col === 'Fuente' ? 'left' : 'center',
                      }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sequences.map((seq, i) => (
                    <tr key={seq.id} style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none' }}>
                      <td style={{ padding: '10px 8px 10px 0' }}>
                        <Link href={`/emails/${seq.id}`} style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', textDecoration: 'none' }}>
                          {seq.name}
                        </Link>
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        {seq.channels.length > 0 ? seq.channels.map((ch, i) => (
                          <span key={ch.id}>
                            {i > 0 && <span style={{ marginRight: '4px' }}>,</span>}
                            <Link href={`/sources/${ch.slug}`} style={{ fontSize: '12px', color: 'var(--text-muted)', textDecoration: 'none' }}>
                              {ch.name}
                            </Link>
                          </span>
                        )) : <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {seq.stepCount}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '13px', fontWeight: 500, color: 'var(--accent-gold)' }}>
                        {seq.activeRunCount}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '13px', color: 'var(--accent-green)' }}>
                        {seq.completedRunCount}
                      </td>
                      <td style={{ padding: '10px 0 10px 8px', textAlign: 'center', fontSize: '13px', color: seq.cancelledRunCount > 0 ? 'var(--accent-coral)' : 'var(--text-muted)' }}>
                        {seq.cancelledRunCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      })()}

      {/* FILA 7 — Canales de adquisición */}
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GitBranch size={16} color="var(--accent-gold)" />
            <span style={CARD_HEADER}>Rendimiento por Canal · 30 días</span>
          </div>
          <Link href="/sources" style={{ fontSize: '12px', color: 'var(--accent-gold)', textDecoration: 'none', fontWeight: 500 }}>
            Ver todos →
          </Link>
        </div>
        <div style={{ ...CARD_SUBTITLE, marginBottom: '12px' }}>Leads captados, vistas y conversión por canal de adquisición</div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Canal', 'Tipo', 'Vistas', 'Leads', 'Conversión', 'Score prom.'].map(col => (
                <th key={col} style={{
                  fontSize: '10px',
                  fontWeight: 500,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '0 8px 10px 0',
                  textAlign: col === 'Canal' ? 'left' : 'center',
                }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {channels.sort((a, b) => b.metrics.leadsInWindow - a.metrics.leadsInWindow).map((ch, i) => {
              const typeColors: Record<string, string> = {
                lead_magnet:   'var(--accent-gold)',
                event:         'var(--accent-teal)',
                contact_form:  'var(--accent-blue)',
                manychat_flow: 'var(--accent-green)',
                manual:        'var(--text-muted)',
              }
              const typeLabels: Record<string, string> = {
                lead_magnet:   'Lead Magnet',
                event:         'Evento',
                contact_form:  'Formulario',
                manychat_flow: 'ManyChat',
                manual:        'Manual',
              }
              const typeColor = typeColors[ch.channelType] ?? 'var(--text-muted)'
              return (
                <tr key={ch.id} style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none' }}>
                  <td style={{ padding: '10px 8px 10px 0' }}>
                    <Link href={`/sources/${ch.slug}`} style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', textDecoration: 'none' }}>
                      {ch.name}
                    </Link>
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 500,
                      color: typeColor,
                      background: `${typeColor}18`,
                      padding: '2px 8px',
                      borderRadius: '10px',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                    }}>
                      {typeLabels[ch.channelType] ?? ch.channelType}
                    </span>
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {ch.metrics.pageViewsInWindow}
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {ch.metrics.leadsInWindow}
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                    <span style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      color: ch.metrics.conversionRate >= 15 ? 'var(--accent-green)' : ch.metrics.conversionRate >= 8 ? 'var(--accent-gold)' : 'var(--text-muted)',
                    }}>
                      {ch.metrics.conversionRate}%
                    </span>
                  </td>
                  <td style={{ padding: '10px 0 10px 8px', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {ch.metrics.avgTempScore !== null ? ch.metrics.avgTempScore : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
