import Link from 'next/link'
import { scopeFor } from '@/lib/auth/visibility'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { getLeadAnalyticsStats } from '@/lib/data/leads'
import { summarizeAgents } from '@/lib/dashboard/agents-summary'
import { STAGES, STAGE_CONFIG } from '@/lib/scoring/priority'
import { colorsByKey, foldCategories, GOLD_RAMP, STAGE_HEX } from '@/lib/charts/palette'
import { KpiCard } from '@/components/ui/kpi-card'
import { ChartCard } from '@/components/ui/chart-card'
import { ChartFrame } from '@/components/ui/chart-frame'
import { DonutChart } from '@/components/charts/lazy'
import { RingGauge } from '@/components/charts/ring-gauge'
import { HBarList } from '@/components/charts/hbar-list'
import { StaggerGroup, StaggerItem } from '@/components/motion/primitives'
import type { TabProps } from '../types'

const AGENT_COLUMNS = columns('agents', ['id', 'name'])
const INACTIVE = 'Agentes inactivos'
const fmt = (n: number) => n.toLocaleString('en-US')

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'

// Perdido va rayado, como en el Embudo: es una salida, no una etapa.
const stageBackground = (s: (typeof STAGES)[number]) =>
  s === 'perdido'
    ? `repeating-linear-gradient(45deg, ${STAGE_HEX.perdido} 0 2px, var(--bg-overlay) 2px 5px)`
    : STAGE_HEX[s]

