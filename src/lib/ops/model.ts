// Modelo del panel de operación: convierte el uso medido, los límites de cada
// plan y lo que el super_admin anotó de cada proveedor en indicadores con
// estado. PURO (sin red ni Supabase): lo consumen la página /admin/operacion,
// la foto diaria de métricas y las alertas, y `test:unit` lo cubre entero.
//
// Regla de oro: un límite desconocido se muestra como desconocido ('unknown'),
// nunca como cero ni como "todo bien".

import { PLANS, PARTNER_SEAT } from '@/lib/plans'
import type { BillingCycle, SubscriptionPlan, SubscriptionStatus } from '@/lib/subscriptions'
import { OPS_JOBS, OPS_JOB_IDS, staleAfterMs, type OpsJobId } from '@/lib/ops/jobs'
import { parseQuotaStatus, quotaRemaining, type QuotaKind } from '@/lib/email/quota'

// ─── Entradas ────────────────────────────────────────────────────────────────

export interface TenantUsageRow {
  tenant_id:      string
  leads:          number
  agents:         number
  logins:         number
  web_properties: number
  emails_today:   number
  emails_month:   number
  ai_usd_month:   number
  storage_bytes:  number
}

export interface PlatformTotals {
  db_bytes: number
  storage:  Record<string, { bytes: number; objects: number }>
  emails:   Partial<Record<ResendAccountKey, { today: number; month: number }>>
  domains:  Partial<Record<ResendAccountKey, number>>
  ai_month: Partial<Record<AiProviderKey, number>>
  /** Cuota medida en cada envío (resend_quota_status). Desde la fase 3. */
  resend?:  Partial<Record<ResendAccountKey, unknown>>
  /** Correos del Send Email Hook de Auth (salen de la cuenta de ITMANO). */
  auth_emails?: { today: number; month: number; failed_today: number } | null
}

export type ResendAccountKey = 'itmano' | 'aj'
export type AiProviderKey = 'anthropic' | 'google_ai'

export interface ProviderSettingRow {
  key:                 string
  label:               string
  plan:                string | null
  monthly_cost_usd:    number | null
  monthly_budget_usd:  number | null
  daily_quota:         number | null
  monthly_quota:       number | null
  domain_slots:        number | null
  balance_usd:         number | null
  balance_recorded_at: string | null
  renews_on:           string | null
  key_expires_on:      string | null
  last_backup_at:      string | null
  notes:               string | null
  updated_at:          string
}

export interface TenantInfo {
  id:            string
  name:          string
  plan:          SubscriptionPlan
  status:        SubscriptionStatus
  billingExempt: boolean
  billingCycle:  BillingCycle | null
  trialEndsAt:   string | null
  aiLimitUsd:    number | null
  aiUnlimited:   boolean
}

export interface HeartbeatRow {
  job:                  string
  last_run_at:          string
  last_ok:              boolean
  last_ok_at:           string | null
  last_duration_ms:     number | null
  last_error:           string | null
  consecutive_failures: number
}

export interface OpsInput {
  usage:      TenantUsageRow[]
  totals:     PlatformTotals
  settings:   ProviderSettingRow[]
  tenants:    TenantInfo[]
  heartbeats: HeartbeatRow[]
  /** Gasto registrado desde que se anotó el saldo de cada proveedor de IA. */
  aiSpendSinceBalance: Partial<Record<AiProviderKey, number>>
}

// ─── Indicadores ─────────────────────────────────────────────────────────────

export type GaugeStatus = 'ok' | 'warn' | 'critical' | 'unknown'
export type GaugeUnit = 'count' | 'emails' | 'usd' | 'bytes' | 'domains'
/** Con qué frecuencia se reinicia el contador: decide el periodo de las alertas. */
export type GaugePeriod = 'day' | 'month' | 'none'

