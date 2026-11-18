import { describe, expect, it } from 'vitest'
import { buildAlerts } from '@/lib/ops/alerts'
import { buildOpsModel, type OpsInput } from '@/lib/ops/model'
import { alertsTelegramText, snapshotRows } from '@/lib/services/platform-ops'

const NOW = new Date('2026-11-18T12:00:00Z')

function input(over: Partial<OpsInput> = {}): OpsInput {
  return {
    usage: [], totals: { db_bytes: 0, storage: {}, emails: {}, domains: {}, ai_month: {} },
    settings: [], tenants: [], heartbeats: [], aiSpendSinceBalance: {}, ...over,
  }
}

const settingsBase = {
  plan: null, monthly_cost_usd: null, monthly_budget_usd: null, monthly_quota: null, domain_slots: null,
  balance_usd: null, balance_recorded_at: null, renews_on: null, key_expires_on: null, notes: null,
  updated_at: NOW.toISOString(),
}

describe('buildAlerts', () => {
  it('cuota diaria: la clave lleva la severidad y el periodo es el día', () => {
    const model = buildOpsModel(input({
      settings: [
        { ...settingsBase, key: 'resend_itmano', label: 'Resend ITMANO', daily_quota: 100, last_backup_at: null },
        // Backup reciente: el calendario no debe meter ruido en este caso.
        { ...settingsBase, key: 'supabase', label: 'Supabase', daily_quota: null, last_backup_at: NOW.toISOString() },
      ],
      totals: { db_bytes: 0, storage: {}, emails: { itmano: { today: 97, month: 97 } }, domains: {}, ai_month: {} },
      heartbeats: ['cron:score-decay', 'cron:sequence-orchestrator', 'cron:billing-lifecycle', 'cron:warm'].map(job => ({
        job, last_run_at: NOW.toISOString(), last_ok: true, last_ok_at: NOW.toISOString(), last_duration_ms: 1, last_error: null, consecutive_failures: 0,
      })),
    }), NOW)
    const alerts = buildAlerts(model, NOW)
    expect(alerts).toEqual([
      expect.objectContaining({ key: 'provider.resend_itmano.emails_today.critical', period: '2026-11-18', severity: 'critical' }),
    ])
  })

  it('un cron que nunca corrió alerta, pero el propio platform-ops no se acusa a sí mismo', () => {
    const keys = buildAlerts(buildOpsModel(input(), NOW), NOW).map(a => a.key)
    expect(keys).toContain('job.cron:score-decay.never')
    expect(keys.some(k => k.startsWith('job.cron:platform-ops'))).toBe(false)
    // Los webhooks sin eventos no son una alerta.
    expect(keys.some(k => k.startsWith('job.webhook:'))).toBe(false)
  })

  it('el límite contractual de un tenant exento no alerta', () => {
    const model = buildOpsModel(input({
      tenants: [{ id: 'tenant-aj', name: 'A&J', plan: 'esencial', status: 'active', billingExempt: true, billingCycle: null, trialEndsAt: null, aiLimitUsd: 75, aiUnlimited: false }],
      usage: [{ tenant_id: 'tenant-aj', leads: 9999, agents: 5, logins: 3, web_properties: 13, emails_today: 0, emails_month: 0, ai_usd_month: 0, storage_bytes: 0 }],
    }), NOW)
    expect(buildAlerts(model, NOW).some(a => a.key.startsWith('tenant.tenant-aj'))).toBe(false)
  })
})

describe('mensaje de Telegram y foto diaria', () => {
  it('escapa HTML (A&J) y separa urgentes de atención', () => {
    const text = alertsTelegramText([
      { severity: 'warn', message: 'A&J · IA del mes: $60.00 de $75.00 (80%)' },
      { severity: 'critical', message: 'Cron <caído>' },
    ])
    expect(text).toContain('A&amp;J')
    expect(text).toContain('Cron &lt;caído&gt;')
    expect(text.indexOf('Urgente')).toBeLessThan(text.indexOf('Atención'))
  })

  it('la foto guarda cada indicador con su límite y el storage por tenant', () => {
    const model = buildOpsModel(input({
      tenants: [{ id: 'tenant-x', name: 'X', plan: 'growth', status: 'active', billingExempt: false, billingCycle: null, trialEndsAt: null, aiLimitUsd: 30, aiUnlimited: false }],
    }), NOW)
    const rows = snapshotRows(model)
    expect(rows.find(r => r.tenant_id === 'tenant-x' && r.metric === 'leads')).toMatchObject({ provider: 'tenant', limit_value: 10000 })
    expect(rows.find(r => r.tenant_id === 'tenant-x' && r.metric === 'storage_bytes')).toMatchObject({ unit: 'bytes', limit_value: null })
    expect(rows.find(r => r.provider === 'resend' && r.account === 'itmano' && r.metric === 'emails_today')).toBeTruthy()
  })
})
