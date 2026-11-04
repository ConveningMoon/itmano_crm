import Link from 'next/link'
import { scopeFor } from '@/lib/auth/visibility'
import { getBusinessProfile } from '@/lib/data/business-profile'
import { getChannelLeadsTrend, getChannelsWithMetrics, type ChannelType } from '@/lib/data/channels'
import { businessTimeZone } from '@/lib/time-zones'
import { PERIODS } from '@/lib/dashboard/period'
import { overallConversion, planePoints } from '@/lib/dashboard/source-plane'
import { colorsByKey } from '@/lib/charts/palette'
import { KpiCard } from '@/components/ui/kpi-card'
import { ChartCard } from '@/components/ui/chart-card'
import { ChartFrame } from '@/components/ui/chart-frame'
import { Sparkline } from '@/components/charts/sparkline'
import { HBarList } from '@/components/charts/hbar-list'
import { DonutChart } from '@/components/charts/lazy'
import { StaggerGroup, StaggerItem } from '@/components/motion/primitives'
import { SourcePlane } from '../source-plane'
import type { TabProps } from '../types'

const fmt = (n: number) => n.toLocaleString('en-US')

const TYPE_LABELS: Record<ChannelType, string> = {
  lead_magnet: 'Lead Magnet', event: 'Evento', contact_form: 'Formulario', manychat_flow: 'ManyChat', manual: 'Manual',
}

