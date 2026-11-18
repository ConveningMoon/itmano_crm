import { describe, expect, it } from 'vitest'
import {
  buildOpsModel, gaugeStatus, healthOf, monthlyRevenueUsd, SUPABASE_PLAN_LIMITS,
  type OpsInput, type ProviderSettingRow, type TenantInfo,
} from '@/lib/ops/model'
import { staleAfterMs } from '@/lib/ops/jobs'
import { heartbeatOutcome } from '@/lib/ops/heartbeat-outcome'

const NOW = new Date('2026-11-18T12:00:00Z')

function setting(key: string, over: Partial<ProviderSettingRow> = {}): ProviderSettingRow {
  return {
    key, label: key, plan: null, monthly_cost_usd: null, monthly_budget_usd: null, daily_quota: null,
    monthly_quota: null, domain_slots: null, balance_usd: null, balance_recorded_at: null, renews_on: null,
    key_expires_on: null, last_backup_at: null, notes: null, updated_at: NOW.toISOString(), ...over,
  }
}

function tenant(over: Partial<TenantInfo> = {}): TenantInfo {
  return {
    id: 'tenant-x', name: 'X', plan: 'esencial', status: 'active', billingExempt: false,
    billingCycle: null, trialEndsAt: null, aiLimitUsd: 12, aiUnlimited: false, ...over,
  }
}

function input(over: Partial<OpsInput> = {}): OpsInput {
  return {
    usage: [], totals: { db_bytes: 0, storage: {}, emails: {}, domains: {}, ai_month: {} },
    settings: [], tenants: [], heartbeats: [], aiSpendSinceBalance: {}, ...over,
  }
}

describe('gaugeStatus', () => {
  it('sin límite es desconocido, nunca "bien"', () => {
    expect(gaugeStatus(10, null)).toEqual({ ratio: null, status: 'unknown' })
  })
  it('umbrales 80% y 95%', () => {
    expect(gaugeStatus(79, 100).status).toBe('ok')
    expect(gaugeStatus(80, 100).status).toBe('warn')
    expect(gaugeStatus(95, 100).status).toBe('critical')
  })
  it('límite cero con uso es crítico (feature no incluida en el plan)', () => {
    expect(gaugeStatus(1, 0).status).toBe('critical')
    expect(gaugeStatus(0, 0).status).toBe('ok')
  })
})

describe('proveedores', () => {
  it('Resend compara contra la cuota anotada y avisa que faltan los Magic Links', () => {
    const m = buildOpsModel(input({
      settings: [setting('resend_itmano', { daily_quota: 100, monthly_quota: 3000, domain_slots: 1 })],
      totals: { db_bytes: 0, storage: {}, emails: { itmano: { today: 90, month: 400 } }, domains: { itmano: 1 }, ai_month: {} },
    }), NOW)
    const card = m.providers.find(p => p.key === 'resend_itmano')!
    expect(card.gauges.find(g => g.id === 'emails_today')!.status).toBe('warn')
    expect(card.gauges.find(g => g.id === 'domains')!.status).toBe('critical')
    expect(card.gauges[0].hint).toContain('Magic Links')
    expect(card.status).toBe('critical')
  })

  it('una cuota sin anotar queda "desconocida"', () => {
    const m = buildOpsModel(input(), NOW)
    expect(m.providers.find(p => p.key === 'resend_aj')!.status).toBe('unknown')
  })

  it('saldo estimado de IA = saldo anotado − gasto desde entonces', () => {
    const m = buildOpsModel(input({
      settings: [setting('anthropic', { balance_usd: 20, balance_recorded_at: '2026-11-01T00:00:00Z', monthly_budget_usd: 50 })],
      totals: { db_bytes: 0, storage: {}, emails: {}, domains: {}, ai_month: { anthropic: 9 } },
      aiSpendSinceBalance: { anthropic: 17 },
    }), NOW)
    const card = m.providers.find(p => p.key === 'anthropic')!
    const used = card.gauges.find(g => g.id === 'balance_used')!
    expect(used.value).toBe(17)
    expect(used.status).toBe('warn')
    expect(card.facts.find(f => f.label === 'Saldo estimado')!.value).toBe('$3.00')
  })

  it('Supabase usa los límites de Free salvo que se anote Pro', () => {
    const big = SUPABASE_PLAN_LIMITS.free.storageBytes * 0.9
    const free = buildOpsModel(input({ totals: { db_bytes: 0, storage: { b: { bytes: big, objects: 1 } }, emails: {}, domains: {}, ai_month: {} } }), NOW)
    expect(free.providers.find(p => p.key === 'supabase')!.gauges.find(g => g.id === 'storage_bytes')!.status).toBe('warn')
    const pro = buildOpsModel(input({
      settings: [setting('supabase', { plan: 'Pro' })],
      totals: { db_bytes: 0, storage: { b: { bytes: big, objects: 1 } }, emails: {}, domains: {}, ai_month: {} },
    }), NOW)
    expect(pro.providers.find(p => p.key === 'supabase')!.gauges.find(g => g.id === 'storage_bytes')!.status).toBe('ok')
  })
})

