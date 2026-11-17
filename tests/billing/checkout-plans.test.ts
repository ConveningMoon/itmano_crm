import { describe, it, expect } from 'vitest'
import { checkoutPlans } from '@/lib/subscriptions'

// "Pagar ahora" abre un checkout NUEVO de Paddle. Con Esencial activo se
// ofrecía Growth: pagarlo creaba una segunda suscripción y la primera seguía
// cobrando. Mejorar de plan va por "Cambiar de plan".

const base = {
  plan: 'esencial' as const, status: 'active' as const, billingCycle: 'month' as const,
  paddlePriceId: null, billingExempt: false,
}

describe('checkoutPlans', () => {
  it('activa y pagada: ningún checkout (ni otro plan ni el mismo)', () => {
    expect(checkoutPlans(base)).toEqual([])
  })

  it('pago vencido: se arregla en el portal, no con otra suscripción', () => {
    expect(checkoutPlans({ ...base, status: 'past_due' })).toEqual([])
  })

  it('activa sin ciclo de Paddle: sólo el plan actual', () => {
    expect(checkoutPlans({ ...base, billingCycle: null })).toEqual(['esencial'])
  })

  it('en prueba o cancelada: todos los planes de catálogo', () => {
    expect(checkoutPlans({ ...base, status: 'trial', plan: 'growth', billingCycle: null })).toEqual(['esencial', 'growth'])
    expect(checkoutPlans({ ...base, status: 'cancelled' })).toEqual(['esencial', 'growth'])
  })

  it('Partner sólo con precio negociado', () => {
    expect(checkoutPlans({ ...base, status: 'trial', paddlePriceId: 'pri_x' })).toEqual(['esencial', 'growth', 'partner'])
    expect(checkoutPlans({ ...base, plan: 'partner', billingCycle: null })).toEqual([])
  })

  it('exento de facturación: nunca', () => {
    expect(checkoutPlans({ ...base, status: 'trial', billingExempt: true })).toEqual([])
  })
})
