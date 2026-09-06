import { describe, it, expect } from 'vitest'
import { getTenantAccess, DEGRADED_LIMITS, GRACE_DAYS, isRunStale } from '@/lib/subscriptions/access'
import type { SubscriptionStatus } from '@/lib/subscriptions'

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

describe('getTenantAccess — dominio propio segun plan (no solo Growth)', () => {
  // Todas las aserciones de arriba usan Growth, que SIEMPRE da true — pasarian
  // igual si customDomainAllowed fuera un `true` fijo. El caso que de verdad
  // protege contra un error de facturacion es Esencial, que nunca debe recibir
  // dominio propio aunque este activo o incluso exento.
  it('esencial activo no obtiene dominio propio ni pagando', () => {
    const a = getTenantAccess({ status: 'active', plan: 'esencial', billingExempt: false })
    expect(a.customDomainAllowed).toBe(false)
  })

  it('un exento esencial tampoco obtiene dominio propio', () => {
    const a = getTenantAccess({ status: 'cancelled', plan: 'esencial', billingExempt: true })
    expect(a.customDomainAllowed).toBe(false)
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

    it(`${status} limita los envios corporativos (no null, no ilimitado)`, () => {
      // No comparar contra DEGRADED_LIMITS.monthlyEmailQuota: eso solo prueba
      // el cableado. La aserción real es que deja de ser "sin límite" (null,
      // que es lo que rige en acceso completo).
      const a = getTenantAccess({ ...growthActive, status })
      expect(a.monthlyEmailQuota).not.toBeNull()
      expect(a.monthlyEmailQuota).toBe(200)
    })

    it(`${status} para las secuencias y bloquea crear mas`, () => {
      const a = getTenantAccess({ ...growthActive, status })
      expect(a.sequencesRunnable).toBe(false)
      expect(a.canCreateSequences).toBe(false)
    })

    it(`${status} limita las propiedades publicadas (no null, no ilimitado)`, () => {
      const a = getTenantAccess({ ...growthActive, status })
      expect(a.publishedPropertiesCap).not.toBeNull()
      expect(a.publishedPropertiesCap).toBe(3)
    })

    it(`${status} impide publicar newsletters`, () => {
      // Retención cero: el cron despublica el archivo entero. Sin este corte, el
      // tenant vuelve a publicar y el cron lo baja al día siguiente — un bucle
      // que nadie sabría explicar.
      expect(getTenantAccess({ ...growthActive, status }).newslettersPublishable).toBe(false)
    })

    it(`${status} muestra banner rojo`, () => {
      expect(getTenantAccess({ ...growthActive, status }).banner?.tone).toBe('red')
    })
  }
})

describe('getTenantAccess — los numeros del contrato no se cablean solos', () => {
  // Estos números son contractuales del producto (spec §10). Fijar los
  // literales, no reusar la constante importada, para que un cambio accidental
  // de 200→20 o de 14/60/30 se detecte aquí y no en producción.
  it('los limites degradados son los contratados', () => {
    expect(DEGRADED_LIMITS).toEqual({ monthlyEmailQuota: 200, publishedPropertiesCap: 3 })
  })

  it('los plazos de gracia son los contratados', () => {
    expect(GRACE_DAYS).toEqual({ properties: 14, sendingDomain: 60, staleRun: 30 })
  })
})

describe('isRunStale', () => {
  const now = new Date('2026-12-01T00:00:00.000Z')

  it('29 dias todavia se envia', () => {
    expect(isRunStale('2026-11-02T00:00:00.000Z', now)).toBe(false)
  })

  it('exactamente 30 dias todavia se envia', () => {
    expect(isRunStale('2026-11-01T00:00:00.000Z', now)).toBe(false)
  })

  it('31 dias ya no se envia', () => {
    expect(isRunStale('2026-10-31T00:00:00.000Z', now)).toBe(true)
  })

  it('fecha ilegible se considera obsoleta (falla en cerrado, no en abierto)', () => {
    // Una guardia que frena envíos debe resolver la duda hacia NO enviar.
    expect(isRunStale('esto-no-es-una-fecha', now)).toBe(true)
  })
})

describe('getTenantAccess — matriz completa de los 7 estados', () => {
  // La defensa real contra "alguien amplía isDegraded en reducer.ts sin darse
  // cuenta" es que la matriz ENTERA esté escrita, incluidos los dos estados
  // sales-led (cancel_requested, change_requested) que hoy deben conservar
  // acceso completo: quien solicitó cancelar sigue teniendo servicio hasta fin
  // de período. Si mañana isDegraded los incluyera por error, este test se
  // pone en rojo — que es exactamente el punto.
  const expectedDegraded: Record<SubscriptionStatus, boolean> = {
    trial:             false,
    active:            false,
    past_due:          false, // conserva acceso completo (solo banner amber)
    paused:            true,
    cancel_requested:  false,
    change_requested:  false,
    cancelled:         true,
  }

  for (const [status, degraded] of Object.entries(expectedDegraded) as [SubscriptionStatus, boolean][]) {
    it(`${status} ${degraded ? 'SI' : 'NO'} degrada el acceso`, () => {
      const a = getTenantAccess({ ...growthActive, status })
      expect(a.canUseAi).toBe(!degraded)
      expect(a.customDomainAllowed).toBe(!degraded)
      expect(a.sequencesRunnable).toBe(!degraded)
      expect(a.canCreateSequences).toBe(!degraded)
      expect(a.monthlyEmailQuota).toBe(degraded ? DEGRADED_LIMITS.monthlyEmailQuota : null)
      expect(a.publishedPropertiesCap).toBe(degraded ? DEGRADED_LIMITS.publishedPropertiesCap : null)
      expect(a.newslettersPublishable).toBe(!degraded)
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