describe('tenants', () => {
  it('Esencial con una propiedad publicada marca crítico (no incluye web)', () => {
    const m = buildOpsModel(input({
      tenants: [tenant()],
      usage: [{ tenant_id: 'tenant-x', leads: 30, agents: 1, logins: 1, web_properties: 1, emails_today: 0, emails_month: 0, ai_usd_month: 0, storage_bytes: 0 }],
    }), NOW)
    expect(m.tenants[0].gauges.find(g => g.id === 'web_properties')!.status).toBe('critical')
  })

  it('un tenant exento muestra límites contractuales sin alertar, pero la IA sí alerta', () => {
    const m = buildOpsModel(input({ tenants: [tenant({ id: 'tenant-aj', plan: 'partner', billingExempt: true, aiLimitUsd: 75 })] }), NOW)
    const g = Object.fromEntries(m.tenants[0].gauges.map(x => [x.id, x]))
    expect(g.leads.alertable).toBe(false)
    expect(g.ai_month.alertable).toBe(true)
    expect(g.leads.limit).toBeNull() // Partner: ilimitado
    expect(g.logins.limit).toBe(3)   // owner + 2 incluidos
  })

  it('ingreso: exento y prueba no facturan; anual se reparte en 12', () => {
    expect(monthlyRevenueUsd(tenant({ billingExempt: true }))).toBe(0)
    expect(monthlyRevenueUsd(tenant({ status: 'trial' }))).toBe(0)
    expect(monthlyRevenueUsd(tenant({ plan: 'growth' }))).toBe(129)
    expect(monthlyRevenueUsd(tenant({ plan: 'growth', billingCycle: 'year' }))).toBeCloseTo(1290 / 12)
  })
})

describe('salud y calendario', () => {
  it('latido: nunca, atrasado, fallando y webhooks sin cadencia', () => {
    const hb = (over = {}) => ({ job: 'cron:score-decay', last_run_at: NOW.toISOString(), last_ok: true, last_ok_at: null, last_duration_ms: 1, last_error: null, consecutive_failures: 0, ...over })
    expect(healthOf('cron:score-decay', undefined, NOW)).toBe('never')
    expect(healthOf('webhook:paddle', undefined, NOW)).toBe('waiting')
    expect(healthOf('cron:score-decay', hb({ last_ok: false }), NOW)).toBe('failing')
    const old = new Date(NOW.getTime() - staleAfterMs('cron:score-decay')! - 60_000).toISOString()
    expect(healthOf('cron:score-decay', hb({ last_run_at: old }), NOW)).toBe('stale')
    expect(healthOf('cron:score-decay', hb(), NOW)).toBe('ok')
  })

  it('sin backup anotado en Free es urgente; vencimientos a 14 y 3 días', () => {
    const m = buildOpsModel(input({
      settings: [setting('paddle', { key_expires_on: '2026-11-20' }), setting('dominio', { renews_on: '2026-11-28' })],
    }), NOW)
    const byId = Object.fromEntries(m.calendar.map(c => [c.id, c]))
    expect(byId['supabase.backup'].status).toBe('critical')
    expect(byId['paddle.key'].status).toBe('critical')
    expect(byId['dominio.renews'].status).toBe('warn')
  })
})

describe('heartbeatOutcome', () => {
  it('401/403 no es una ejecución; 5xx es falla; lo demás corrió', () => {
    expect(heartbeatOutcome(401)).toBe('skip')
    expect(heartbeatOutcome(403)).toBe('skip')
    expect(heartbeatOutcome(500)).toBe('fail')
    expect(heartbeatOutcome(200)).toBe('ok')
    expect(heartbeatOutcome(400)).toBe('ok')
  })
})
