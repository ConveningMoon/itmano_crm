import Link from 'next/link'
import { scopeFor } from '@/lib/auth/visibility'
import { getLeadAnalyticsStats, getLeadDashboardStats, ANALYTICS_MONTHS } from '@/lib/data/leads'
import { getScoreHistogram, getTopLeads } from '@/lib/data/dashboard-leads'
import { getRecentActivity } from '@/lib/data/activity'
import { getLeadSource } from '@/lib/leads/source'
import { QUALITY_BANDS, QUALITY_CONFIG, type Stage } from '@/lib/scoring/priority'
import { colorsByKey, foldCategories, GOLD_RAMP } from '@/lib/charts/palette'
import { KpiCard } from '@/components/ui/kpi-card'
import { ChartCard } from '@/components/ui/chart-card'
import { ChartFrame } from '@/components/ui/chart-frame'
import { AreaChart, BarsChart, DonutChart } from '@/components/charts/lazy'
import { CapsuleFunnel } from '@/components/charts/capsule-funnel'
import { StaggerGroup, StaggerItem } from '@/components/motion/primitives'
import { ActivityRow } from '../../activity/activity-ui'
import { TopLeads } from '../top-leads'
import type { TabProps } from '../types'

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// Orden fijo de las fuentes: el color sigue a la fuente y no a su rango, así que
// una fuente no cambia de tono cuando otra la rebasa en el conteo.
const SOURCE_ORDER = [
  'manual', 'import', 'instagram', 'facebook', 'whatsapp', 'lead_magnet', 'event',
  'contact_form', 'newsletter', 'manychat', 'other',
]

const FUNNEL: { key: Stage; label: string }[] = [
  { key: 'nuevo', label: 'Nuevo' },
  { key: 'nutricion', label: 'Nutrición' },
  { key: 'en_proceso', label: 'En proceso' },
  { key: 'cerrado', label: 'Cerrado' },
  { key: 'perdido', label: 'Perdido' },
]

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
const fmt = (n: number) => n.toLocaleString('en-US')

