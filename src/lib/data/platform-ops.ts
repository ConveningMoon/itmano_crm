import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import type {
  AiProviderKey, HeartbeatRow, OpsInput, PlatformTotals, ProviderSettingRow, TenantInfo, TenantUsageRow,
} from '@/lib/ops/model'
import type { BillingCycle, SubscriptionPlan, SubscriptionStatus } from '@/lib/subscriptions'

// Lecturas del panel de operación (migración platform_ops). Las consume sólo el
// super_admin (/admin/operacion y el cron /api/cron/platform-ops): usan el admin
// client, como el resto del Centro de control, después de comprobar el rol.

const SETTINGS_COLUMNS = columns('provider_settings', [
  'key', 'label', 'plan', 'monthly_cost_usd', 'monthly_budget_usd', 'daily_quota', 'monthly_quota',
  'domain_slots', 'balance_usd', 'balance_recorded_at', 'renews_on', 'key_expires_on',
  'last_backup_at', 'notes', 'updated_at',
])
const HEARTBEAT_COLUMNS = columns('cron_heartbeats', [
  'job', 'last_run_at', 'last_ok', 'last_ok_at', 'last_duration_ms', 'last_error', 'consecutive_failures',
])
const TENANT_COLUMNS = columns('tenants', ['id', 'name', 'ai_monthly_limit_usd', 'ai_unlimited'])
const SUBSCRIPTION_COLUMNS = columns('subscriptions', [
  'tenant_id', 'plan', 'status', 'billing_exempt', 'billing_cycle', 'trial_ends_at',
])
const ALERT_COLUMNS = columns('platform_alerts', ['id', 'alert_key', 'severity', 'message', 'delivered', 'sent_at'])

export interface RecentAlert {
  id:        number
  alert_key: string
  severity:  'warn' | 'critical'
  message:   string
  delivered: boolean
  sent_at:   string
}

interface TenantRowDb { id: string; name: string; ai_monthly_limit_usd: number | string | null; ai_unlimited: boolean | null }
interface SubscriptionRowDb {
  tenant_id: string; plan: string | null; status: string | null; billing_exempt: boolean | null
  billing_cycle: string | null; trial_ends_at: string | null
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v))

function toSetting(r: Record<string, unknown>): ProviderSettingRow {
  return {
    key:                 String(r.key),
    label:               String(r.label),
    plan:                (r.plan as string | null) ?? null,
    monthly_cost_usd:    num(r.monthly_cost_usd),
    monthly_budget_usd:  num(r.monthly_budget_usd),
    daily_quota:         num(r.daily_quota),
    monthly_quota:       num(r.monthly_quota),
    domain_slots:        num(r.domain_slots),
    balance_usd:         num(r.balance_usd),
    balance_recorded_at: (r.balance_recorded_at as string | null) ?? null,
    renews_on:           (r.renews_on as string | null) ?? null,
    key_expires_on:      (r.key_expires_on as string | null) ?? null,
    last_backup_at:      (r.last_backup_at as string | null) ?? null,
    notes:               (r.notes as string | null) ?? null,
    updated_at:          String(r.updated_at),
  }
}

const EMPTY_TOTALS: PlatformTotals = { db_bytes: 0, storage: {}, emails: {}, domains: {}, ai_month: {} }
const AI_PROVIDERS: AiProviderKey[] = ['anthropic', 'google_ai']

export const getPlatformOpsInput = cache(async (): Promise<OpsInput & { recentAlerts: RecentAlert[] }> => {
  const db = createAdminClient()

  // Una ola: todo depende sólo de que seas super_admin.
  const [usageRes, totalsRes, settingsRes, heartbeatsRes, tenantsRes, subsRes, alertsRes] = await Promise.all([
    db.rpc('platform_usage'),
    db.rpc('platform_totals'),
    db.from('provider_settings').select(SETTINGS_COLUMNS).order('key'),
    db.from('cron_heartbeats').select(HEARTBEAT_COLUMNS),
    db.from('tenants').select(TENANT_COLUMNS).order('created_at'),
    db.from('subscriptions').select(SUBSCRIPTION_COLUMNS),
    db.from('platform_alerts').select(ALERT_COLUMNS).order('sent_at', { ascending: false }).limit(10),
  ])

  for (const [name, res] of Object.entries({ usageRes, totalsRes, settingsRes, heartbeatsRes, tenantsRes, subsRes, alertsRes })) {
    if (res.error) throw new Error(`platform-ops: ${name}: ${res.error.message}`)
  }

  const settings = ((settingsRes.data ?? []) as unknown as Record<string, unknown>[]).map(toSetting)

  // Segunda ola, sólo si hay saldo anotado: depende de la fecha en que se anotó.
  const withBalance = AI_PROVIDERS
    .map(p => ({ p, s: settings.find(x => x.key === p) }))
    .filter(({ s }) => s?.balance_usd != null && !!s.balance_recorded_at)
  const spends = await Promise.all(withBalance.map(async ({ p, s }) => {
    const { data, error } = await db.rpc('ai_spend_since', { p_provider: p, p_since: s!.balance_recorded_at! })
    if (error) throw new Error(`platform-ops: ai_spend_since(${p}): ${error.message}`)
    return [p, Number(data ?? 0)] as const
  }))

  const subByTenant = new Map(((subsRes.data ?? []) as unknown as SubscriptionRowDb[]).map(s => [s.tenant_id, s]))
  const tenants: TenantInfo[] = ((tenantsRes.data ?? []) as unknown as TenantRowDb[]).map(t => {
    const s = subByTenant.get(t.id)
    return {
      id:            t.id,
      name:          t.name,
      // Sin fila de suscripción cae a Esencial, igual que ai-limit.ts.
      plan:          ((s?.plan as SubscriptionPlan | undefined) ?? 'esencial'),
      status:        ((s?.status as SubscriptionStatus | undefined) ?? 'active'),
      billingExempt: s?.billing_exempt ?? false,
      billingCycle:  (s?.billing_cycle as BillingCycle | null) ?? null,
      trialEndsAt:   s?.trial_ends_at ?? null,
      aiLimitUsd:    num(t.ai_monthly_limit_usd),
      aiUnlimited:   t.ai_unlimited ?? false,
    }
  })

  return {
    usage:      ((usageRes.data ?? []) as TenantUsageRow[]).map(u => ({
      ...u,
      leads: Number(u.leads), agents: Number(u.agents), logins: Number(u.logins),
      web_properties: Number(u.web_properties), emails_today: Number(u.emails_today),
      emails_month: Number(u.emails_month), ai_usd_month: Number(u.ai_usd_month),
      storage_bytes: Number(u.storage_bytes),
    })),
    totals:     { ...EMPTY_TOTALS, ...((totalsRes.data ?? {}) as Partial<PlatformTotals>) },
    settings,
    tenants,
    heartbeats: (heartbeatsRes.data ?? []) as unknown as HeartbeatRow[],
    aiSpendSinceBalance: Object.fromEntries(spends),
    recentAlerts: (alertsRes.data ?? []) as unknown as RecentAlert[],
  }
})
