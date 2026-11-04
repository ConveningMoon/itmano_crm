import Link from 'next/link'
import { scopeFor } from '@/lib/auth/visibility'
import { getNewsletterGrowth, getNewsletterStats, SIN_DATOS, type NewsletterGrowth } from '@/lib/data/newsletter-stats'
import { getEditionsForTenant } from '@/lib/data/newsletters'
import { colorsByKey, foldCategories, GOLD_RAMP } from '@/lib/charts/palette'
import { KpiCard } from '@/components/ui/kpi-card'
import { ChartCard } from '@/components/ui/chart-card'
import { ChartFrame } from '@/components/ui/chart-frame'
import { AreaChart, BarsChart, DonutChart } from '@/components/charts/lazy'
import { HBarList } from '@/components/charts/hbar-list'
import { StaggerGroup, StaggerItem } from '@/components/motion/primitives'
import type { TabProps } from '../types'

const fmt = (n: number) => n.toLocaleString('en-US')

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const COVER = 'Portada'
const NO_GROWTH: NewsletterGrowth = { activeNow: 0, netReliable: true, monthly: [] }

// 'YYYY-MM' (o 'YYYY-MM-DD') a 'mar'. Sin toLocale: el servidor y el
// navegador no deben discrepar.
function monthLabel(key: string): string {
  const m = Number(key.slice(5, 7))
  return MONTHS[m - 1] ?? key
}

function shortDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export async function NewsletterTab({ ctx }: TabProps) {
  const { tenantId } = scopeFor(ctx)

  // Sólo lee: ensureNewsletterChannel crea el canal y no se llama aquí. Los tres
  // getters son independientes. Cifras de todo el equipo para cualquier rol.
  const [stats, growth, editions] = tenantId
    ? await Promise.all([
        getNewsletterStats(tenantId),
        getNewsletterGrowth(tenantId),
        getEditionsForTenant(tenantId),
      ])
    : [SIN_DATOS, NO_GROWTH, []]

  const t = stats.totals
  const newsletterLink = <Link href="/newsletters">Ir a Newsletters →</Link>
  const reliable = growth.netReliable

  // ── Crecimiento: neto si es fiable; si no, altas por mes ──
  const months = growth.monthly
  const growthRows = months.map(m => ({
    label: monthLabel(m.month),
    active: m.activeEnd,
    signups: m.signups,
  }))
  const growthHasData = reliable
    ? growthRows.some(r => r.active > 0)
    : growthRows.some(r => r.signups > 0)
  const growthTotal = growthRows.reduce((s, r) => s + r.signups, 0)

  // ── Origen: portada = activos menos los atribuidos a una edición ──
  const attributed = editions.reduce((s, e) => s + (stats.byEdition.get(e.id)?.subscribers ?? 0), 0)
  const cover = Math.max(0, t.subscribers - attributed)
  // Orden estable por publicación (las sin fecha, por creación): el color sigue a la
  // edición, no a su rango.
  const byPublish = [...editions].sort((a, b) =>
    (a.publishedAt ?? a.createdAt).localeCompare(b.publishedAt ?? b.createdAt) || a.id.localeCompare(b.id))
  const originRows = [
    { name: COVER, value: cover },
    ...byPublish.map(e => ({ name: e.title, value: stats.byEdition.get(e.id)?.subscribers ?? 0 })),
  ].filter(r => r.value > 0)
  const stableNames = originRows.map(r => r.name)
  const folded = foldCategories(originRows)
  const keptSorted = folded
    .filter(r => r.name !== 'Otras')
    .sort((a, b) => stableNames.indexOf(a.name) - stableNames.indexOf(b.name))
  const others = folded.find(r => r.name === 'Otras')
  const palette = colorsByKey(keptSorted.map(r => r.name))
  const originData = [
    ...keptSorted.map(r => ({ ...r, color: palette[r.name] })),
    ...(others ? [{ ...others, color: GOLD_RAMP[GOLD_RAMP.length - 1] }] : []),
  ]
  const originTotal = originData.reduce((s, r) => s + r.value, 0)

  // ── Vistas por edición: últimas 8 publicadas, la más nueva arriba ──
  const viewRows = editions
    .filter(e => e.status === 'published')
    .sort((a, b) => (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt))
    .slice(0, 8)
    .map(e => {
      const views = stats.byEdition.get(e.id)?.views ?? 0
      return {
        key: e.id,
        label: e.title,
        sublabel: shortDate(e.publishedAt),
        value: views,
      }
    })

  // ── Ediciones que más suscriben: top 5 de todas, con al menos un suscriptor ──
  const topRows = editions
    .map(e => ({ key: e.id, label: e.title, value: stats.byEdition.get(e.id)?.subscribers ?? 0 }))
    .filter(r => r.value > 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, 5)

  return (
    <div>
      <StaggerGroup className="grid grid-cols-2 md:grid-cols-4 gap-4" style={{ marginBottom: '16px' }}>
        <StaggerItem className="col-span-2 md:col-span-1">
          <KpiCard
            label="Suscriptores" value={t.subscribers} highlight
            spark={reliable && t.subscribers > 0 && growthRows.length > 1 ? growthRows.map(r => r.active) : undefined}
            note="Activos hoy"
            hint="Suscriptores activos de la newsletter, sin quienes se dieron de baja. Es el mismo número que muestra Newsletters. Cuenta a todo el equipo."
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label="Vistas" value={t.views}
            note="Acumuladas"
            hint="Vistas totales de todas tus ediciones desde que se publicaron. No cambia con el periodo elegido arriba."
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label="Publicadas" value={t.published}
            hint="Ediciones publicadas ahora mismo."
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label="Borradores" value={t.drafts}
            hint="Ediciones guardadas que todavía no se publican."
          />
        </StaggerItem>
      </StaggerGroup>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4" style={{ marginBottom: '16px' }}>
        <ChartCard
          title="Crecimiento de suscriptores"
          scope={reliable ? 'Últimos 7 meses · suscriptores activos al cierre de cada mes' : 'Últimos 7 meses · altas por mes'}
          hint={reliable
            ? 'Suscriptores activos al final de cada mes: las altas menos las bajas. No cambia con el periodo elegido arriba.'
            : 'Altas por mes. Hay bajas sin fecha registrada, así que no se puede calcular el neto con fiabilidad y por eso se muestran solo las altas. No cambia con el periodo elegido arriba.'}
        >
          <ChartFrame
            height={200}
            empty={!growthHasData}
            emptyText={<span>Todavía no hay suscriptores. {newsletterLink}</span>}
            label={reliable
              ? `Suscriptores activos por mes: ${growthRows.map(r => `${r.label} ${r.active}`).join('; ')}`
              : `Altas por mes, ${fmt(growthTotal)} en total: ${growthRows.map(r => `${r.label} ${r.signups}`).join('; ')}`}
          >
            {reliable ? (
              <AreaChart
                height={200}
                data={growthRows.map(r => ({ label: r.label, active: r.active }))}
                series={[{ key: 'active', name: 'Activos', color: GOLD_RAMP[1] }]}
              />
            ) : (
              <BarsChart height={200} data={growthRows.map(r => ({ label: r.label, value: r.signups }))} unit="altas" />
            )}
          </ChartFrame>
        </ChartCard>

        <ChartCard
          title="De dónde se suscriben"
          scope="Suscriptores activos hoy"
          hint="Portada reúne a quienes se suscribieron desde la página principal de la newsletter; cada edición, a quienes lo hicieron desde ella. Las ediciones menores se suman en Otras."
        >
          <ChartFrame
            height={128}
            empty={originTotal === 0}
            emptyText={<span>Todavía no hay suscriptores. {newsletterLink}</span>}
            label={`De dónde se suscriben, ${fmt(originTotal)} en total: ${originData.map(r => `${r.name} ${r.value}`).join(', ')}`}
          >
            <DonutChart data={originData} centerValue={originTotal} centerLabel="suscriptores" />
          </ChartFrame>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Vistas por edición"
          scope="Últimas 8 publicadas · desde su publicación"
          action={<Link href="/newsletters">Gestionar</Link>}
          hint="Vistas acumuladas de cada edición desde el día que se publicó hasta hoy, no solo del periodo elegido arriba. Por eso una edición antigua puede superar a una reciente. La más nueva va arriba."
        >
          <ChartFrame
            height={Math.max(96, viewRows.length * 52)}
            empty={viewRows.length === 0}
            emptyText={<span>Todavía no hay ediciones publicadas. {newsletterLink}</span>}
            label={`Vistas por edición: ${viewRows.map(r => `${r.label}${r.sublabel ? `, ${r.sublabel}` : ''}: ${r.value}`).join('; ')}`}
          >
            <HBarList rows={viewRows} stacked />
          </ChartFrame>
        </ChartCard>

        <ChartCard
          title="Ediciones que más suscriben"
          scope="Top 5 · suscriptores activos"
          hint="Las ediciones desde las que más gente se ha suscrito y sigue activa, entre todas, publicadas o no."
        >
          <ChartFrame
            height={Math.max(96, topRows.length * 32)}
            empty={topRows.length === 0}
            emptyText={<span>Ninguna edición ha captado suscriptores todavía. {newsletterLink}</span>}
            label={`Ediciones que más suscriben: ${topRows.map(r => `${r.label} ${r.value}`).join('; ')}`}
          >
            <HBarList rows={topRows} />
          </ChartFrame>
        </ChartCard>
      </div>
    </div>
  )
}
