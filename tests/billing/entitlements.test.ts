import { describe, it, expect } from 'vitest'
import { getEntitlements, leadThresholds, type TenantUsage, type EntitlementsInput } from '@/lib/subscriptions/entitlements'
import type { SubscriptionPlan, SubscriptionStatus } from '@/lib/subscriptions'

const zero: TenantUsage = { leads: 0, agents: 0, publishedProperties: 0, emailsMonth: 0 }
const base: EntitlementsInput = { status: 'active', plan: 'growth', billingExempt: false, usage: zero }
const withUsage = (u: Partial<TenantUsage>): EntitlementsInput => ({ ...base, usage: { ...zero, ...u } })

const PLANS_: SubscriptionPlan[] = ['esencial', 'growth', 'partner']
const STATUSES: SubscriptionStatus[] = ['trial', 'active', 'past_due', 'paused', 'cancelled', 'expired']
const DEGRADED: SubscriptionStatus[] = ['paused', 'cancelled', 'expired']

describe('getEntitlements — tabla plan × estado × exento (uso 0)', () => {
  const rows = PLANS_.flatMap(plan =>
    STATUSES.flatMap(status => [false, true].map(billingExempt => ({ plan, status, billingExempt }))),
  )

  it.each(rows)('$plan / $status / exento=$billingExempt', ({ plan, status, billingExempt }) => {
    const e = getEntitlements({ ...base, plan, status, billingExempt })
    const degraded = DEGRADED.includes(status)

    // Publicar: Esencial nunca (salvo exento); en degradado rige el tope de 3 (uso 0 cabe).
    expect(e.publishProperty.allowed).toBe(billingExempt || plan !== 'esencial')
    // IA de intake: sólo Growth/Partner y sin degradado.
    expect(e.aiPropertyIntake.allowed).toBe(billingExempt || (plan !== 'esencial' && !degraded))
    // Con uso 0 siempre cabe un agente.
    expect(e.createAgent.allowed).toBe(true)
  })
})

describe('getEntitlements — propiedades', () => {
  it('esencial no publica: limit 0, upgradeTo growth', () => {
    const e = getEntitlements({ ...base, plan: 'esencial' }).publishProperty
    expect(e.allowed).toBe(false)
    expect(e.state).toBe('blocked')
    expect(e.limit).toBe(0)
    expect(e.upgradeTo).toBe('growth')
  })

  it('growth publica hasta 50', () => {
    expect(getEntitlements(withUsage({ publishedProperties: 49 })).publishProperty.allowed).toBe(true)
    const full = getEntitlements(withUsage({ publishedProperties: 50 })).publishProperty
    expect(full.allowed).toBe(false)
    expect(full.state).toBe('blocked')
    expect(full.limit).toBe(50)
    expect(full.upgradeTo).toBe('partner')
  })

  it('degradado usa el menor entre plan y tope de cortesía', () => {
    const e = getEntitlements({ ...withUsage({ publishedProperties: 3 }), status: 'paused' }).publishProperty
    expect(e.limit).toBe(3)
    expect(e.allowed).toBe(false)
  })

  it('partner activo es ilimitado', () => {
    const e = getEntitlements({ ...withUsage({ publishedProperties: 9999 }), plan: 'partner' }).publishProperty
    expect(e.allowed).toBe(true)
    expect(e.limit).toBeNull()
  })
})

describe('getEntitlements — leads (límite blando)', () => {
  const lead = (used: number, extra: Partial<EntitlementsInput> = {}) =>
    getEntitlements({ ...withUsage({ leads: used }), plan: 'esencial', ...extra }).createLead

  it('umbrales exactos con enteros', () => {
    expect(leadThresholds(2500)).toEqual({ warnAt: 2000, blockAt: 2750 })
    expect(leadThresholds(10000)).toEqual({ warnAt: 8000, blockAt: 11000 })
  })

  it('leads blando', () => {
    expect(lead(1999).state).toBe('ok')
    expect(lead(2000).state).toBe('warn')
    expect(lead(2000).allowed).toBe(true)
    expect(lead(2749).state).toBe('warn')
    expect(lead(2749).allowed).toBe(true)
    expect(lead(2750).state).toBe('blocked')
    expect(lead(2750).allowed).toBe(false)
    expect(lead(2750).upgradeTo).toBe('growth')
  })

  it('importación que cruzaría el 110%', () => {
    const e = lead(2700, { extraRows: 60 })
    expect(e.allowed).toBe(false)
    expect(e.state).toBe('blocked')
    expect(e.message).toContain('50')
  })

  it('importación que cabe justo', () => {
    expect(lead(2700, { extraRows: 50 }).allowed).toBe(true)
  })

  it('partner es ilimitado', () => {
    const e = getEntitlements({ ...withUsage({ leads: 1_000_000 }), plan: 'partner' }).createLead
    expect(e.allowed).toBe(true)
    expect(e.limit).toBeNull()
  })
})

