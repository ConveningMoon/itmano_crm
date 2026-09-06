import { describe, it, expect } from 'vitest'
import { PLANS, PLAN_ORDER, ANNUAL_MONTHS_CHARGED } from '@/lib/plans'

describe('ciclo anual', () => {
  it('cobra 10 meses por 12 en todos los planes', () => {
    expect(ANNUAL_MONTHS_CHARGED).toBe(10)
    for (const key of PLAN_ORDER) {
      const p = PLANS[key]
      const monthly = p.priceUsd ?? p.basePriceUsd!
      expect(p.priceAnnualUsd).toBe(monthly * ANNUAL_MONTHS_CHARGED)
    }
  })

  it('el ahorro es de dos mensualidades', () => {
    for (const key of PLAN_ORDER) {
      const p = PLANS[key]
      const monthly = p.priceUsd ?? p.basePriceUsd!
      expect(p.annualSavingsUsd).toBe(monthly * 2)
    }
  })

  it('los importes anuales coinciden con los publicados en el spec', () => {
    expect(PLANS.esencial.priceAnnualUsd).toBe(590)
    expect(PLANS.growth.priceAnnualUsd).toBe(1290)
    expect(PLANS.partner.priceAnnualUsd).toBe(2490)
  })

  it('no publica un equivalente mensual del anual', () => {
    // 590/12 = 49.17 — redondear prometeria menos de lo que se cobra.
    for (const key of PLAN_ORDER) {
      expect(PLANS[key].inversionAnual).not.toMatch(/mes/)
    }
  })
})