export interface Gauge {
  id:      string
  label:   string
  value:   number
  limit:   number | null
  unit:    GaugeUnit
  period:  GaugePeriod
  ratio:   number | null
  status:  GaugeStatus
  hint?:   string
  /** Para el snapshot diario: proveedor y cuenta de la métrica. */
  provider: string
  account?: string
  /** false = sólo informativo, no genera alerta (p. ej. límite contractual de un tenant exento). */
  alertable: boolean
}

export const WARN_RATIO = 0.8
export const CRITICAL_RATIO = 0.95

export function gaugeStatus(value: number, limit: number | null): { ratio: number | null; status: GaugeStatus } {
  if (limit === null || !Number.isFinite(limit)) return { ratio: null, status: 'unknown' }
  if (limit <= 0) return value > 0 ? { ratio: null, status: 'critical' } : { ratio: 0, status: 'ok' }
  const ratio = value / limit
  if (ratio >= CRITICAL_RATIO) return { ratio, status: 'critical' }
  if (ratio >= WARN_RATIO) return { ratio, status: 'warn' }
  return { ratio, status: 'ok' }
}

function gauge(g: Omit<Gauge, 'ratio' | 'status'> & { forceStatus?: GaugeStatus }): Gauge {
  const { forceStatus, ...rest } = g
  const s = gaugeStatus(g.value, g.limit)
  return { ...rest, ratio: s.ratio, status: forceStatus ?? s.status }
}

// ─── Proveedores ─────────────────────────────────────────────────────────────

const MB = 1024 * 1024
const GB = 1024 * MB

/** Límites del plan de Supabase que el panel compara. Free es el plan actual (2026-11). */
export const SUPABASE_PLAN_LIMITS: Record<'free' | 'pro', { dbBytes: number; storageBytes: number }> = {
  free: { dbBytes: 500 * MB, storageBytes: 1 * GB },
  pro:  { dbBytes: 8 * GB,   storageBytes: 100 * GB },
}

export interface ProviderCard {
  key:      string
  label:    string
  plan:     string | null
  monthlyCostUsd: number | null
  gauges:   Gauge[]
  /** Datos sueltos para mostrar (saldo restante, ritmo, etc.). */
  facts:    { label: string; value: string }[]
  status:   GaugeStatus
  notes:    string | null
}

function worst(statuses: GaugeStatus[]): GaugeStatus {
  if (statuses.includes('critical')) return 'critical'
  if (statuses.includes('warn')) return 'warn'
  if (statuses.length > 0 && statuses.every(s => s === 'unknown')) return 'unknown'
  return 'ok'
}

function settingFor(settings: ProviderSettingRow[], key: string): ProviderSettingRow | undefined {
  return settings.find(s => s.key === key)
}

function resendCard(input: OpsInput, account: ResendAccountKey): ProviderCard {
  const key = account === 'itmano' ? 'resend_itmano' : 'resend_aj'
  const s = settingFor(input.settings, key)
  const emails = resendUsage(input.totals, account)
  const domains = input.totals.domains[account] ?? 0
  const note = account === 'itmano'
    ? 'Incluye los Magic Links de Supabase y todo envío real de la cuenta.'
    : 'Cuenta propia de A&J: la paga A&J, pero un tope agotado corta sus envíos.'
  const exhausted = emails.exhausted
  const gauges = [
    gauge({ id: 'emails_today', label: 'Correos hoy', value: emails.today, limit: s?.daily_quota ?? null, unit: 'emails', period: 'day', provider: 'resend', account, alertable: true, hint: note, ...(exhausted === 'daily' && { forceStatus: 'critical' as const }) }),
    gauge({ id: 'emails_month', label: 'Correos del mes', value: emails.month, limit: s?.monthly_quota ?? null, unit: 'emails', period: 'month', provider: 'resend', account, alertable: true, ...(exhausted === 'monthly' && { forceStatus: 'critical' as const }) }),
    gauge({ id: 'domains', label: 'Dominios propios', value: domains, limit: s?.domain_slots ?? null, unit: 'domains', period: 'none', provider: 'resend', account, alertable: true }),
  ]
  const facts: { label: string; value: string }[] = []
  if (exhausted) facts.push({ label: 'Resend', value: exhausted === 'daily' ? 'Rechazó envíos hoy por el tope diario' : 'Rechazó envíos este mes por el tope mensual' })
  const auth = input.totals.auth_emails
  if (account === 'itmano' && auth) {
    facts.push({ label: 'Magic Links', value: `${formatValue('emails', auth.today)} hoy · ${formatValue('emails', auth.month)} en el mes` })
    if (auth.failed_today > 0) facts.push({ label: 'Magic Links fallidos hoy', value: String(auth.failed_today) })
  }
  return {
    key, label: s?.label ?? key, plan: s?.plan ?? null, monthlyCostUsd: s?.monthly_cost_usd ?? null,
    gauges, facts, status: worst(gauges.map(g => g.status)), notes: s?.notes ?? null,
  }
}

