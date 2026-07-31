import { createAdminClient } from '@/lib/supabase/admin'
import { mapAgent, type AgentRow } from '@/lib/db'
import { getChannelsWithMetrics } from '@/lib/data/channels'
import { listSequences } from '@/lib/data/email-sequences'
import { getLeadAnalyticsStats, ANALYTICS_MONTHS } from '@/lib/data/leads'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { scopeFor } from '@/lib/auth/visibility'
import { bandForScore } from '@/lib/scoring/temperature-band'
import { getLeadSource } from '@/lib/leads/source'
import { LeadsDonutChart } from './charts/leads-donut-chart'
import { LeadsByAgentChart } from './charts/leads-by-agent-chart'
import { LeadsOverTimeChart } from './charts/leads-over-time-chart'
import { StatusDistributionChart } from './charts/status-distribution-chart'
import { Users, Flame, TrendingUp, Activity, GitBranch, Mail } from 'lucide-react'
import Link from 'next/link'
import { FadeIn, StaggerGroup, StaggerItem } from '@/components/motion/primitives'
import { Tabs } from '@/components/ui/tabs'

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
  const ctx = await requireTenantContext()
  const { tenant_id, role } = ctx
  const scope = scopeFor(ctx)
  const isAgent = role === 'agent'
  const supabase = createAdminClient()

  // Todos los agregados de leads salen ya calculados de Postgres (RPC
  // lead_analytics_stats, migración 073) con el scope de visibilidad aplicado en
  // el servidor: la página ya no trae la tabla de leads del tenant para contarla
  // en JS. Los agentes son datos de referencia del tenant (los bloques por agente
  // se ocultan para el rol 'agent').
  const agentsQ = supabase.from('agents').select('*')

  const [stats, { data: rawAgents }, channels, sequences] = await Promise.all([
    getLeadAnalyticsStats(scope),
    tenant_id ? agentsQ.eq('tenant_id', tenant_id) : agentsQ,
    getChannelsWithMetrics(tenant_id, 30, scope.agentId),
    listSequences(tenant_id, scope.agentId),
  ])

  const agents = (rawAgents ?? []).map(r => mapAgent(r as AgentRow))

  // ─── KPIs ───────────────────────────────────────────────────
  const totalLeads  = stats.total
  const hotLeads    = stats.hot
  const closedLeads = stats.closed
  const conversionRate = totalLeads > 0 ? Math.round((closedLeads / totalLeads) * 100) : 0

  // Temperatura promedio (KPI): media de current_score sobre los leads VIVOS
  // (congelados excluidos), mostrada como banda + el número medio de respaldo.
  const avgLiveTemp = stats.liveAvgScore
  const tempBand = avgLiveTemp !== null ? bandForScore(avgLiveTemp) : null

  // Altas del mes calendario en curso — cortadas en UTC igual que en la base, para
  // que el bucket no dependa de la zona horaria del servidor de Node.
  const now = new Date()
  const leadsThisMonth = stats.thisMonth.leads
  const hotThisMonth   = stats.thisMonth.hot

  // ─── Composite-source donut ──────────────────────────────────
  // Same composite-source logic as the /leads column & filter (getLeadSource):
  // a lead with a channel → its channel type; a direct-entry lead → its
  // traffic_source. Counts the real source instead of bucketing everything
  // channel-less as "Manual". Categories with 0 leads are omitted.
  const SOURCE_EMOJI: Record<string, string> = {
    manual:       '✍️',
    instagram:    '📸',
    facebook:     '👍',
    whatsapp:     '💬',
    lead_magnet:  '📄',
    event:        '🏠',
    contact_form: '🌐',
    manychat:     '💬',
    other:        '📌',
  }
  const sourceCounts = new Map<string, { label: string; count: number; top: number }>()
  stats.bySource.forEach(row => {
    const src = getLeadSource(row.channelType, row.trafficSource)
    const prev = sourceCounts.get(src.kind)
    sourceCounts.set(src.kind, {
      // El kind 'other' agrupa varios traffic_source con etiquetas distintas:
      // nombra el grupo la mayoritaria.
      label: !prev || row.total > prev.top ? src.label : prev.label,
      count: (prev?.count ?? 0) + row.total,
      top:   Math.max(prev?.top ?? 0, row.total),
    })
  })
  const sourceData = [...sourceCounts.entries()]
    .map(([kind, { label, count }]) => ({ name: label, value: count, emoji: SOURCE_EMOJI[kind] ?? '📌' }))
    .sort((a, b) => b.value - a.value)

  // ─── Agents bar ──────────────────────────────────────────────
  // Un agente sin leads no aparece en el agregado: se muestra en cero.
  const byAgent = new Map(stats.byAgent.map(a => [a.agentId, a]))

  const agentData = agents.map(agent => {
    const row = byAgent.get(agent.id)
    return {
      name: agent.name.split(' ')[0],
      fullName: agent.name,
      total: row?.total ?? 0,
      hot: row?.hot ?? 0,
      closed: row?.closed ?? 0,
      color: agent.accentColor,
    }
  })

  // ─── Monthly area chart (real data, last 7 months) ───────────
  const MONTH_LABELS: Record<number, string> = {
    0: 'Ene', 1: 'Feb', 2: 'Mar', 3: 'Abr', 4: 'May', 5: 'Jun',
    6: 'Jul', 7: 'Ago', 8: 'Sep', 9: 'Oct', 10: 'Nov', 11: 'Dic',
  }
  // La base devuelve sólo los meses con leads; aquí se arma el eje completo (los
  // meses vacíos van en cero). Las claves se construyen en UTC para casar con el
  // corte de la migración 073.
  const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const monthlyByKey = new Map(stats.monthly.map(m => [m.month, m]))

  const months: { month: string; leads: number; nurturing: number; hot: number; closed: number }[] = []
  for (let i = ANALYTICS_MONTHS - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const row = monthlyByKey.get(monthKey(d))
    months.push({
      month:     MONTH_LABELS[d.getUTCMonth()],
      leads:     row?.leads     ?? 0,
      nurturing: row?.nurturing ?? 0,
      hot:       row?.hot       ?? 0,
      closed:    row?.closed    ?? 0,
    })
  }
  const enrichedMonthlyData = months

  // Dynamic range label for the monthly area chart (was a hardcoded "Oct 2025 – Abr 2026").
  const rangeStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (ANALYTICS_MONTHS - 1), 1))
  const monthlyRangeLabel =
    `${MONTH_LABELS[rangeStart.getUTCMonth()]} ${rangeStart.getUTCFullYear()} – ${MONTH_LABELS[now.getUTCMonth()]} ${now.getUTCFullYear()}`

  // ─── Status distribution by agent ────────────────────────────
  const statusData = agents.map(agent => {
    const statuses = byAgent.get(agent.id)?.statuses ?? {}
    const countOf = (status: string) => statuses[status] ?? 0
    return {
      agent: agent.name.split(' ')[0],
      new:       countOf('new'),
      nurturing: countOf('nurturing'),
      warm:      countOf('warm'),
      hot:       countOf('hot'),
      process:   countOf('process_started'),
      closed:    countOf('closed') + countOf('process_completed'),
    }
  })

  // ─── Avg temp by agent ───────────────────────────────────────
  const tempByAgent = agents.map(agent => {
    const row = byAgent.get(agent.id)
    return {
      agent,
      avgTemp:    row?.avgScore ?? 0,
      totalLeads: row?.total    ?? 0,
      hotLeads:   row?.hot      ?? 0,
    }
  }).sort((a, b) => b.avgTemp - a.avgTemp)

  // tone: 'pos' → green up-arrow + green text (real positive delta); 'neutral' →
  // muted descriptor, no arrow (no fabricated delta).
  const kpis: Array<{
    label: string; value: string; sub: string; tone: 'pos' | 'neutral'
    icon: React.ReactNode; color: string
  }> = [
    {
      label: 'Total Leads',
      value: String(totalLeads),
      sub: `+${leadsThisMonth} este mes`,
      tone: 'pos',
      icon: <Users size={18} />,
      color: 'var(--accent-gold)',
    },
    {
      label: 'Leads Calientes',
      value: String(hotLeads),
      sub: `+${hotThisMonth} este mes`,
      tone: 'pos',
      icon: <Flame size={18} />,
      color: 'var(--status-hot)',
    },
    {
      label: 'Tasa de Conversión',
      value: `${conversionRate}%`,
      sub: 'sobre el total de leads',
      tone: 'neutral',
      icon: <TrendingUp size={18} />,
      color: 'var(--accent-green)',
    },
    {
      // Temperatura promedio: banda del score medio de los leads vivos (congelados
      // excluidos), con el número medio como respaldo.
      label: 'Temperatura Promedio',
      value: tempBand ? tempBand.label : '—',
      sub: avgLiveTemp !== null ? `${avgLiveTemp} pts · pipeline vivo` : 'sin pipeline vivo',
      tone: 'neutral',
      icon: <Activity size={18} />,
      color: tempBand ? tempBand.color : 'var(--text-muted)',
    },
  ]

  return (
    <div>
      {/* FILA 1 — KPIs */}
      <StaggerGroup className="grid grid-cols-2 md:grid-cols-4 gap-4" style={{ marginBottom: '24px' }}>
        {kpis.map((kpi, i) => (
          <StaggerItem
            key={i}
            className="card-interactive"
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
                background: `color-mix(in srgb, ${kpi.color} 12%, transparent)`,
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
              {kpi.tone === 'pos' && <TrendingUp size={12} color="var(--accent-green)" />}
              <span style={{ fontSize: '11px', color: kpi.tone === 'pos' ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                {kpi.sub}
              </span>
            </div>
          </StaggerItem>
        ))}
      </StaggerGroup>

      {/* Contenido organizado en tabs — los KPIs permanecen siempre visibles.
          El tab "Por agente" se omite para rol 'agent' (sus bloques ya estaban
          ocultos con isAgent). Página server: los tabs reciben JSX server-rendered. */}
      <Tabs
        items={[
          { key: 'resumen', label: 'Resumen' },
          ...(!isAgent ? [{ key: 'agentes', label: 'Por agente' }] : []),
          { key: 'canales', label: 'Canales y Email' },
        ]}
        content={{
          resumen: (
            <>
              <FadeIn delay={0.05} style={{ ...CARD, marginBottom: '24px' }}>
                <div style={CARD_HEADER}>Leads por Fuente</div>
                <div style={CARD_SUBTITLE}>Distribución por fuente de captación</div>
                <LeadsDonutChart data={sourceData} total={totalLeads} />
              </FadeIn>
              <FadeIn delay={0.1} style={CARD}>
                <div style={CARD_HEADER}>Evolución de Leads</div>
                <div style={CARD_SUBTITLE}>Flujo mensual por temperatura · {monthlyRangeLabel}</div>
                <LeadsOverTimeChart data={enrichedMonthlyData} />
              </FadeIn>
            </>
          ),
          ...(!isAgent
            ? {
                agentes: (
            <>
              <div style={{ ...CARD, marginBottom: '24px' }}>
                <div style={CARD_HEADER}>Leads por Agente</div>
                <div style={CARD_SUBTITLE}>Comparativa de captación del equipo</div>
                <LeadsByAgentChart data={agentData} />
              </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div style={CARD}>
          <div style={CARD_HEADER}>Estados por Agente</div>
          <div style={CARD_SUBTITLE}>Distribución de pipeline por agente</div>
          <StatusDistributionChart data={statusData} />
        </div>

        {/* Dense table — out of redesign scope; defensive horizontal scroll on phones only. */}
        <div className="max-md:overflow-x-auto" style={CARD}>
          <div style={CARD_HEADER}>Temperatura por Agente</div>
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
                const barColor = bandForScore(row.avgTemp).color
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
                    <td style={{ padding: '10px 8px', fontSize: '13px', color: 'var(--status-hot)', textAlign: 'center' }}>
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
            </>
                ),
              }
            : {}),
          canales: (
            <>
      {/* Secuencias de email */}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Link href="/analytics/emails" style={{ fontSize: '12px', color: 'var(--accent-blue)', textDecoration: 'none', fontWeight: 500 }}>
                  Métricas →
                </Link>
                <Link href="/emails" style={{ fontSize: '12px', color: 'var(--accent-gold)', textDecoration: 'none', fontWeight: 500 }}>
                  Ver detalle →
                </Link>
              </div>
            </div>
            <div style={{ ...CARD_SUBTITLE, marginBottom: '16px' }}>
              Resumen de runs por secuencia · métricas de envío en{' '}
              <Link href="/analytics/emails" style={{ color: 'var(--accent-blue)', textDecoration: 'none' }}>Analítica de Email</Link>
            </div>

            {/* Summary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3" style={{ marginBottom: '20px' }}>
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

            {/* Per-sequence table — dense, out of redesign scope; defensive scroll <md. */}
            {sequences.length > 0 && (
              <div className="max-md:overflow-x-auto">
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
              </div>
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

        {/* Dense table — out of redesign scope; defensive scroll <md. */}
        <div className="max-md:overflow-x-auto">
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
                      background: `color-mix(in srgb, ${typeColor} 10%, transparent)`,
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
            </>
          ),
        }}
      />
    </div>
  )
}
