import { describe, it, expect } from 'vitest'
import { canUseNewsletters } from '@/lib/access/newsletters'
import { PLANS, PLAN_ORDER } from '@/lib/plans'

describe('canUseNewsletters', () => {
  // Los tres planes la incluyen: publicar va siempre a news.itmano.com, no al
  // dominio del cliente, y lo unico que cuesta dinero (la IA) ya lo topa
  // ai_monthly_limit_usd. El plan gradua cuantas ediciones caben, no el acceso.
  it('los tres planes tienen la feature', () => {
    for (const plan of PLAN_ORDER) {
      expect(PLANS[plan].features.newsletters).toBe(true)
    }
  })

  it('todos los roles la usan en todos los planes', () => {
    for (const plan of PLAN_ORDER) {
      expect(canUseNewsletters({ role: 'agent_owner' }, plan)).toBe(true)
      expect(canUseNewsletters({ role: 'agent' }, plan)).toBe(true)
      expect(canUseNewsletters({ role: 'super_admin' }, plan)).toBe(true)
    }
  })

  // El gate sigue leyendo el flag, no devolviendo true a secas: si algun plan
  // vuelve a apagarlo, esta prueba es la que lo demuestra.
  it('el gate obedece al flag del plan, no al rol', () => {
    const apagado = { ...PLANS.esencial, features: { ...PLANS.esencial.features, newsletters: false } }
    const original = PLANS.esencial
    try {
      // reason: PLANS es la fuente de verdad y el gate la lee por referencia;
      // sustituir la entrada es la unica forma de probar la rama negativa.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(PLANS as any).esencial = apagado
      expect(canUseNewsletters({ role: 'agent_owner' }, 'esencial')).toBe(false)
      // super_admin es equipo de ITMANO operando la cuenta: pasa igual.
      expect(canUseNewsletters({ role: 'super_admin' }, 'esencial')).toBe(true)
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(PLANS as any).esencial = original
    }
  })
})
