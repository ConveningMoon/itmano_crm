import { describe, it, expect } from 'vitest'
import {
  AI_CORE_FEATURES,
  MAX_RESERVE_RATIO,
  isCoreFeature,
  reserveUsdFor,
  discretionaryLimitUsd,
  ceilingUsdFor,
  initialAiBudgetUsd,
} from '@/lib/services/ai-budget'
import { AI_FEATURE_LABELS } from '@/lib/services/ai-feature-labels'
import { PLANS, PLAN_ORDER, TRIAL } from '@/lib/plans'
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

describe('presupuesto inicial de un tenant', () => {
  it('cada plan nace con el presupuesto que declara plans.ts', () => {
    for (const plan of PLAN_ORDER) {
      expect(initialAiBudgetUsd(plan, false)).toBe(PLANS[plan].limits.aiBudgetUsd)
    }
  })

  // El bug concreto que esto cierra: `tenants.ai_monthly_limit_usd` tiene
  // DEFAULT 10.00 en la base y createTenant no lo escribia, asi que un Partner
  // arrancaba con $10 de los $75 de su plan y se quedaba sin IA en dias.
  it('ningun plan nace con el default de la columna', () => {
    const DEFAULT_DE_COLUMNA = 10
    expect(initialAiBudgetUsd('partner', false)).toBe(75)
    expect(initialAiBudgetUsd('partner', false)).not.toBe(DEFAULT_DE_COLUMNA)
    expect(initialAiBudgetUsd('esencial', false)).not.toBe(DEFAULT_DE_COLUMNA)
  })

  // La prueba vive como plan 'growth' pero con su propio monto de cortesia.
  it('la prueba usa el presupuesto del trial, no el del plan que la aloja', () => {
    expect(initialAiBudgetUsd(TRIAL.plan, true)).toBe(TRIAL.aiBudgetUsd)
    expect(initialAiBudgetUsd(TRIAL.plan, true)).not.toBe(PLANS[TRIAL.plan].limits.aiBudgetUsd)
    // El flag manda sobre el plan que venga.
    for (const plan of PLAN_ORDER) {
      expect(initialAiBudgetUsd(plan, true)).toBe(TRIAL.aiBudgetUsd)
    }
  })
})
