import { describe, it, expect, vi, beforeEach } from 'vitest'

const counts: Record<string, number> = { leads: 0, agents: 0, properties: 0 }
const countErrors: Record<string, string> = {}
const getSubscription = vi.fn()
const countSends = vi.fn()

vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), cache: <T,>(fn: T) => fn }))
let readFailed = false
vi.mock('@/lib/data/subscriptions', () => ({
  getSubscription: (...a: unknown[]) => getSubscription(...a),
  getSubscriptionRead: async (...a: unknown[]) => (
    readFailed ? { subscription: null, failed: true } : { subscription: await getSubscription(...a), failed: false }
  ),
}))
vi.mock('@/lib/subscriptions/quota', async (orig) => ({
  ...(await orig<typeof import('@/lib/subscriptions/quota')>()),
  countMonthlyCorporateSends: (...a: unknown[]) => countSends(...a),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.then = (res: (v: unknown) => unknown) => res({
        count: counts[table] ?? 0,
        error: countErrors[table] ? { message: countErrors[table] } : null,
      })
      return q
    },
  }),
}))

import { assertEntitlement } from '@/lib/subscriptions/entitlements-server'

beforeEach(() => {
  readFailed = false
  for (const k of Object.keys(countErrors)) delete countErrors[k]
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

  it('lectura de suscripción fallida: falla en abierto (no asume Esencial)', async () => {
    readFailed = true
    counts.leads = 9999
    counts.properties = 5
    expect(await assertEntitlement('t1', 'createLead')).toBeNull()
    expect(await assertEntitlement('t1', 'publishProperty')).toBeNull()
    expect(await assertEntitlement('t1', 'aiPropertyIntake')).toBeNull()
  })

  it('un conteo fallido se registra y cuenta 0', async () => {
    countErrors.leads = 'boom'
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await assertEntitlement('t1', 'createLead')).toBeNull()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('"service":"tenant-usage"'))
    spy.mockRestore()
  })

  it('super_admin salta el tope de leads', async () => {
    counts.leads = 9999
    expect(await assertEntitlement('t1', 'createLead', { isSuperAdmin: true })).toBeNull()
  })

  it('pasa degradedAt y trialEndsAt a la ventana de correos solo en prueba', async () => {
    getSubscription.mockResolvedValue({
      plan: 'growth', status: 'trial', billingExempt: false,
      trialEndsAt: '2026-08-10T00:00:00.000Z', degradedAt: null,
    })
    await assertEntitlement('t1', 'manualEmail')
    expect(countSends).toHaveBeenCalledWith('t1', null, '2026-08-10T00:00:00.000Z')
  })

  it('suscripcion activa con prueba vieja: trialEndsAt no llega a la ventana', async () => {
    getSubscription.mockResolvedValue({
      plan: 'growth', status: 'active', billingExempt: false,
      trialEndsAt: '2026-08-10T00:00:00.000Z', degradedAt: '2026-08-12T00:00:00.000Z',
    })
    await assertEntitlement('t1', 'manualEmail')
    expect(countSends).toHaveBeenCalledWith('t1', '2026-08-12T00:00:00.000Z', null)
  })
})