describe('getEntitlements — correos', () => {
  it('correos: automáticos paran al 100%, manuales al 110%', () => {
    const at100 = getEntitlements(withUsage({ emailsMonth: 15000 }))
    expect(at100.automatedEmail.allowed).toBe(false)
    expect(at100.manualEmail.allowed).toBe(true)
    const at110 = getEntitlements(withUsage({ emailsMonth: 16500 }))
    expect(at110.automatedEmail.allowed).toBe(false)
    expect(at110.manualEmail.allowed).toBe(false)
  })

  it('bajo el tope ambos pasan', () => {
    const e = getEntitlements(withUsage({ emailsMonth: 100 }))
    expect(e.automatedEmail.allowed).toBe(true)
    expect(e.manualEmail.allowed).toBe(true)
    expect(e.manualEmail.state).toBe('ok')
  })

  it('degradado: cuota de cortesía sin margen y sin automáticos', () => {
    const e = getEntitlements({ ...withUsage({ emailsMonth: 199 }), status: 'cancelled' })
    expect(e.manualEmail.allowed).toBe(true)
    expect(e.manualEmail.limit).toBe(200)
    expect(e.automatedEmail.allowed).toBe(false)
    const full = getEntitlements({ ...withUsage({ emailsMonth: 200 }), status: 'cancelled' })
    expect(full.manualEmail.allowed).toBe(false)
  })
})

describe('getEntitlements — exento, super_admin y agentes', () => {
  it.each(['partner', 'esencial'] as const)('exento %s: todo permitido', plan => {
    const e = getEntitlements({
      status: 'cancelled', plan, billingExempt: true,
      usage: { leads: 999_999, agents: 99, publishedProperties: 999, emailsMonth: 999_999 },
    })
    for (const [key, v] of Object.entries(e)) {
      expect(v.allowed, key).toBe(true)
      expect(v.state, key).toBe('ok')
    }
  })

  it('super_admin salta leads y publicación pero no correos', () => {
    const e = getEntitlements({
      ...base, plan: 'esencial', isSuperAdmin: true,
      usage: { leads: 50_000, agents: 5, publishedProperties: 10, emailsMonth: 50_000 },
    })
    expect(e.createLead.allowed).toBe(true)
    expect(e.publishProperty.allowed).toBe(true)
    expect(e.createAgent.allowed).toBe(true)
    expect(e.manualEmail.allowed).toBe(false)
    expect(e.automatedEmail.allowed).toBe(false)
  })

  it('growth tiene 1 agente', () => {
    const e = getEntitlements(withUsage({ agents: 1 })).createAgent
    expect(e.allowed).toBe(false)
    expect(e.limit).toBe(1)
    expect(e.upgradeTo).toBe('partner')
  })

  it('partner crea agentes sin tope', () => {
    const e = getEntitlements({ ...withUsage({ agents: 40 }), plan: 'partner' }).createAgent
    expect(e.allowed).toBe(true)
    expect(e.limit).toBeNull()
  })

  it('teamAnalytics sólo en partner (o exento)', () => {
    expect(getEntitlements(base).teamAnalytics.allowed).toBe(false)
    expect(getEntitlements({ ...base, plan: 'partner' }).teamAnalytics.allowed).toBe(true)
    expect(getEntitlements({ ...base, billingExempt: true }).teamAnalytics.allowed).toBe(true)
  })

  it('los mensajes no mencionan dólares', () => {
    const e = getEntitlements({
      ...withUsage({ leads: 3000, agents: 1, publishedProperties: 50, emailsMonth: 20000 }),
      plan: 'esencial',
    })
    for (const v of Object.values(e)) expect(v.message ?? '').not.toContain('$')
  })
})