export async function GeneralTab({ ctx }: TabProps) {
  const { role, user_id } = ctx
  const scope = scopeFor(ctx)

  // Una sola ola de lecturas: ninguna depende de otra.
  const [leadStats, analytics, top, histogram, activity] = await Promise.all([
    getLeadDashboardStats(scope),
    getLeadAnalyticsStats(scope),
    getTopLeads(scope),
    getScoreHistogram(scope),
    getRecentActivity(scope.tenantId, { role, userId: user_id }, 4, scope.agentId),
  ])

  // ── KPIs ──
  const conversion = analytics.attributedTotal > 0
    ? Math.round((analytics.attributedClosed / analytics.attributedTotal) * 100)
    : 0

  // ── Evolución: eje de 7 meses (UTC), los sin altas en cero ──
  const now = new Date()
  const byMonth = new Map(analytics.monthly.map(m => [m.month, m]))
  const evolution: { label: string; altas: number; cerradas: number }[] = []
  for (let i = ANALYTICS_MONTHS - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const row = byMonth.get(monthKey(d))
    evolution.push({ label: MONTH_LABELS[d.getUTCMonth()], altas: row?.leads ?? 0, cerradas: row?.cerrado ?? 0 })
  }
  const evolutionEmpty = evolution.every(m => m.altas === 0)

  // ── Embudo ──
  const stages = FUNNEL.map(s => ({ ...s, count: leadStats.byStage[s.key] ?? 0 }))

  // ── Fuentes: se agrupa por kind (como /leads) y se pliega a 5 con "Otras" ──
  const sources = new Map<string, { label: string; value: number; top: number }>()
  for (const row of analytics.bySource) {
    const src = getLeadSource(row.channelType, row.trafficSource)
    const prev = sources.get(src.kind)
    sources.set(src.kind, {
      // 'other' junta varias etiquetas: nombra el grupo la mayoritaria.
      label: !prev || row.total > prev.top ? src.label : prev.label,
      value: (prev?.value ?? 0) + row.total,
      top: Math.max(prev?.top ?? 0, row.total),
    })
  }
  const kindOfLabel = new Map<string, string>()
  const folded = foldCategories(
    [...sources.entries()].map(([kind, s]) => {
      kindOfLabel.set(s.label, kind)
      return { name: s.label, value: s.value }
    }),
  )
  const stableIdx = (name: string) => {
    const i = SOURCE_ORDER.indexOf(kindOfLabel.get(name) ?? '')
    return i === -1 ? SOURCE_ORDER.length : i
  }
  // Las conservadas siguen el orden fijo de fuentes; "Otras" toma el último tono.
  const keptSorted = folded.filter(r => r.name !== 'Otras').sort((a, b) => stableIdx(a.name) - stableIdx(b.name))
  const others = folded.find(r => r.name === 'Otras')
  const sourceColors = colorsByKey(keptSorted.map(r => r.name))
  const sourceData = [
    ...keptSorted.map(r => ({ ...r, color: sourceColors[r.name] })),
    ...(others ? [{ ...others, color: GOLD_RAMP[GOLD_RAMP.length - 1] }] : []),
  ]
  const sourceTotal = sourceData.reduce((s, r) => s + r.value, 0)

  // ── Calidad: 5 bandas, rampa en el orden de las bandas ──
  const qualityData = QUALITY_BANDS.map((b, i) => ({
    name: QUALITY_CONFIG[b].label,
    value: analytics.qualityDistribution[b] ?? 0,
    color: GOLD_RAMP[i],
  }))
  const qualityTotal = qualityData.reduce((s, r) => s + r.value, 0)

  // ── Histograma: 10 tramos, de oscuro (score bajo) a claro ──
  const histData = histogram.map((value, i) => ({
    label: String(i * 10),
    value,
    color: GOLD_RAMP[4 - Math.floor(i / 2)],
  }))
  const histTotal = histogram.reduce((s, v) => s + v, 0)

  return (
    <div>
      <StaggerGroup className="grid grid-cols-2 md:grid-cols-4 gap-4" style={{ marginBottom: '16px' }}>
        <StaggerItem>
          <KpiCard
            label="Cartera activa" value={leadStats.active} highlight
            note={`${fmt(analytics.thisMonth.leads)} altas este mes`}
            hint="Leads en etapa Nuevo o En Nutrición. Incluye los importados de otro CRM, que el Embudo deja fuera: por eso las dos cifras pueden diferir."
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label="Calidad alta" value={leadStats.highQuality}
            hint="Leads en la banda más alta de calidad de tu cartera activa."
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label="Para hoy" value={leadStats.urgentToday} note="requieren acción"
            href="/leads?sort=prioridad"
            hint="Leads con urgencia activa hoy. Al hacer clic abre la lista ordenada por prioridad."
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label="Cerrados" value={leadStats.closedThisMonth}
            note={`este mes · ${conversion}% conversión`}
            hint="Leads cerrados durante este mes calendario. La conversión es cerrados sobre leads captados por ITMANO: los importados de otro CRM no cuentan."
          />
        </StaggerItem>
      </StaggerGroup>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ marginBottom: '16px' }}>
        <ChartCard
          title="Evolución de leads"
          scope="Últimos 7 meses · no cambia con el periodo"
          hint="Leads creados cada mes y, de esos, cuántos están cerrados hoy. Cada mes es un grupo de altas: no indica cuándo se cerraron. Los importados de otro CRM no cuentan."
        >
          <ChartFrame
            height={230}
            empty={evolutionEmpty}
            emptyText="Todavía no hay leads en estos meses."
            label={`Altas por mes y cerradas hoy de cada grupo: ${evolution.map(m => `${m.label} ${m.altas} altas, ${m.cerradas} cerradas`).join('; ')}`}
          >
            <AreaChart
              height={230}
              data={evolution}
              series={[
                { key: 'altas', name: 'Altas', color: GOLD_RAMP[1] },
                { key: 'cerradas', name: 'Cerradas', color: GOLD_RAMP[0] },
              ]}
            />
          </ChartFrame>
        </ChartCard>

        <ChartCard
          title="Embudo"
          scope="Estado actual · no cambia con el periodo"
          action={<Link href="/leads">Ver leads →</Link>}
          hint={
            <>
              Leads que están hoy en cada etapa: el mismo número que ves en el kanban. Perdido va rayado porque es una salida, no una etapa.
              {leadStats.imported > 0 && ` ${fmt(leadStats.imported)} importados de otro CRM quedan fuera.`}
            </>
          }
        >
          <CapsuleFunnel stages={stages} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ marginBottom: '16px' }}>
        <ChartCard title="Top 5" scope="Etapas Nuevo, Nutrición y En proceso">
          <TopLeads hot={top.hot} recent={top.recent} />
        </ChartCard>

        <ChartCard title="Leads por fuente" scope="Toda la cartera">
          <ChartFrame
            height={128}
            empty={sourceTotal === 0}
            emptyText="Todavía no hay leads con fuente."
            label={`Leads por fuente, ${fmt(sourceTotal)} en total: ${sourceData.map(s => `${s.name} ${s.value}`).join(', ')}`}
          >
            <DonutChart data={sourceData} centerValue={sourceTotal} centerLabel="leads" />
          </ChartFrame>
        </ChartCard>

        <ChartCard
          title="Calidad"
          scope="Toda la cartera"
          hint="Cómo se reparte toda tu cartera entre las cinco bandas. Más claro significa mejor calidad."
        >
          <ChartFrame
            height={128}
            empty={qualityTotal === 0}
            emptyText="Todavía no hay leads para clasificar."
            label={`Calidad de la cartera, ${fmt(qualityTotal)} leads: ${qualityData.map(q => `${q.name} ${q.value}`).join(', ')}`}
          >
            <DonutChart data={qualityData} centerValue={qualityTotal} centerLabel="leads" />
          </ChartFrame>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Distribución de score"
          scope="Cartera activa"
          hint="Cuántos leads tienen cada rango de score actual; cada tramo lleva el inicio de su rango de 10 puntos. Una cola larga a la derecha indica una cartera caliente."
        >
          <ChartFrame
            height={200}
            empty={histTotal === 0}
            emptyText="Todavía no hay leads activos con score."
            label={`Distribución de score de ${fmt(histTotal)} leads activos por tramos de 10: ${histData.map(h => `${h.label} ${h.value}`).join(', ')}`}
          >
            <BarsChart height={200} data={histData} unit="leads" />
          </ChartFrame>
        </ChartCard>

        <ChartCard
          title="Actividad reciente"
          action={<Link href="/activity">Ver toda →</Link>}
        >
          {activity.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
              No hay actividad todavía.
            </div>
          ) : (
            activity.map((item, idx) => (
              <div key={item.id}>
                <ActivityRow item={item} />
                {idx < activity.length - 1 && <div style={{ height: '1px', background: 'var(--border-subtle)' }} />}
              </div>
            ))
          )}
        </ChartCard>
      </div>
    </div>
  )
}
