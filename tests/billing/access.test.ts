import { describe, it, expect } from 'vitest'
import { getTenantAccess, DEGRADED_LIMITS } from '@/lib/subscriptions/access'

const growthActive = { status: 'active' as const, plan: 'growth' as const, billingExempt: false }

describe('getTenantAccess — estados con acceso completo', () => {
  it('active tiene todo', () => {
    const a = getTenantAccess(growthActive)
    expect(a.canUseAi).toBe(true)
    expect(a.customDomainAllowed).toBe(true)
    expect(a.sequencesRunnable).toBe(true)
    expect(a.monthlyEmailQuota).toBeNull()
    expect(a.banner).toBeNull()
  })

  it('trial tiene todo', () => {
    expect(getTenantAccess({ ...growthActive, status: 'trial' }).canUseAi).toBe(true)
  })

  it('past_due conserva TODO el acceso y solo avisa', () => {
    // Un fallo de tarjeta no es un impago: Paddle Retain hace el dunning primero.
    const a = getTenantAccess({ ...growthActive, status: 'past_due' })
    expect(a.canUseAi).toBe(true)
    expect(a.customDomainAllowed).toBe(true)
    expect(a.sequencesRunnable).toBe(true)
    expect(a.monthlyEmailQuota).toBeNull()
    expect(a.banner?.tone).toBe('amber')
  })
})

describe('getTenantAccess — modo degradado', () => {
  for (const status of ['paused', 'cancelled'] as const) {
    it(`${status} apaga la IA por completo`, () => {
      expect(getTenantAccess({ ...growthActive, status }).canUseAi).toBe(false)
    })

    it(`${status} revoca el dominio propio`, () => {
      expect(getTenantAccess({ ...growthActive, status }).customDomainAllowed).toBe(false)
    })

    it(`${status} limita los envios corporativos a ${DEGRADED_LIMITS.monthlyEmailQuota}`, () => {
      expect(getTenantAccess({ ...growthActive, status }).monthlyEmailQuota)
        .toBe(DEGRADED_LIMITS.monthlyEmailQuota)
    })

    it(`${status} para las secuencias y bloquea crear mas`, () => {
      const a = getTenantAccess({ ...growthActive, status })
      expect(a.sequencesRunnable).toBe(false)
      expect(a.canCreateSequences).toBe(false)
    })

    it(`${status} limita las propiedades publicadas a ${DEGRADED_LIMITS.publishedPropertiesCap}`, () => {
      expect(getTenantAccess({ ...growthActive, status }).publishedPropertiesCap)
        .toBe(DEGRADED_LIMITS.publishedPropertiesCap)
    })

    it(`${status} muestra banner rojo`, () => {
      expect(getTenantAccess({ ...growthActive, status }).banner?.tone).toBe('red')
    })
  }
})

describe('getTenantAccess — billing_exempt', () => {
  it('A&J en cortesia conserva acceso completo aunque este cancelada', () => {
    const a = getTenantAccess({ status: 'cancelled', plan: 'growth', billingExempt: true })
    expect(a.canUseAi).toBe(true)
    expect(a.customDomainAllowed).toBe(true)
    expect(a.monthlyEmailQuota).toBeNull()
    expect(a.banner).toBeNull()
  })
})

describe('getTenantAccess — el modo degradado NO es solo-lectura', () => {
  it('no expone ningun flag que impida escribir', () => {
    const a = getTenantAccess({ ...growthActive, status: 'cancelled' })
    expect('canWrite' in a).toBe(false)
  })

  it('no expone ningun flag que impida exportar', () => {
    // Spec §10.1: la exportación nunca se bloquea. Es argumento de venta ("tus
    // datos no quedan secuestrados") y obligación de portabilidad GDPR con
    // clientes en la UE. Que no exista el flag es la garantía estructural.
    const a = getTenantAccess({ ...growthActive, status: 'cancelled' })
    expect('canExport' in a).toBe(false)
  })
})
