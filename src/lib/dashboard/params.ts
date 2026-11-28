import { DEFAULT_PERIOD, PERIODS, type PeriodDays } from './period'
import { PLANS } from '@/lib/plans'
import type { SubscriptionPlan } from '@/lib/subscriptions'

export type DashboardTab = 'general' | 'agentes' | 'emails' | 'fuentes' | 'newsletter'

interface TabOptions {
  canSeeAgents: boolean
  // La pestaña Agentes se lista pero muestra un adelanto cuando el plan no
  // incluye la vista de equipo (Partner). Sólo afecta al render, no a la visibilidad.
  agentsLocked?: boolean
  canSeeNewsletter: boolean
}

// La vista de equipo es de Partner; los tenants exentos de facturación la tienen.
export function isAgentsTabLocked(plan: SubscriptionPlan, billingExempt: boolean): boolean {
  return !billingExempt && !PLANS[plan].features.teamAnalytics
}

const TABS: { key: DashboardTab; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'agentes', label: 'Agentes' },
  { key: 'emails', label: 'Emails' },
  { key: 'fuentes', label: 'Fuentes' },
  { key: 'newsletter', label: 'Newsletter' },
]

export function visibleTabs(opts: TabOptions): { key: DashboardTab; label: string }[] {
  return TABS.filter(t =>
    t.key === 'agentes' ? opts.canSeeAgents : t.key === 'newsletter' ? opts.canSeeNewsletter : true,
  )
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export function parseDashboardParams(
  raw: Record<string, string | string[] | undefined>,
  opts: TabOptions,
): { tab: DashboardTab; period: PeriodDays } {
  const tabRaw = first(raw.tab)
  const tab = visibleTabs(opts).find(t => t.key === tabRaw)?.key ?? 'general'
  const periodRaw = Number(first(raw.periodo))
  const period = PERIODS.find(p => p.days === periodRaw)?.days ?? DEFAULT_PERIOD
  return { tab, period }
}

export function tabUsesPeriod(tab: DashboardTab): boolean {
  return tab === 'emails' || tab === 'fuentes'
}

const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// Etiqueta de un bucket a partir de su fecha de inicio (YYYY-MM-DD, UTC).
export function bucketLabel(startIso: string, bucketDays: 1 | 7): string {
  const start = new Date(`${startIso}T00:00:00Z`)
  if (bucketDays === 1) return `${DAYS[start.getUTCDay()]} ${start.getUTCDate()}`
  const end = new Date(start.getTime() + 6 * 86_400_000)
  const sameMonth = start.getUTCMonth() === end.getUTCMonth()
  const from = sameMonth
    ? `${start.getUTCDate()}`
    : `${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]}`
  return `${from}–${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]}`
}
