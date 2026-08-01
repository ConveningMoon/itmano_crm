import { createAdminClient } from '@/lib/supabase/admin'
import { mapAgent, type AgentRow } from '@/lib/db'
import { getChannelsWithMetrics } from '@/lib/data/channels'
import { listSequences } from '@/lib/data/email-sequences'
import { getLeadAnalyticsStats, ANALYTICS_MONTHS } from '@/lib/data/leads'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { scopeFor } from '@/lib/auth/visibility'
import { QUALITY_BANDS, QUALITY_CONFIG } from '@/lib/scoring/priority'
import { getLeadSource } from '@/lib/leads/source'
import { LeadsDonutChart } from './charts/leads-donut-chart'
import { LeadsByAgentChart } from './charts/leads-by-agent-chart'
import { LeadsOverTimeChart } from './charts/leads-over-time-chart'
import { StageDistributionChart } from './charts/stage-distribution-chart'
import { Users, Inbox, TrendingUp, Activity, GitBranch, Mail } from 'lucide-react'
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
  const activeLeads = stats.active
  // La conversión se mide SÓLO sobre lo que captó ITMANO. Con los importados
  // dentro, A&J mostraba un 98% que describía el trabajo hecho en otro CRM.
  const conversionRate = stats.attributedTotal > 0
    ? Math.round((stats.attributedClosed / stats.attributedTotal) * 100)
    : 0

  // Distribución de las 5 bandas sobre TODA la cartera, cerrados incluidos: sin
  // ellos no se puede ver si los buenos leads terminan cerrando.
  const qualityDist = stats.qualityDistribution
  const qualityRows = QUALITY_BANDS.map(b => ({
    band:  b,
    label: QUALITY_CONFIG[b].label,
    color: QUALITY_CONFIG[b].color,
    count: qualityDist[b] ?? 0,
    pct:   stats.total > 0 ? Math.round(((qualityDist[b] ?? 0) / stats.total) * 100) : 0,
  }))

  // Altas del mes calendario en curso — cortadas en UTC igual que en la base, para
  // que el bucket no dependa de la zona horaria del servidor de Node.
  const now = new Date()
  const leadsThisMonth       = stats.thisMonth.leads
  const highQualityThisMonth = stats.thisMonth.highQuality

  // ─── Composite-source donut ──────────────────────────────────
  // Same composite-source logic as the /leads column & filter (getLeadSource):
  // a lead with a channel → its channel type; a direct-entry lead → its
  // traffic_source. Counts the real source instead of bucketing everything
  // channel-less as "Manual". Categories with 0 leads are omitted.
  const SOURCE_EMOJI: Record<string, string> = {
    manual:       '✍️',
    import:       '📥',
    instagram:    '📸',
    facebook:     '👍',
    whatsapp:     '💬',
    lead_magnet:  '📄',
    event:        '🏠',
    contact_form: '🌐',
    manychat:     '💬',
    other:        '📌',
  }
  const sourceCounts = new Map<string, { label: string; count: number; top: number; qualitySum: number }>()
  stats.bySource.forEach(row => {
    const src = getLeadSource(row.channelType, row.trafficSource)
    const prev = sourceCounts.get(src.kind)
    sourceCounts.set(src.kind, {
      // El kind 'other' agrupa varios traffic_source con etiquetas distintas:
      // nombra el grupo la mayoritaria.
      label: !prev || row.total > prev.top ? src.label : prev.label,
      count: (prev?.count ?? 0) + row.total,
      top:   Math.max(prev?.top ?? 0, row.total),
      // La media por kind se pondera por volumen: dos filas del mismo kind con
      // 100 y 2 leads no pueden pesar igual al promediarse.
      qualitySum: (prev?.qualitySum ?? 0) + (row.avgQuality ?? 0) * row.total,
    })
  })
  const sourceData = [...sourceCounts.entries()]
    .map(([kind, { label, count, qualitySum }]) => ({
      name: label,
      value: count,
      emoji: SOURCE_EMOJI[kind] ?? '📌',
      avgQuality: count > 0 ? Math.round(qualitySum / count) : null,
    }))
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
      highQuality: row?.highQuality ?? 0,
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

  const months: {
    month: string; nuevo: number; nutricion: number
    enProceso: number; cerrado: number; perdido: number
  }[] = []
  for (let i = ANALYTICS_MONTHS - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const row = monthlyByKey.get(monthKey(d))
    months.push({
      month:     MONTH_LABELS[d.getUTCMonth()],
      nuevo:     row?.nuevo     ?? 0,
      nutricion: row?.nutricion ?? 0,
      enProceso: row?.enProceso ?? 0,
      cerrado:   row?.cerrado   ?? 0,
      perdido:   row?.perdido   ?? 0,
    })
  }
  const enrichedMonthlyData = months

  // Dynamic range label for the monthly area chart (was a hardcoded "Oct 2025 – Abr 2026").
  const rangeStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (ANALYTICS_MONTHS - 1), 1))
  const monthlyRangeLabel =
    `${MONTH_LABELS[rangeStart.getUTCMonth()]} ${rangeStart.getUTCFullYear()} – ${MONTH_LABELS[now.getUTCMonth()]} ${now.getUTCFullYear()}`

  // ─── Etapas por agente ───────────────────────────────────────
  const stageData = agents.map(agent => {
    const stages = byAgent.get(agent.id)?.stages ?? {}
    const countOf = (stage: string) => stages[stage] ?? 0
    return {
      agent:     agent.name.split(' ')[0],
      nuevo:     countOf('nuevo'),
      nutricion: countOf('nutricion'),
      enProceso: countOf('en_proceso'),
      cerrado:   countOf('cerrado'),
      perdido:   countOf('perdido'),
    }
  })

  // ─── Avg temp by agent ───────────────────────────────────────
  // Calidad media por agente en vez de temperatura: la temperatura mezclaba el
  // decaimiento, así que un agente con leads antiguos parecía peor aunque sus
  // leads fueran igual de buenos.
  const qualityByAgent = agents.map(agent => {
    const row = byAgent.get(agent.id)
    return {
      agent,
      avgQuality:  row?.avgQuality  ?? 0,
      totalLeads:  row?.total       ?? 0,
      highQuality: row?.highQuality ?? 0,
    }
  }).sort((a, b) => b.avgQuality - a.avgQuality)

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
      // Sustituye a "Leads Calientes". "Caliente" era una banda de temperatura
      // que ya no se usa en ninguna otra pantalla; lo que el equipo puede
      // trabajar hoy es la cartera viva (nuevos + en nutrición).
      label: 'Cartera Activa',
      value: String(activeLeads),
      sub: 'nuevos y en nutrición',
      tone: 'neutral',
      icon: <Inbox size={18} />,
      color: 'var(--accent-blue)',
    },
    {
      label: 'Tasa de Conversión',
      value: `${conversionRate}%`,
      sub: stats.imported > 0
        ? `sobre ${stats.attributedTotal} leads captados aquí`
        : 'sobre el total de leads',
      tone: 'neutral',
      icon: <TrendingUp size={18} />,
      color: 'var(--accent-green)',
    },
    {
      // Sustituye a "Temperatura promedio": promediar una escala arbitraria no
      // significa nada. Cuántos leads son de calidad alta sí — y la distribución
      // completa está debajo.
      label: 'Calidad Alta',
      value: String(qualityDist.alta ?? 0),
      sub: highQualityThisMonth > 0
        ? `+${highQualityThisMonth} este mes`
        : stats.total > 0
          ? `${Math.round(((qualityDist.alta ?? 0) / stats.total) * 100)}% de la cartera`
          : 'sin leads',
      tone: highQualityThisMonth > 0 ? 'pos' : 'neutral',
      icon: <Activity size={18} />,
      color: QUALITY_CONFIG.alta.color,
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
              {/* Distribución de calidad — reemplaza la "temperatura promedio".
                  Promediar una escala arbitraria no dice nada; ver cómo se reparte
                  la cartera entre las cinco bandas sí. Incluye los cerrados: sin
                  ellos no se puede ver si los buenos leads terminan cerrando. */}
              <FadeIn delay={0.03} style={{ ...CARD, marginBottom: '24px' }}>
                <div style={CARD_HEADER}>Distribución de Calidad</div>
                <div style={CARD_SUBTITLE}>Cómo se reparte tu cartera entre las cinco bandas</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                  {qualityRows.map(r => (
                    <div key={r.band} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', minWidth: '78px' }}>{r.label}</span>
                      <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'var(--bg-overlay)' }}>
                        <div style={{ width: `${r.pct}%`, height: '100%', borderRadius: '4px', background: r.color }} />
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', minWidth: '58px', textAlign: 'right' }}>
                        {r.count} · {r.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              </FadeIn>

              <FadeIn delay={0.05} style={{ ...CARD, marginBottom: '24px' }}>
                <div style={CARD_HEADER}>Leads por Fuente</div>
                <div style={CARD_SUBTITLE}>Volumen y calidad media de cada canal</div>
                <LeadsDonutChart data={sourceData} total={totalLeads} />
                {/* Calidad media por canal: responde "¿qué fuente trae MEJORES
                    leads?", que hasta ahora no se podía saber — sólo cuál traía más. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '14px' }}>
                  {sourceData.filter(d => d.avgQuality !== null).map(d => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{d.emoji} {d.name}</span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {d.value} leads · calidad media <strong style={{ color: 'var(--text-secondary)' }}>{d.avgQuality}</strong>
                      </span>
                    </div>
                  ))}
                </div>
              </FadeIn>
              <FadeIn delay={0.1} style={CARD}>
                <div style={CARD_HEADER}>Evolución de Leads</div>
                <div style={CARD_SUBTITLE}>
                  Leads por mes de alta y la etapa en la que están hoy · {monthlyRangeLabel}
                </div>
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
          <div style={CARD_HEADER}>Etapas por Agente</div>
          <div style={CARD_SUBTITLE}>En qué punto del embudo tiene su cartera cada agente</div>
          <StageDistributionChart data={stageData} />
        </div>

        {/* Dense table — out of redesign scope; defensive horizontal scroll on phones only. */}
        <div className="max-md:overflow-x-auto" style={CARD}>
          <div style={CARD_HEADER}>Calidad por Agente</div>
          <div style={CARD_SUBTITLE}>Calidad media y leads de calidad alta por agente</div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '4px' }}>
            <thead>
              <tr>
                {['#', 'Agente', 'Leads', 'Alta', 'Calidad'].map(col => (
                  <th key={col} style={{
                    fontSize: '10px',
                    fontWeight: 500,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    padding: '0 0 10px',
                    textAlign: col === 'Leads' || col === 'Alta' ? 'center' : 'left',
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {qualityByAgent.map((row, i) => {
                const barColor = QUALITY_CONFIG[
                  row.avgQuality >= 60 ? 'alta' : row.avgQuality >= 35 ? 'media' : 'baja'
                ].color
                const barWidth = Math.round((row.avgQuality / 100) * 80)
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
                      {row.highQuality}
                    </td>
                    <td style={{ padding: '10px 0 10px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '80px', height: '4px', borderRadius: '2px', background: 'var(--bg-overlay)', flexShrink: 0 }}>
                          <div style={{ width: `${barWidth}px`, height: '100%', borderRadius: '2px', background: barColor }} />
                        </div>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', minWidth: '28px' }}>
                          {row.avgQuality}
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