/**
 * Correos de una cuenta hoy y en el mes. Gana la fuente más alta: el contador
 * de envíos reales (resend_usage_daily), la cabecera de cuota de Resend o, para
 * los días anteriores a la fase 3, email_sends más los correos de Auth.
 */
export function resendUsage(totals: PlatformTotals, account: ResendAccountKey): { today: number; month: number; exhausted: QuotaKind | null } {
  const legacy = totals.emails[account] ?? { today: 0, month: 0 }
  const auth = account === 'itmano' && totals.auth_emails ? totals.auth_emails : { today: 0, month: 0 }
  const raw = totals.resend?.[account]
  const q = raw ? quotaRemaining(parseQuotaStatus(raw)) : null
  return {
    today: Math.max(legacy.today + auth.today, q?.usedToday ?? 0),
    month: Math.max(legacy.month + auth.month, q?.usedMonth ?? 0),
    exhausted: raw ? parseQuotaStatus(raw).exhausted : null,
  }
}

function daysInMonth(now: Date): number {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate()
}

function aiCard(input: OpsInput, provider: AiProviderKey, now: Date): ProviderCard {
  const s = settingFor(input.settings, provider)
  const month = Number(input.totals.ai_month[provider] ?? 0)
  const gauges: Gauge[] = [
    gauge({ id: 'spend_month', label: 'Gasto del mes', value: month, limit: s?.monthly_budget_usd ?? null, unit: 'usd', period: 'month', provider, alertable: true, hint: 'Gasto que registra el CRM en ai_usage_events. No incluye llamadas hechas fuera del CRM con la misma llave.' }),
  ]
  const facts: { label: string; value: string }[] = []

  // Ritmo: gasto del mes / días transcurridos × días del mes.
  const dayOfMonth = now.getUTCDate()
  const projected = dayOfMonth > 0 ? (month / dayOfMonth) * daysInMonth(now) : month
  facts.push({ label: 'Proyección del mes', value: formatValue('usd', projected) })

  if (s?.balance_usd != null && s.balance_recorded_at) {
    const spent = Number(input.aiSpendSinceBalance[provider] ?? 0)
    const remaining = Number(s.balance_usd) - spent
    gauges.push(gauge({
      id: 'balance_used', label: 'Saldo usado desde la última carga', value: spent, limit: Number(s.balance_usd),
      unit: 'usd', period: 'none', provider, alertable: true,
      hint: 'Saldo estimado: lo que anotaste al cargar crédito menos lo que registró el CRM desde entonces. La API del proveedor no expone el saldo.',
    }))
    facts.push({ label: 'Saldo estimado', value: formatValue('usd', Math.max(remaining, 0)) })
    const perDay = dayOfMonth > 0 ? month / dayOfMonth : 0
    if (perDay > 0) facts.push({ label: 'Alcanza para', value: `${Math.max(Math.floor(remaining / perDay), 0)} días al ritmo actual` })
  } else {
    facts.push({ label: 'Saldo estimado', value: 'Sin saldo anotado' })
  }

  return {
    key: provider, label: s?.label ?? provider, plan: s?.plan ?? null, monthlyCostUsd: s?.monthly_cost_usd ?? null,
    gauges, facts, status: worst(gauges.map(g => g.status)), notes: s?.notes ?? null,
  }
}

