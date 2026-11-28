import { describe, it, expect, vi, beforeEach } from 'vitest'

const counts: Record<string, number> = { leads: 0, agents: 0, properties: 0 }
const getSubscription = vi.fn()
const countSends = vi.fn()

vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), cache: <T,>(fn: T) => fn }))
vi.mock('@/lib/data/subscriptions', () => ({ getSubscription: (...a: unknown[]) => getSubscription(...a) }))
vi.mock('@/lib/subscriptions/quota', () => ({ countMonthlyCorporateSends: (...a: unknown[]) => countSends(...a) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.then = (res: (v: unknown) => unknown) => res({ count: counts[table] ?? 0 })
      return q
    },
  }),
}))

import { assertEntitlement } from '@/lib/subscriptions/entitlements-server'

beforeEach(() => {
  Object.assign(counts, { leads: 0, agents: 0, properties: 0 })
  countSends.mockReset().mockResolvedValue(0)
  getSubscription.mockReset().mockResolvedValue({
    plan: 'esencial', status: 'active', billingExempt: false, trialEndsAt: null, degradedAt: null,
  })
})

describe('assertEntitlement', () => {
  it('devuelve null cuando la operación procede', async () => {
    expect(await assertEntitlement('t1', 'createLead')).toBeNull()
  })

  it('bloquea crear leads al pasar el 110 % del tope', async () => {
    counts.leads = 2750
    const r = await assertEntitlement('t1', 'createLead')
    expect(r?.ok).toBe(false)
    expect(r?.error).toMatch(/Esencial/)
  })

  it('extraRows se evalúa sobre el uso real', async () => {
    counts.leads = 2000
    expect(await assertEntitlement('t1', 'createLead', { extraRows: 100 })).toBeNull()
    expect((await assertEntitlement('t1', 'createLead', { extraRows: 1000 }))?.ok).toBe(false)
  })

  it('sin fila de suscripción cae a Esencial activo', async () => {
    getSubscription.mockResolvedValue(null)
    const r = await assertEntitlement('t1', 'publishProperty')
    expect(r?.ok).toBe(false)
  })

  it('super_admin salta el tope de leads', async () => {
    counts.leads = 9999
    expect(await assertEntitlement('t1', 'createLead', { isSuperAdmin: true })).toBeNull()
  })
})
