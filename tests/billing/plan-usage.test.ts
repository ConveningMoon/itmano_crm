import { describe, expect, it } from 'vitest'
import { getEntitlements } from '@/lib/subscriptions/entitlements'
import { buildPlanUsageRows } from '@/lib/subscriptions/plan-usage'
import type { SubscriptionPlan } from '@/lib/subscriptions'

const rowsFor = (plan: SubscriptionPlan, usage: Partial<Record<'leads' | 'agents' | 'publishedProperties' | 'emailsMonth', number>>, ai = { unlimited: false, usedRatio: 0.4, blocked: false }) =>
  buildPlanUsageRows({
    plan,
    entitlements: getEntitlements({
      plan, status: 'active', billingExempt: false, trialEndsAt: null,
      usage: { leads: 0, agents: 1, publishedProperties: 0, emailsMonth: 0, ...usage },
    }),
    ai,
  })
const byKey = (rows: ReturnType<typeof rowsFor>, key: string) => rows.find(r => r.key === key)!

describe('buildPlanUsageRows', () => {
  it('Esencial: propiedades "No incluido" y sin fila de agentes', () => {
    const rows = rowsFor('esencial', {})
    expect(byKey(rows, 'properties')).toMatchObject({ kind: 'not-included', detail: 'No incluido en tu plan' })
    expect(rows.some(r => r.key === 'agents')).toBe(false)
  })

  it('avisa desde el 80 % de leads', () => {
    expect(byKey(rowsFor('esencial', { leads: 1999 }), 'leads')).toMatchObject({ kind: 'bar', tone: 'ok' })
    expect(byKey(rowsFor('esencial', { leads: 2000 }), 'leads')).toMatchObject({ kind: 'bar', tone: 'warn', percent: 80 })
  })

  it('correos al tope: bloqueado', () => {
    expect(byKey(rowsFor('growth', { emailsMonth: 15000 }), 'emails')).toMatchObject({ tone: 'blocked', percent: 100 })
  })

  it('Partner: leads y propiedades ilimitados, fila de agentes', () => {
    const rows = rowsFor('partner', { leads: 5, agents: 4 })
    expect(byKey(rows, 'leads')).toMatchObject({ kind: 'unlimited', detail: 'Ilimitados' })
    expect(byKey(rows, 'properties')).toMatchObject({ kind: 'unlimited' })
    expect(byKey(rows, 'agents')).toMatchObject({ kind: 'unlimited', used: 4 })
  })

  it('IA sólo en porcentaje, sin dólares', () => {
    const ai = byKey(rowsFor('growth', {}, { unlimited: false, usedRatio: 0.62, blocked: false }), 'ai')
    expect(ai).toMatchObject({ kind: 'percent', percent: 62 })
    expect(JSON.stringify(ai)).not.toMatch(/\$|USD/)
  })
})