export function supabasePlanOf(settings: ProviderSettingRow[]): 'free' | 'pro' {
  return settingFor(settings, 'supabase')?.plan?.toLowerCase().trim() === 'pro' ? 'pro' : 'free'
}

function supabaseCard(input: OpsInput): ProviderCard {
  const s = settingFor(input.settings, 'supabase')
  const plan = supabasePlanOf(input.settings)
  const limits = SUPABASE_PLAN_LIMITS[plan]
  const storageBytes = Object.values(input.totals.storage).reduce((sum, b) => sum + Number(b.bytes ?? 0), 0)
  const gauges = [
    gauge({ id: 'db_bytes', label: 'Base de datos', value: Number(input.totals.db_bytes), limit: limits.dbBytes, unit: 'bytes', period: 'none', provider: 'supabase', alertable: true }),
    gauge({ id: 'storage_bytes', label: 'Storage', value: storageBytes, limit: limits.storageBytes, unit: 'bytes', period: 'none', provider: 'supabase', alertable: true, hint: 'El egress (lo que descargan las webs) sólo se ve en el panel de Supabase.' }),
  ]
  const facts = Object.entries(input.totals.storage)
    .sort((a, b) => Number(b[1].bytes) - Number(a[1].bytes))
    .map(([bucket, v]) => ({ label: bucket, value: `${formatValue('bytes', Number(v.bytes))} · ${v.objects} archivos` }))
  return {
    key: 'supabase', label: s?.label ?? 'Supabase', plan: s?.plan ?? 'free (supuesto)', monthlyCostUsd: s?.monthly_cost_usd ?? null,
    gauges, facts, status: worst(gauges.map(g => g.status)), notes: s?.notes ?? null,
  }
}

function infoCard(input: OpsInput, key: string): ProviderCard {
  const s = settingFor(input.settings, key)
  return {
    key, label: s?.label ?? key, plan: s?.plan ?? null, monthlyCostUsd: s?.monthly_cost_usd ?? null,
    gauges: [], facts: [], status: 'ok', notes: s?.notes ?? null,
  }
}

// ─── Tenants ─────────────────────────────────────────────────────────────────

export interface TenantRow {
  id:            string
  name:          string
  plan:          SubscriptionPlan
  status:        SubscriptionStatus
  billingExempt: boolean
  trialDaysLeft: number | null
  gauges:        Gauge[]
  storageBytes:  number
  usageStatus:   GaugeStatus
  /** Ingreso mensual estimado (USD) y costo variable de IA del mes. */
  revenueUsd:    number
  aiCostUsd:     number
}

function planLimit(v: number | 'unlimited' | 'multiple' | null): number | null {
  if (v === null) return 0
  if (v === 'unlimited') return null
  if (v === 'multiple') return PARTNER_SEAT.includedLogins
  return v
}

const PAYING: SubscriptionStatus[] = ['active', 'past_due', 'cancel_requested', 'change_requested']

export function monthlyRevenueUsd(t: TenantInfo): number {
  if (t.billingExempt || !PAYING.includes(t.status)) return 0
  const plan = PLANS[t.plan]
  if (t.billingCycle === 'year') return plan.priceAnnualUsd / 12
  return plan.priceUsd ?? plan.basePriceUsd ?? 0
}

