import Link from 'next/link'
import { AlertTriangle, Check } from 'lucide-react'
import { scopeFor } from '@/lib/auth/visibility'
import { getBusinessProfile } from '@/lib/data/business-profile'
import { getEmailDashboardStats } from '@/lib/data/dashboard-emails'
import { listSequences } from '@/lib/data/email-sequences'
import { businessTimeZone } from '@/lib/time-zones'
import { bucketLabel } from '@/lib/dashboard/params'
import { PERIODS } from '@/lib/dashboard/period'
import {
  BOUNCE_ALERT_OVER, UNSUB_ALERT_OVER, emailHealth, type EmailHealthKind,
} from '@/lib/dashboard/email-health'
import { colorsByKey, GOLD_RAMP } from '@/lib/charts/palette'
import { KpiCard } from '@/components/ui/kpi-card'
import { ChartCard } from '@/components/ui/chart-card'
import { ChartFrame } from '@/components/ui/chart-frame'
import { BarsChart, DonutChart } from '@/components/charts/lazy'
import { StaggerGroup, StaggerItem } from '@/components/motion/primitives'
import type { TabProps } from '../types'

const fmt = (n: number) => n.toLocaleString('en-US')

const CLASS_KEYS = [
  { key: 'secuencias', name: 'Secuencias' },
  { key: 'grupales', name: 'Grupales' },
  { key: 'etiqueta', name: 'Por etiqueta' },
  { key: 'cierre', name: 'De cierre' },
  { key: 'otros', name: 'Otros' },
] as const

const GOOD_TEXT: Record<EmailHealthKind, string> = {
  click: 'Saludable', reply: 'Saludable', bounce: 'Bajo control', unsub: 'Bajo control',
}
const ALERT_TEXT: Partial<Record<EmailHealthKind, string>> = {
  bounce: `Por encima de ${BOUNCE_ALERT_OVER}%`, unsub: `Por encima de ${UNSUB_ALERT_OVER}%`,
}

// Estado en la nota de la tarjeta: icono y texto, nunca sólo color.
function healthNote(kind: EmailHealthKind, rate: number, sends: number) {
  const state = emailHealth(kind, rate, sends)
  if (!state) return undefined // sin envíos o tasa baja: no se afirma nada
  return state === 'alert' ? (
    <span className="kpi-health" data-state="alert"><AlertTriangle size={12} aria-hidden="true" />{ALERT_TEXT[kind]}</span>
  ) : (
    <span className="kpi-health" data-state="ok"><Check size={12} aria-hidden="true" />{GOOD_TEXT[kind]}</span>
  )
}

