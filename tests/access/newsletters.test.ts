import { describe, it, expect } from 'vitest'
import { canUseNewsletters } from '@/lib/access/newsletters'
import { PLANS } from '@/lib/plans'

describe('canUseNewsletters', () => {
  it('growth y partner tienen la feature; esencial no', () => {
    expect(PLANS.esencial.features.newsletters).toBe(false)
    expect(PLANS.growth.features.newsletters).toBe(true)
    expect(PLANS.partner.features.newsletters).toBe(true)
  })

  it('los roles de tenant pueden usarla en un plan que la incluye', () => {
    expect(canUseNewsletters({ role: 'agent_owner' }, 'growth')).toBe(true)
    expect(canUseNewsletters({ role: 'agent' }, 'growth')).toBe(true)
  })

  it('ningun rol la usa en un plan que no la incluye', () => {
    expect(canUseNewsletters({ role: 'agent_owner' }, 'esencial')).toBe(false)
    expect(canUseNewsletters({ role: 'agent' }, 'esencial')).toBe(false)
  })

  it('super_admin la usa siempre, tambien en esencial', () => {
    expect(canUseNewsletters({ role: 'super_admin' }, 'esencial')).toBe(true)
  })
})