function tenantRow(t: TenantInfo, u: TenantUsageRow | undefined, now: Date): TenantRow {
  const limits = PLANS[t.plan].limits
  const usage: TenantUsageRow = u ?? { tenant_id: t.id, leads: 0, agents: 0, logins: 0, web_properties: 0, emails_today: 0, emails_month: 0, ai_usd_month: 0, storage_bytes: 0 }
  // Un tenant exento (piloto) no paga el plan: sus límites contractuales se
  // muestran pero no alertan. Lo que cuesta dinero a ITMANO (IA) sí alerta.
  const contractual = !t.billingExempt
  const gauges = [
    gauge({ id: 'leads', label: 'Leads', value: Number(usage.leads), limit: planLimit(limits.leads), unit: 'count', period: 'none', provider: 'tenant', alertable: contractual }),
    gauge({ id: 'emails_month', label: 'Correos del mes', value: Number(usage.emails_month), limit: limits.emailsPerMonth, unit: 'emails', period: 'month', provider: 'tenant', alertable: contractual }),
    gauge({ id: 'ai_month', label: 'IA del mes', value: Number(usage.ai_usd_month), limit: t.aiUnlimited ? null : (t.aiLimitUsd ?? limits.aiBudgetUsd), unit: 'usd', period: 'month', provider: 'tenant', alertable: true }),
    gauge({ id: 'logins', label: 'Logins', value: Number(usage.logins), limit: planLimit(limits.logins), unit: 'count', period: 'none', provider: 'tenant', alertable: contractual }),
    gauge({ id: 'web_properties', label: 'Propiedades en la web', value: Number(usage.web_properties), limit: planLimit(limits.webProperties), unit: 'count', period: 'none', provider: 'tenant', alertable: contractual }),
  ]
  const trialDaysLeft = t.status === 'trial' && t.trialEndsAt
    ? Math.ceil((Date.parse(t.trialEndsAt) - now.getTime()) / 86_400_000)
    : null
  return {
    id: t.id, name: t.name, plan: t.plan, status: t.status, billingExempt: t.billingExempt, trialDaysLeft,
    gauges, storageBytes: Number(usage.storage_bytes),
    usageStatus: worst(gauges.filter(g => g.alertable || g.status === 'critical').map(g => g.status)),
    revenueUsd: monthlyRevenueUsd(t), aiCostUsd: Number(usage.ai_usd_month),
  }
}

// ─── Salud de los procesos ───────────────────────────────────────────────────

export type HealthStatus = 'ok' | 'stale' | 'failing' | 'never' | 'waiting'

export interface HealthRow {
  job:       OpsJobId
  label:     string
  trigger:   string
  status:    HealthStatus
  lastRunAt: string | null
  lastOkAt:  string | null
  lastError: string | null
  consecutiveFailures: number
}

export function healthOf(job: OpsJobId, hb: HeartbeatRow | undefined, now: Date): HealthStatus {
  const staleMs = staleAfterMs(job)
  if (!hb) return staleMs === null ? 'waiting' : 'never'
  if (!hb.last_ok) return 'failing'
  if (staleMs !== null && now.getTime() - Date.parse(hb.last_run_at) > staleMs) return 'stale'
  return 'ok'
}

// ─── Calendario ──────────────────────────────────────────────────────────────

export interface CalendarItem {
  id:       string
  label:    string
  date:     string
  daysLeft: number
  status:   GaugeStatus
}

/** Sin backup en el plan Free, avisar pasados estos días desde el último. */
export const BACKUP_EVERY_DAYS = 35

function dueStatus(daysLeft: number): GaugeStatus {
  if (daysLeft <= 3) return 'critical'
  if (daysLeft <= 14) return 'warn'
  return 'ok'
}

function daysUntil(iso: string, now: Date): number {
  // Fechas `date` (YYYY-MM-DD) se leen como medianoche UTC.
  return Math.ceil((Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso) - now.getTime()) / 86_400_000)
}

