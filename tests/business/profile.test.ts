import { describe, it, expect } from 'vitest'
import {
  budgetTierFor, expectedCommission, hasBudgetBands, formatMoney, missingFields,
  geoFitFor, EMPTY_PROFILE, type BusinessProfile,
} from '@/lib/business/profile'

// Hampton Roads: casa media ~350k. Barcelona: la misma cifra es de entrada.
const AJ: BusinessProfile = {
  currency: 'USD', commissionModel: 'percentage',
  commissionBuy: 3, commissionSell: 3,
  budgetEntryMax: 250_000, budgetPremiumMin: 600_000,
  primaryAreas: ['Virginia Beach', 'Norfolk'], secondaryAreas: ['Chesapeake'],
  publicSiteUrl: null, newsletterCanonicalTemplate: null,
}
const TECNOCASA: BusinessProfile = {
  currency: 'EUR', commissionModel: 'percentage',
  commissionBuy: 4, commissionSell: 4,
  budgetEntryMax: 400_000, budgetPremiumMin: 900_000,
  primaryAreas: ['Barcelona'], secondaryAreas: ['Badalona'],
  publicSiteUrl: null, newsletterCanonicalTemplate: null,
}

describe('budgetTierFor — el mismo monto significa cosas distintas', () => {
  it('300k es medio en Hampton Roads y de entrada en Barcelona', () => {
    // Es la razón entera de que este perfil exista: sin los cortes de cada
    // agencia, `budget_tier` era una etiqueta que el sistema adivinaba.
    expect(budgetTierFor(300_000, AJ)).toBe('mid')
    expect(budgetTierFor(300_000, TECNOCASA)).toBe('entry')
  })

  it('los bordes caen del lado que dice el perfil', () => {
    expect(budgetTierFor(250_000, AJ)).toBe('entry')    // el tope es inclusivo
    expect(budgetTierFor(250_001, AJ)).toBe('mid')
    expect(budgetTierFor(600_000, AJ)).toBe('premium')  // el piso también
    expect(budgetTierFor(599_999, AJ)).toBe('mid')
  })

  it('sin cortes devuelve null, no "entry"', () => {
    // "No lo sé" y "es de entrada" son respuestas distintas: la segunda le
    // restaría puntos a un lead del que no sabemos nada.
    expect(budgetTierFor(300_000, EMPTY_PROFILE)).toBeNull()
    expect(budgetTierFor(300_000, { ...AJ, budgetPremiumMin: null })).toBeNull()
  })

  it('un monto ausente o absurdo no inventa bucket', () => {
    expect(budgetTierFor(null, AJ)).toBeNull()
    expect(budgetTierFor(undefined, AJ)).toBeNull()
    expect(budgetTierFor(-1, AJ)).toBeNull()
    expect(budgetTierFor(NaN, AJ)).toBeNull()
  })
})

describe('hasBudgetBands — los cortes tienen que dejar sitio al medio', () => {
  it('exige los dos y en orden', () => {
    expect(hasBudgetBands(AJ)).toBe(true)
    expect(hasBudgetBands({ ...AJ, budgetEntryMax: null })).toBe(false)
    // Invertidos, el bucket "mid" no existiria: se rechaza aqui igual que en el
    // CHECK de la base.
    expect(hasBudgetBands({ ...AJ, budgetEntryMax: 700_000 })).toBe(false)
  })
})

describe('expectedCommission', () => {
  it('porcentaje sobre el monto de la operación', () => {
    expect(expectedCommission(400_000, AJ, 'buy')).toBe(12_000)   // 3%
    expect(expectedCommission(400_000, TECNOCASA, 'sell')).toBe(16_000) // 4%
  })

  it('un monto fijo no depende del tamaño', () => {
    const fijo: BusinessProfile = { ...AJ, commissionModel: 'flat', commissionBuy: 5_000 }
    expect(expectedCommission(400_000, fijo, 'buy')).toBe(5_000)
    expect(expectedCommission(2_000_000, fijo, 'buy')).toBe(5_000)
    // Y sin monto de operación sigue siendo calculable, que es el punto.
    expect(expectedCommission(null, fijo, 'buy')).toBe(5_000)
  })

  it('compra y venta pueden cobrarse distinto', () => {
    const asimetrico: BusinessProfile = { ...AJ, commissionBuy: 2.5, commissionSell: 5 }
    expect(expectedCommission(400_000, asimetrico, 'buy')).toBe(10_000)
    expect(expectedCommission(400_000, asimetrico, 'sell')).toBe(20_000)
  })

  it('sin perfil devuelve null, nunca 0', () => {
    // Un 0 afirmaría "esta operación no deja nada". No saber no es eso.
    expect(expectedCommission(400_000, EMPTY_PROFILE, 'buy')).toBeNull()
    expect(expectedCommission(400_000, { ...AJ, commissionBuy: null }, 'buy')).toBeNull()
  })
})