export async function FuentesTab({ ctx, period }: TabProps) {
  const scope = scopeFor(ctx)

  // Ola 1: la zona horaria sale de la fila del tenant, que el layout ya leyó (cache()).
  const profile = scope.tenantId ? await getBusinessProfile(scope.tenantId) : null
  const timeZone = (profile && businessTimeZone(profile)) ?? 'UTC'

  // Ola 2: canales y tendencias son independientes. super_admin sin tenant no tiene
  // tendencias que pedir: las filas salen sin minigráfica.
  const [channels, trendAll] = await Promise.all([
    getChannelsWithMetrics(scope.tenantId, period, scope.agentId),
    scope.tenantId
      ? getChannelLeadsTrend(scope.tenantId, period, timeZone)
      : Promise.resolve({} as Record<string, number[]>),
  ])

  // La RPC de tendencias devuelve todo el tenant; el rol agent sólo ve las fuentes
  // que getChannelsWithMetrics ya filtró, así que las demás nunca salen de aquí.
  const trends: Record<string, number[]> = {}
  for (const c of channels) trends[c.id] = trendAll[c.id] ?? []

  const cfg = PERIODS.find(p => p.days === period) ?? PERIODS[1]
  const windowText = `${cfg.bucketDays === 1 ? 'Últimos' : 'Últimas'} ${cfg.label}`

  // ── KPIs ──
  const totalLeads = channels.reduce((s, c) => s + c.metrics.leadsInWindow, 0)
  const totalViews = channels.reduce((s, c) => s + c.metrics.pageViewsInWindow, 0)
  const conversion = overallConversion(channels.map(c => ({
    views: c.metrics.pageViewsInWindow, submissions: c.metrics.submissionsInWindow,
  })))
  const activeCount = channels.filter(c => c.active).length

  // Leads por bucket: suma elemento a elemento de las tendencias.
  const buckets = Math.max(0, ...channels.map(c => trends[c.id].length))
  const leadsSpark = Array.from({ length: buckets }, (_, i) =>
    channels.reduce((s, c) => s + (trends[c.id][i] ?? 0), 0))

  // ── Plano ──
  const points = planePoints(channels.map(c => ({
    id: c.id, name: c.name, leads: c.metrics.leadsInWindow, score: c.metrics.avgTempScore,
  })))

  // ── Leads por tipo: el color sigue al tipo, no a su rango ──
  const byType = new Map<ChannelType, number>()
  for (const c of channels) {
    if (c.metrics.leadsInWindow > 0) byType.set(c.channelType, (byType.get(c.channelType) ?? 0) + c.metrics.leadsInWindow)
  }
  const typeColors = colorsByKey((Object.keys(TYPE_LABELS) as ChannelType[]).map(k => TYPE_LABELS[k]))
  const typeData = [...byType.entries()]
    .map(([t, value]) => ({ name: TYPE_LABELS[t], value, color: typeColors[TYPE_LABELS[t]] }))
    .sort((a, b) => b.value - a.value)
  const typeTotal = typeData.reduce((s, r) => s + r.value, 0)

  // ── Conversión por fuente: sólo las que tienen vistas ──
  const convRows = channels
    .filter(c => c.metrics.conversionRate !== null && c.metrics.pageViewsInWindow > 0)
    .sort((a, b) => (b.metrics.conversionRate ?? 0) - (a.metrics.conversionRate ?? 0) || a.name.localeCompare(b.name))
    .map(c => ({ key: c.id, label: c.name, value: c.metrics.conversionRate ?? 0, display: `${c.metrics.conversionRate}%` }))

  // ── Tabla: todas las fuentes ──
  const tableRows = [...channels].sort((a, b) =>
    b.metrics.leadsInWindow - a.metrics.leadsInWindow || a.name.localeCompare(b.name))

  const sourcesLink = <Link href="/sources">Ir a Fuentes →</Link>

  return (
    <div>
      <StaggerGroup className="grid grid-cols-2 md:grid-cols-4 gap-4" style={{ marginBottom: '16px' }}>
        <StaggerItem className="col-span-2 md:col-span-1">
          <KpiCard
            label="Leads" value={totalLeads} highlight
            spark={totalLeads > 0 ? leadsSpark : undefined}
            note={windowText}
            hint="Leads captados por tus fuentes en el periodo elegido arriba. Un agente cuenta sólo las fuentes suyas."
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label="Vistas" value={totalViews}
            hint="Visitas a las páginas de tus fuentes en el periodo."
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label="Conversión" value={conversion} suffix="%"
            hint="Envíos de formulario entre vistas, sólo de las fuentes con vistas. Sin vistas, 0%."
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label="Fuentes activas" value={activeCount}
            note="Sin contar archivadas"
            hint="Fuentes en uso hoy, sin las archivadas. No cambia con el periodo."
          />
        </StaggerItem>
      </StaggerGroup>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-4" style={{ marginBottom: '16px' }}>
        <ChartCard
          title="Cantidad vs. score"
          scope={`${windowText} · una fuente por punto`}
          hint="Cada punto es una fuente. Más a la derecha trae más leads; más arriba, mejor score medio. Las líneas cortan en el promedio de tus fuentes. Toca un punto para encender su nombre y tócalo otra vez para apagarlo. El Top 3 combina cantidad y score. Las fuentes sin leads o sin score en el periodo no se pintan."
        >
          {points.length === 0 ? (
            <ChartFrame
              height={260} empty label=""
              emptyText={<span>Ninguna fuente captó leads con score en este periodo. {sourcesLink}</span>}
            >
              {null}
            </ChartFrame>
          ) : (
            <SourcePlane points={points} />
          )}
        </ChartCard>

        <ChartCard
          title="Leads por tipo"
          scope={windowText}
          hint="De qué tipo de fuente vienen los leads del periodo."
        >
          <ChartFrame
            height={128}
            empty={typeTotal === 0}
            emptyText={<span>Todavía no hay leads en este periodo. {sourcesLink}</span>}
            label={`Leads por tipo, ${fmt(typeTotal)} en total: ${typeData.map(t => `${t.name} ${t.value}`).join(', ')}`}
          >
            <DonutChart data={typeData} centerValue={typeTotal} centerLabel="leads" />
          </ChartFrame>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4">
        <ChartCard
          title="Conversión por fuente"
          scope={windowText}
          hint="Envíos de formulario entre vistas de cada fuente. Las fuentes sin vistas no entran al ranking porque no tienen cómo medirse; en la tabla aparecen con —."
        >
          <ChartFrame
            height={160}
            empty={convRows.length === 0}
            emptyText={<span>Ninguna fuente tuvo vistas en este periodo.</span>}
            label={`Conversión por fuente: ${convRows.map(r => `${r.label} ${r.display}`).join(', ')}`}
          >
            <HBarList rows={convRows} />
          </ChartFrame>
        </ChartCard>

        <ChartCard
          title="Todas las fuentes"
          scope={windowText}
          action={<Link href="/sources">Gestionar</Link>}
          hint="Cada fuente, activa o pausada, con su tendencia de leads, sus vistas, sus leads, su conversión y el score medio de sus leads. Sin vistas o sin score, un —."
        >
          {tableRows.length === 0 ? (
            <div className="top5-empty">Todavía no hay fuentes. {sourcesLink}</div>
          ) : (
            <div>
              <div className="src-row" data-head>
                <span>Fuente</span><span className="src-hide-sm">Tendencia</span><span className="src-num src-hide-sm">Vistas</span>
                <span className="src-num">Leads</span><span className="src-num">Conv.</span><span className="src-num">Score</span>
              </div>
              {tableRows.map(c => {
                const m = c.metrics
                const trend = trends[c.id]
                return (
                  <Link key={c.id} href={`/sources/${c.slug}`} className="src-row">
                    <span className="src-name">{c.name}</span>
                    <span className="src-trend src-hide-sm">
                      {trend.length > 1 && m.leadsInWindow > 0 ? <Sparkline values={trend} /> : <span className="src-dash">—</span>}
                    </span>
                    <span className="src-num src-hide-sm">{m.pageViewsInWindow > 0 ? fmt(m.pageViewsInWindow) : '—'}</span>
                    <span className="src-num" style={{ color: 'var(--text-primary)' }}>{fmt(m.leadsInWindow)}</span>
                    <span className="src-num">{m.conversionRate === null ? '—' : `${m.conversionRate}%`}</span>
                    <span className="src-num">{m.avgTempScore === null ? '—' : Math.round(m.avgTempScore)}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  )
}