function calendar(input: OpsInput, now: Date): CalendarItem[] {
  const items: CalendarItem[] = []
  for (const s of input.settings) {
    if (s.renews_on) {
      const d = daysUntil(s.renews_on, now)
      items.push({ id: `${s.key}.renews`, label: `${s.label}: renovación`, date: s.renews_on, daysLeft: d, status: dueStatus(d) })
    }
    if (s.key_expires_on) {
      const d = daysUntil(s.key_expires_on, now)
      items.push({ id: `${s.key}.key`, label: `${s.label}: vence la llave`, date: s.key_expires_on, daysLeft: d, status: dueStatus(d) })
    }
  }
  if (supabasePlanOf(input.settings) === 'free') {
    const last = settingFor(input.settings, 'supabase')?.last_backup_at ?? null
    if (last) {
      const due = new Date(Date.parse(last) + BACKUP_EVERY_DAYS * 86_400_000).toISOString()
      const d = daysUntil(due, now)
      items.push({ id: 'supabase.backup', label: 'Backup manual de producción', date: due, daysLeft: d, status: dueStatus(d) })
    } else {
      items.push({ id: 'supabase.backup', label: 'Backup manual de producción (nunca anotado)', date: now.toISOString(), daysLeft: 0, status: 'critical' })
    }
  }
  for (const t of input.tenants) {
    if (t.status === 'trial' && t.trialEndsAt) {
      const d = daysUntil(t.trialEndsAt, now)
      items.push({ id: `trial.${t.id}`, label: `Prueba de ${t.name}`, date: t.trialEndsAt, daysLeft: d, status: dueStatus(d) })
    }
  }
  return items.sort((a, b) => a.daysLeft - b.daysLeft)
}

// ─── Modelo completo ─────────────────────────────────────────────────────────

export interface OpsModel {
  providers: ProviderCard[]
  tenants:   TenantRow[]
  health:    HealthRow[]
  calendar:  CalendarItem[]
  economics: { revenueUsd: number; aiCostUsd: number; marginUsd: number; fixedCostUsd: number }
}

export function buildOpsModel(input: OpsInput, now: Date = new Date()): OpsModel {
  const providers = [
    resendCard(input, 'itmano'),
    resendCard(input, 'aj'),
    aiCard(input, 'anthropic', now),
    aiCard(input, 'google_ai', now),
    supabaseCard(input),
    infoCard(input, 'vercel'),
    infoCard(input, 'paddle'),
    infoCard(input, 'dominio'),
  ]

  const usageById = new Map(input.usage.map(u => [u.tenant_id, u]))
  const tenants = input.tenants.map(t => tenantRow(t, usageById.get(t.id), now))

  const hbByJob = new Map(input.heartbeats.map(h => [h.job, h]))
  const health = OPS_JOB_IDS.map((job): HealthRow => {
    const hb = hbByJob.get(job)
    return {
      job, label: OPS_JOBS[job].label, trigger: OPS_JOBS[job].trigger,
      status: healthOf(job, hb, now),
      lastRunAt: hb?.last_run_at ?? null, lastOkAt: hb?.last_ok_at ?? null,
      lastError: hb?.last_error ?? null, consecutiveFailures: hb?.consecutive_failures ?? 0,
    }
  })

  const revenueUsd = tenants.reduce((s, t) => s + t.revenueUsd, 0)
  const aiCostUsd = tenants.reduce((s, t) => s + t.aiCostUsd, 0)
  const fixedCostUsd = input.settings.reduce((s, p) => s + Number(p.monthly_cost_usd ?? 0), 0)

  return {
    providers, tenants, health, calendar: calendar(input, now),
    economics: { revenueUsd, aiCostUsd, fixedCostUsd, marginUsd: revenueUsd - aiCostUsd - fixedCostUsd },
  }
}

// ─── Formato ─────────────────────────────────────────────────────────────────

export function formatValue(unit: GaugeUnit, value: number): string {
  if (unit === 'usd') return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (unit === 'bytes') {
    if (value >= GB) return `${(value / GB).toLocaleString('en-US', { maximumFractionDigits: 2 })} GB`
    return `${(value / MB).toLocaleString('en-US', { maximumFractionDigits: 1 })} MB`
  }
  return Math.round(value).toLocaleString('en-US')
}
