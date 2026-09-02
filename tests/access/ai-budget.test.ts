import { describe, it, expect } from 'vitest'
import {
  AI_CORE_FEATURES,
  MAX_RESERVE_RATIO,
  isCoreFeature,
  reserveUsdFor,
  discretionaryLimitUsd,
  ceilingUsdFor,
} from '@/lib/services/ai-budget'
import { AI_FEATURE_LABELS } from '@/lib/services/ai-feature-labels'
import { PLANS, PLAN_ORDER } from '@/lib/plans'
import type { AiFeature } from '@/lib/services/ai-feature-labels'

// El presupuesto de IA se parte en dos tramos segun QUIEN pide:
//
//   nucleo        -> corre solo, nadie lo pulsa, cortarlo degrada el producto
//                    en silencio. Gasta hasta el tope completo.
//   discrecional  -> alguien pulso un boton y recibe un mensaje que puede leer.
//                    Se corta en (tope - reserva).
//
// La reserva son los ULTIMOS dolares del mismo tope, no una bolsa aparte: sin
// segundo contador que desincronizar y sin migracion.

describe('features del nucleo', () => {
  it('lead_fit es la unica del nucleo', () => {
    expect([...AI_CORE_FEATURES]).toEqual(['lead_fit'])
    expect(isCoreFeature('lead_fit')).toBe(true)
  })

  // Si manana se agrega una feature automatica, esta prueba obliga a decidir
  // conscientemente de que lado cae en vez de heredar 'discrecional' por
  // descuido.
  it('todas las demas features conocidas son discrecionales', () => {
    const demas = (Object.keys(AI_FEATURE_LABELS) as AiFeature[])
      .filter(f => !(AI_CORE_FEATURES as readonly string[]).includes(f))
    expect(demas.length).toBeGreaterThan(0)
    for (const f of demas) expect(isCoreFeature(f)).toBe(false)
  })
})

describe('reserva por plan', () => {
  it('sale de plans.ts tal cual cuando el tope es el del plan', () => {
    for (const plan of PLAN_ORDER) {
      const { aiBudgetUsd, aiCoreReserveUsd } = PLANS[plan].limits
      expect(reserveUsdFor(plan, aiBudgetUsd)).toBe(aiCoreReserveUsd)
    }
  })

  // Invariante del catalogo, no del codigo: si alguien define una reserva que
  // se come mas de la mitad del presupuesto de su plan, el clamp la recortaria
  // en silencio y el numero de plans.ts seria mentira.
  it('ningun plan define una reserva que dispare el clamp', () => {
    for (const plan of PLAN_ORDER) {
      const { aiBudgetUsd, aiCoreReserveUsd } = PLANS[plan].limits
      expect(aiCoreReserveUsd).toBeLessThanOrEqual(aiBudgetUsd * MAX_RESERVE_RATIO)
    }
  })

  it('con un tope rebajado a mano, la reserva nunca pasa de la mitad', () => {
    // Esencial reserva $2. Con el tope bajado a $1, reservar $2 dejaria el
    // tramo discrecional en cero: ni una sola generacion manual.
    expect(reserveUsdFor('esencial', 1)).toBe(0.5)
    expect(discretionaryLimitUsd('esencial', 1)).toBe(0.5)
  })

  it('tope cero o negativo: no hay nada que repartir', () => {
    expect(reserveUsdFor('esencial', 0)).toBe(0)
    expect(discretionaryLimitUsd('esencial', 0)).toBe(0)
    expect(reserveUsdFor('esencial', -5)).toBe(0)
    expect(discretionaryLimitUsd('esencial', -5)).toBe(0)
  })
})

describe('techo aplicable', () => {
  it('el nucleo llega al tope completo; lo discrecional se para antes', () => {
    const tope = PLANS.esencial.limits.aiBudgetUsd
    const reserva = PLANS.esencial.limits.aiCoreReserveUsd
    expect(ceilingUsdFor('esencial', tope, true)).toBe(tope)
    expect(ceilingUsdFor('esencial', tope, false)).toBe(tope - reserva)
  })

  // El punto entero del cambio: con lo discrecional agotado, el analisis de
  // leads todavia tiene con que correr.
  it('agotado lo discrecional, al nucleo le queda exactamente la reserva', () => {
    const tope = PLANS.growth.limits.aiBudgetUsd
    const gastado = discretionaryLimitUsd('growth', tope)
    expect(ceilingUsdFor('growth', tope, true) - gastado)
      .toBe(PLANS.growth.limits.aiCoreReserveUsd)
  })
})