export async function AgentesTab({ ctx }: TabProps) {
  const scope = scopeFor(ctx)

  // Una sola ola: la lista de agentes no depende de las estadísticas.
  const [{ data: agentRows }, analytics] = await Promise.all([
    createAdminClient()
      .from('agents')
      .select(AGENT_COLUMNS)
      .eq('tenant_id', scope.tenantId)
      .eq('active', true)
      .order('name'),
    getLeadAnalyticsStats(scope),
  ])

  const stats = new Map(analytics.byAgent.map(a => [a.agentId, a]))
  // Un agente sin leads no aparece en byAgent: entra en cero.
  const agents = ((agentRows ?? []) as unknown as { id: string; name: string }[]).map(a => {
    const s = stats.get(a.id)
    return {
      id: a.id,
      name: a.name,
      initials: initials(a.name),
      total: s?.total ?? 0,
      highQuality: s?.highQuality ?? 0,
      closed: s?.closed ?? 0,
      avgQuality: s?.avgQuality ?? 0,
      stages: s?.stages ?? {},
    }
  })

  // ── KPIs: cifras globales; los leads de agentes inactivos entran como sobrante ──
  const count = agents.length
  const summary = summarizeAgents(agents, {
    total: analytics.total,
    closed: analytics.closed,
    highQuality: analytics.qualityDistribution.alta ?? 0,
  })
  const { total: totalLeads, highQuality: totalHigh, closed: totalClosed, perAgent, inactive } = summary
  const activeLeads = agents.reduce((s, a) => s + a.total, 0)
  const closedPct = totalLeads > 0 ? Math.round((totalClosed / totalLeads) * 100) : 0
  const topHigh = agents.reduce<typeof agents[number] | null>(
    (best, a) => (a.highQuality > (best?.highQuality ?? 0) ? a : best), null,
  )

  // ── Ranking: por leads, desempata el nombre ──
  const ranking = [...agents].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  const rankMax = Math.max(1, inactive?.total ?? 0, ...ranking.map(a => a.total))

  // ── Reparto: dona pliegada a 5; el color sigue al agente por orden alfabético ──
  const folded = foldCategories([
    ...agents.filter(a => a.total > 0).map(a => ({ name: a.name, value: a.total })),
    ...(inactive ? [{ name: INACTIVE, value: inactive.total }] : []),
  ])
  const keptSorted = folded.filter(r => r.name !== 'Otras').sort((a, b) => a.name.localeCompare(b.name))
  const others = folded.find(r => r.name === 'Otras')
  const palette = colorsByKey(keptSorted.map(r => r.name))
  const shareData = [
    ...keptSorted.map(r => ({ ...r, color: palette[r.name] })),
    ...(others ? [{ ...others, color: GOLD_RAMP[GOLD_RAMP.length - 1] }] : []),
  ]

  const closedRows = [...agents]
    .sort((a, b) => b.closed - a.closed || a.name.localeCompare(b.name))
    .map(a => ({ key: a.id, label: a.name, value: a.closed }))

  const noAgents = <div className="top5-empty">Todavía no hay agentes activos.</div>

  return (
    <div>
      <StaggerGroup className="grid grid-cols-2 md:grid-cols-4 gap-4" style={{ marginBottom: '16px' }}>
        <StaggerItem>
          <KpiCard
            label="Agentes activos" value={count} highlight
            note={`${fmt(activeLeads)} leads de los agentes activos`}
            hint="Miembros del equipo con la cuenta activa."
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label="Leads por agente" value={perAgent} note="promedio del equipo"
            hint="Leads de los agentes activos divididos entre su número. No cuenta los de agentes inactivos."
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label="Calidad alta" value={totalHigh}
            note={topHigh ? `${fmt(topHigh.highQuality)} con ${topHigh.name.split(' ')[0]}` : undefined}
            hint="Leads en la banda más alta de calidad en toda la cartera, cerrados incluidos."
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label="Cerrados" value={totalClosed} note={`${closedPct}% de la cartera`}
            hint="Leads en etapa Cerrado asignados al equipo."
          />
        </StaggerItem>
      </StaggerGroup>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4" style={{ marginBottom: '16px' }}>
        <ChartCard
          title="Ranking del equipo"
          scope="Toda la cartera"
          hint="Ordenado por leads asignados. Haz clic en un agente para ver sus leads."
        >
          {count === 0 && !inactive ? noAgents : (
            <div>
              <div className="rank-row" data-head>
                <span /><span>Agente</span><span className="rank-hide-sm">Cartera</span>
                <span className="rank-num">Leads</span><span className="rank-num">Alta</span><span className="rank-num">Cerrados</span>
              </div>
              {ranking.map(a => (
                <Link key={a.id} href={`/leads?agent=${a.id}`} className="rank-row">
                  <span className="top5-avatar" aria-hidden="true">{a.initials}</span>
                  <span className="rank-name">{a.name}</span>
                  <span className="rank-track"><i style={{ width: `${(a.total / rankMax) * 100}%` }} /></span>
                  <span className="rank-num" data-strong>{fmt(a.total)}</span>
                  <span className="rank-num">{fmt(a.highQuality)}</span>
                  <span className="rank-num">{fmt(a.closed)}</span>
                </Link>
              ))}
              {inactive && (
                <div className="rank-row">
                  <span className="top5-avatar" aria-hidden="true" />
                  <span className="rank-name">{INACTIVE}</span>
                  <span className="rank-track"><i style={{ width: `${(inactive.total / rankMax) * 100}%` }} /></span>
                  <span className="rank-num" data-strong>{fmt(inactive.total)}</span>
                  <span className="rank-num">{fmt(inactive.highQuality)}</span>
                  <span className="rank-num">{fmt(inactive.closed)}</span>
                </div>
              )}
            </div>
          )}
        </ChartCard>

        <ChartCard title="Reparto de cartera" scope="Toda la cartera" hint="Qué parte de los leads tiene cada agente.">
          <ChartFrame
            height={128}
            empty={totalLeads === 0}
            emptyText="Todavía no hay leads asignados."
            label={`Reparto de cartera, ${fmt(totalLeads)} leads: ${shareData.map(s => `${s.name} ${s.value}`).join(', ')}`}
          >
            <DonutChart data={shareData} centerValue={totalLeads} centerLabel="leads" />
          </ChartFrame>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard
          title="Etapas por agente"
          scope="Estado actual"
          hint="En qué punto del embudo está la cartera de cada agente. Perdido va rayado porque es una salida."
        >
          {count === 0 ? noAgents : (
            <div>
              {ranking.map(a => (
                <div key={a.id} className="stage-row">
                  <span className="stage-name">{a.name}</span>
                  <div
                    className="stage-stack" role="img"
                    aria-label={`${a.name}: ${STAGES.map(s => `${STAGE_CONFIG[s].label} ${a.stages[s] ?? 0}`).join(', ')}`}
                  >
                    {STAGES.map(s => (a.stages[s] ?? 0) > 0 && (
                      <i key={s} title={`${STAGE_CONFIG[s].label}: ${a.stages[s]}`} style={{ flex: a.stages[s], background: stageBackground(s) }} />
                    ))}
                  </div>
                  <span className="stage-total">{fmt(a.total)}</span>
                </div>
              ))}
              <div className="stage-legend">
                {STAGES.map(s => (
                  <span key={s}><i style={{ background: stageBackground(s) }} />{STAGE_CONFIG[s].label}</span>
                ))}
              </div>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Calidad media"
          scope="Toda la cartera"
          hint="Promedio de calidad de los leads de cada agente, de 0 a 100. A diferencia del score, no lo mueve el paso del tiempo."
        >
          {count === 0 ? noAgents : (
            <div className="ring-grid">
              {ranking.map(a => <RingGauge key={a.id} value={a.avgQuality} label={a.name.split(' ')[0]} />)}
            </div>
          )}
        </ChartCard>

        <ChartCard title="Cerrados por agente" scope="Toda la cartera">
          {count === 0 ? noAgents : <HBarList rows={closedRows} />}
        </ChartCard>
      </div>
    </div>
  )
}