export async function EmailsTab({ ctx, period }: TabProps) {
  const scope = scopeFor(ctx)

  // Ola 1: la zona horaria sale de la fila del tenant, que el layout ya leyó (cache()).
  // super_admin sin tenant activo no tiene zona propia: UTC.
  const profile = scope.tenantId ? await getBusinessProfile(scope.tenantId) : null
  const timeZone = (profile && businessTimeZone(profile)) ?? 'UTC'

  // Ola 2: estadísticas y secuencias son independientes.
  const [stats, sequences] = await Promise.all([
    getEmailDashboardStats(scope, period, timeZone),
    listSequences(scope.tenantId, scope.agentId),
  ])

  const cfg = PERIODS.find(p => p.days === period) ?? PERIODS[1]
  const perBar = cfg.bucketDays === 1 ? 'día' : 'semana'
  const windowText = `${cfg.bucketDays === 1 ? 'Últimos' : 'Últimas'} ${cfg.label}`
  const sends = stats.totalSends

  const emailsLink = <Link href="/emails">Ir a Emails →</Link>
  const emptySends = <span>Todavía no hay envíos en este periodo. {emailsLink}</span>

  // ── Envíos: una barra por bucket; la serie puede venir vacía si la RPC falló ──
  const bars = stats.series.map(b => ({ label: bucketLabel(b.start, cfg.bucketDays), value: b.sends }))
  const barsTotal = bars.reduce((s, b) => s + b.value, 0)

  // ── Clases de correo: el color sigue a la clase, no a su rango ──
  const classColors = colorsByKey(CLASS_KEYS.map(c => c.name))
  const classData = CLASS_KEYS
    .map(c => ({ name: c.name, value: stats.byClass[c.key], color: classColors[c.name] }))
    .filter(c => c.value > 0)
  const classTotal = classData.reduce((s, c) => s + c.value, 0)

  // ── Por secuencia: sólo las que enviaron en el periodo, de mayor a menor ──
  const seqRows = sequences
    .map(s => ({ id: s.id, name: s.name, m: stats.bySequence[s.id] }))
    .filter(r => r.m && r.m.totalSends > 0)
    .sort((a, b) => b.m.totalSends - a.m.totalSends || a.name.localeCompare(b.name))

  // ── Estado de secuencias: foto actual de las corridas de las secuencias visibles ──
  const active = sequences.reduce((s, q) => s + q.activeRunCount, 0)
  const completed = sequences.reduce((s, q) => s + q.completedRunCount, 0)
  const cancelled = sequences.reduce((s, q) => s + q.cancelledRunCount, 0)
  const runsTotal = active + completed + cancelled
  const completionRate = runsTotal > 0 ? Math.round((completed / runsTotal) * 100) : 0
  const runData = [
    { name: 'Completados', value: completed, color: GOLD_RAMP[1] },
    { name: 'Activos', value: active, color: GOLD_RAMP[0] },
    { name: 'Cancelados', value: cancelled, color: GOLD_RAMP[4] },
  ].filter(r => r.value > 0)

  return (
    <div>
      <StaggerGroup className="grid grid-cols-2 md:grid-cols-5 gap-4" style={{ marginBottom: '16px' }}>
        <StaggerItem className="col-span-2 md:col-span-1">
          <KpiCard
            label="Enviados" value={sends} highlight
            spark={sends > 0 ? stats.series.map(b => b.sends) : undefined}
            note={`${fmt(stats.uniqueLeads)} leads únicos`}
            hint="Correos enviados en el periodo por secuencias, grupales, etiquetas, cierre y otros. Para un agente cuenta todo lo recibido por sus leads."
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label="Clics" value={stats.clickRate} suffix="%"
            note={healthNote('click', stats.clickRate, sends)}
            hint="Porcentaje de leads que hicieron clic en un correo del periodo. Es la señal fiable: las aperturas no se miden."
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label="Respuestas" value={stats.replyRate} suffix="%"
            note={healthNote('reply', stats.replyRate, sends)}
            hint="Porcentaje de leads que contestaron un correo del periodo."
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label="Rebotes" value={stats.bounceRate} suffix="%"
            note={healthNote('bounce', stats.bounceRate, sends)}
            hint={`Porcentaje de leads cuyo correo no se entregó. Conviene mantenerlo en ${BOUNCE_ALERT_OVER}% o menos.`}
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label="Bajas" value={stats.unsubscribeRate} suffix="%"
            note={healthNote('unsub', stats.unsubscribeRate, sends)}
            hint={`Porcentaje de leads que se dieron de baja. Conviene mantenerlo en ${UNSUB_ALERT_OVER}% o menos.`}
          />
        </StaggerItem>
      </StaggerGroup>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4" style={{ marginBottom: '16px' }}>
        <ChartCard
          title="Envíos"
          scope={`${windowText} · una barra por ${perBar}`}
          hint="Correos enviados en el periodo elegido arriba. Pasa el cursor por una barra para ver sus fechas y su total."
        >
          <ChartFrame
            height={200}
            empty={bars.length === 0 || barsTotal === 0}
            emptyText={emptySends}
            label={`Envíos, ${fmt(barsTotal)} en total: ${bars.map(b => `${b.label} ${b.value}`).join('; ')}`}
          >
            <BarsChart height={200} data={bars} unit="correos" />
          </ChartFrame>
        </ChartCard>

        <ChartCard
          title="Clases de correo"
          scope={windowText}
          hint="Cuánto de lo enviado viene de cada tipo de correo. Otros reúne los correos sueltos y los de open house."
        >
          <ChartFrame
            height={128}
            empty={classTotal === 0}
            emptyText={emptySends}
            label={`Clases de correo, ${fmt(classTotal)} en total: ${classData.map(c => `${c.name} ${c.value}`).join(', ')}`}
          >
            <DonutChart data={classData} centerValue={classTotal} centerLabel="correos" />
          </ChartFrame>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
        <ChartCard
          title="Por secuencia"
          scope={windowText}
          action={<Link href="/emails">Gestionar</Link>}
          hint={`Métricas de cada secuencia que envió en el periodo. Sólo cuenta secuencias, y un agente ve únicamente las suyas: por eso la suma puede ser menor que Enviados. El aviso aparece si los rebotes superan ${BOUNCE_ALERT_OVER}% o las bajas ${UNSUB_ALERT_OVER}%.`}
        >
          {seqRows.length === 0 ? (
            <div className="top5-empty">Ninguna secuencia envió correos en este periodo. {emailsLink}</div>
          ) : (
            <div>
              <div className="seq-row" data-head>
                <span>Secuencia</span><span className="seq-num">Enviados</span><span className="seq-clicks-head">Clics</span>
                <span className="seq-num seq-hide-sm">Respuesta</span><span className="seq-num">Rebote</span><span className="seq-num">Bajas</span>
              </div>
              {seqRows.map(({ id, name, m }) => {
                const bounceAlert = emailHealth('bounce', m.bounceRate, m.totalSends) === 'alert'
                const unsubAlert = emailHealth('unsub', m.unsubscribeRate, m.totalSends) === 'alert'
                return (
                  <Link key={id} href={`/emails/${id}`} className="seq-row">
                    <span className="seq-name">{name}</span>
                    <span className="seq-num">{fmt(m.totalSends)}</span>
                    <span className="seq-clicks">
                      <span className="rank-track seq-bar"><i style={{ width: `${Math.min(100, m.clickRate)}%` }} /></span>
                      <span className="seq-num" style={{ color: 'var(--text-primary)' }}>{m.clickRate}%</span>
                    </span>
                    <span className="seq-num seq-hide-sm">{m.replyRate}%</span>
                    <span className="seq-num" data-alert={bounceAlert || undefined}>
                      {bounceAlert && <AlertTriangle size={11} aria-label="Por encima del umbral" />}{m.bounceRate}%
                    </span>
                    <span className="seq-num" data-alert={unsubAlert || undefined}>
                      {unsubAlert && <AlertTriangle size={11} aria-label="Por encima del umbral" />}{m.unsubscribeRate}%
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Estado de secuencias"
          scope="Estado actual · no cambia con el periodo"
          hint="Leads que están recorriendo una secuencia, ya la terminaron o la cancelaron. En el centro, qué parte terminó."
        >
          <ChartFrame
            height={128}
            empty={runsTotal === 0}
            emptyText={<span>Todavía no hay leads en secuencias. {emailsLink}</span>}
            label={`Estado de secuencias, ${fmt(runsTotal)} leads: ${runData.map(r => `${r.name} ${r.value}`).join(', ')}`}
          >
            <DonutChart data={runData} centerValue={`${completionRate}%`} centerLabel="completado" />
          </ChartFrame>
        </ChartCard>
      </div>
    </div>
  )
}
