import { describe, it, expect } from 'vitest'
import { getTenantAccess, DEGRADED_LIMITS, isRunStale } from '@/lib/subscriptions/access'
import { quotaWindowStart } from '@/lib/subscriptions/quota'

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

describe('quotaWindowStart', () => {
  const now = new Date('2026-08-20T12:00:00.000Z')

  it('sin degradar, cuenta desde el 1 del mes', () => {
    expect(quotaWindowStart(now, null)).toBe('2026-08-01T00:00:00.000Z')
  })

  it('degradado a mitad de mes, cuenta desde la degradacion', () => {
    // Los 5000 correos que mando del 1 al 15 con la suscripcion al dia
    // NO deben consumir su cuota de cortesia.
    expect(quotaWindowStart(now, '2026-08-15T00:00:00.000Z')).toBe('2026-08-15T00:00:00.000Z')
  })

  it('degradado el mes pasado, cuenta desde el 1 de este mes', () => {
    expect(quotaWindowStart(now, '2026-07-10T00:00:00.000Z')).toBe('2026-08-01T00:00:00.000Z')
  })

  it('fecha de degradacion ilegible, cae al 1 del mes', () => {
    expect(quotaWindowStart(now, 'basura')).toBe('2026-08-01T00:00:00.000Z')
  })
})
