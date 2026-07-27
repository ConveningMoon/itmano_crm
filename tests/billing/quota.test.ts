import { describe, it, expect } from 'vitest'
import { getTenantAccess, DEGRADED_LIMITS, isRunStale } from '@/lib/subscriptions/access'

describe('cuota de envio corporativo', () => {
  it('un tenant activo no tiene cuota propia', () => {
    expect(getTenantAccess({ status: 'active', plan: 'growth', billingExempt: false }).monthlyEmailQuota).toBeNull()
  })

  it('un tenant degradado tiene exactamente 200', () => {
    expect(getTenantAccess({ status: 'cancelled', plan: 'growth', billingExempt: false }).monthlyEmailQuota).toBe(200)
    expect(DEGRADED_LIMITS.monthlyEmailQuota).toBe(200)
  })
})

describe('isRunStale', () => {
  const now = new Date('2026-12-01T00:00:00.000Z')

  it('un envio vencido hace poco si se dispara', () => {
    expect(isRunStale('2026-11-20T00:00:00.000Z', now)).toBe(false)
  })

  it('un envio vencido hace mas de 30 dias no se dispara', () => {
    expect(isRunStale('2026-09-01T00:00:00.000Z', now)).toBe(true)
  })

  it('el limite exacto de 30 dias todavia se dispara', () => {
    expect(isRunStale('2026-11-01T00:00:00.000Z', now)).toBe(false)
  })
})