describe('formatMoney', () => {
  it('usa el símbolo del perfil y no muestra céntimos', () => {
    expect(formatMoney(12_000, 'USD')).toBe('$12.000')
    expect(formatMoney(12_000, 'EUR')).toBe('€12.000')
    expect(formatMoney(12_499.6, 'USD')).toBe('$12.500')
  })

  it('sin dato, raya', () => {
    expect(formatMoney(null, 'USD')).toBe('—')
    expect(formatMoney(undefined, null)).toBe('—')
  })
})

describe('geoFitFor — la zona que nadie había definido', () => {
  it('clasifica contra las zonas declaradas por la agencia', () => {
    expect(geoFitFor('Virginia Beach', AJ)).toBe('zona_principal')
    expect(geoFitFor('Chesapeake', AJ)).toBe('zona_secundaria')
    expect(geoFitFor('Miami', AJ)).toBe('fuera_de_zona')
  })

  it('aguanta cómo lo escribe el lead', () => {
    // El lead pone "Virginia Beach, VA" y la agencia declaró "Virginia Beach".
    expect(geoFitFor('Virginia Beach, VA', AJ)).toBe('zona_principal')
    expect(geoFitFor('  virginia beach  ', AJ)).toBe('zona_principal')
    expect(geoFitFor('BADALONA', TECNOCASA)).toBe('zona_secundaria')
    // Muchos formularios mandan la zona slugificada. Sin tolerar el separador,
    // geo_fit no clasificaba nada para ellos.
    expect(geoFitFor('virginia_beach', AJ)).toBe('zona_principal')
    expect(geoFitFor('virginia-beach', AJ)).toBe('zona_principal')
  })

  it('el estado entero NO cuenta como la ciudad declarada', () => {
    // "Virginia Beach" contiene "Virginia": con match bidireccional, un lead que
    // elegia el estado entero se acreditaba como si hubiera dicho la ciudad.
    expect(geoFitFor('Virginia', AJ)).toBe('fuera_de_zona')
    expect(geoFitFor('Virginia Beach', AJ)).toBe('zona_principal')
  })

  it('casa por palabras completas, no por substring', () => {
    const p: BusinessProfile = { ...AJ, primaryAreas: ['Charles City'], secondaryAreas: [] }
    expect(geoFitFor('Charleston', p)).toBe('fuera_de_zona')
    expect(geoFitFor('Charles City, VA', p)).toBe('zona_principal')
  })

  it('"no lo sé" no es "fuera de zona"', () => {
    // fuera_de_zona resta 10 puntos: es una afirmación sobre el lead. No saber
    // dónde quiere vivir no es estar fuera del área.
    for (const v of ['No estoy seguro', 'not sure', 'notSure', 'Aún no lo sé', 'N/A']) {
      expect(geoFitFor(v, AJ)).toBeNull()
    }
    // Pero "otra zona" sí afirma que está fuera.
    expect(geoFitFor('Miami', AJ)).toBe('fuera_de_zona')
  })

  it('sin zonas declaradas devuelve null, NO fuera_de_zona', () => {
    // geo_fit resta 10 puntos. Aplicarlo por un hueco de configuración seria
    // castigar al lead por algo que la agencia nunca declaró.
    expect(geoFitFor('Miami', EMPTY_PROFILE)).toBeNull()
  })

  it('sin zona del lead tampoco inventa', () => {
    expect(geoFitFor(null, AJ)).toBeNull()
    expect(geoFitFor('   ', AJ)).toBeNull()
  })
})

describe('missingFields — qué le falta al perfil', () => {
  it('un perfil completo no pide nada', () => {
    expect(missingFields(AJ)).toEqual([])
  })

  it('uno vacío pide las cuatro cosas', () => {
    expect(missingFields(EMPTY_PROFILE)).toHaveLength(5)
  })

  it('con una sola comisión ya vale', () => {
    // Hay agencias que solo trabajan un lado del mercado.
    expect(missingFields({ ...AJ, commissionBuy: null })).toEqual([])
  })
})
