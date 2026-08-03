/**
 * Extracción de fit en el intake. Funciones puras, sin base de datos.
 *
 * Vivía en tests/scoring, que pega a la BD remota y por eso NO corre en
 * `test:unit` — estas pruebas puras sólo se ejecutaban al lanzar la suite de
 * scoring a mano. Aquí entran en CI con el resto.
 */

import { describe, it, expect } from 'vitest'
import {
  normalizeIntent, extractFitDimensions, extractBudgetAmount, parseAmount,
} from '@/lib/services/intake-fit'
import { EMPTY_PROFILE, type BusinessProfile } from '@/lib/business/profile'

// Hampton Roads, los cortes reales de A&J.
const AJ: BusinessProfile = {
  currency: 'USD', commissionModel: 'percentage',
  commissionBuy: 3, commissionSell: 3,
  budgetEntryMax: 250_000, budgetPremiumMin: 600_000,
  primaryAreas: ['Virginia Beach', 'Norfolk'], secondaryAreas: ['Chesapeake'],
}

describe('normalizeIntent', () => {
  it('mapea las grafías de compra a "buy"', () => {
    for (const v of ['buy', 'Compra', ' comprar ', 'COMPRADOR', 'purchase']) {
      expect(normalizeIntent(v)).toBe('buy')
    }
  })
  it('mapea las de inversión a "invest"', () => {
    for (const v of ['invest', 'invierte', 'invertir', 'inversionista']) {
      expect(normalizeIntent(v)).toBe('invest')
    }
  })
  it('mapea las de venta a "sell"', () => {
    for (const v of ['sell', 'vende', 'vender', 'vendedor']) {
      expect(normalizeIntent(v)).toBe('sell')
    }
  })
  it('devuelve null para lo desconocido', () => {
    expect(normalizeIntent('rent')).toBeNull()
    expect(normalizeIntent(undefined)).toBeNull()
    expect(normalizeIntent(42)).toBeNull()
  })
})

describe('extractFitDimensions — códigos directos', () => {
  it('extrae las dimensiones de compra e ignora el texto libre', () => {
    const answers = [
      { key: 'timeline',     value: 'under_3_months' },
      { key: 'financing',    value: 'cash' },
      { key: 'budget_tier',  value: 'premium' },
      { key: 'agent_status', value: 'sin_agente' },
      { key: 'comments',     value: 'me gustaría una casa con jardín' },
    ]
    expect(extractFitDimensions('buy', answers)).toEqual({
      timeline: 'under_3_months',
      financing: 'cash',
      budget_tier: 'premium',
      agent_status: 'sin_agente',
    })
  })

  it('reconoce las tres dimensiones que añadió la 077', () => {
    // El bug: la lista de dimensiones estaba escrita a mano con las cuatro de la
    // migración 029. La 077 añadió estas tres CON reglas y puntos en la base, y
    // el intake las tiraba en silencio — nunca llegaron a ningún fit_profile.
    const answers = [
      { key: 'contingency',  value: 'sin_contingencia' },
      { key: 'geo_fit',      value: 'zona_principal' },
      { key: 'property_use', value: 'inversion' },
    ]
    expect(extractFitDimensions('buy', answers)).toEqual({
      contingency: 'sin_contingencia',
      geo_fit: 'zona_principal',
      property_use: 'inversion',
    })
  })

  it('acota por intención — un formulario de compra no inyecta dimensiones de venta', () => {
    const answers = [
      { key: 'timeline',        value: '3_6_months' },
      { key: 'sell_motivation', value: 'alta' },
    ]
    expect(extractFitDimensions('buy', answers)).toEqual({ timeline: '3_6_months' })
  })

  it('extrae las dimensiones de venta, incluida geo_fit', () => {
    const answers = [
      { key: 'sell_motivation', value: 'alta' },
      { key: 'listing_status',  value: 'no_listado_sin_agente' },
      { key: 'geo_fit',         value: 'zona_principal' },
      { key: 'financing',       value: 'cash' }, // no es dimensión de venta
    ]
    expect(extractFitDimensions('sell', answers)).toEqual({
      sell_motivation: 'alta',
      listing_status: 'no_listado_sin_agente',
      geo_fit: 'zona_principal',
    })
  })

  it('sin intención cae a la unión de todas las dimensiones', () => {
    const answers = [
      { key: 'timeline',        value: '6_12_months' },
      { key: 'sell_motivation', value: 'media' },
      { key: 'random',          value: 'x' },
    ]
    expect(extractFitDimensions(null, answers)).toEqual({
      timeline: '6_12_months',
      sell_motivation: 'media',
    })
  })

  it('descarta valores vacíos (no pisa una respuesta conocida con un blanco)', () => {
    const answers = [
      { key: 'timeline',  value: '   ' },
      { key: 'financing', value: 'preapproved' },
    ]
    expect(extractFitDimensions('buy', answers)).toEqual({ financing: 'preapproved' })
  })

  it('sin respuestas devuelve vacío', () => {
    expect(extractFitDimensions('buy', undefined)).toEqual({})
    expect(extractFitDimensions('buy', [])).toEqual({})
  })
})

describe('extractFitDimensions — dato crudo clasificado con el perfil', () => {
  it('clasifica el monto contra los cortes de ESA agencia', () => {
    const answers = [{ key: 'budget_amount', value: '350000' }]
    expect(extractFitDimensions('buy', answers, AJ)).toEqual({ budget_tier: 'mid' })
    expect(extractFitDimensions('buy', [{ key: 'budget_amount', value: 700_000 }], AJ))
      .toEqual({ budget_tier: 'premium' })
  })

  it('clasifica la zona contra las zonas declaradas', () => {
    expect(extractFitDimensions('buy', [{ key: 'area', value: 'Virginia Beach, VA' }], AJ))
      .toEqual({ geo_fit: 'zona_principal' })
    expect(extractFitDimensions('buy', [{ key: 'area', value: 'Miami' }], AJ))
      .toEqual({ geo_fit: 'fuera_de_zona' })
  })

  it('el dato crudo gana sobre el código que mandó el formulario', () => {
    // El formulario no puede saber qué es "premium" para esta agencia; los cortes
    // del tenant sí. 300.000 es mid en Hampton Roads, diga lo que diga el form.
    const answers = [
      { key: 'budget_tier',   value: 'premium' },
      { key: 'budget_amount', value: '300,000' },
    ]
    expect(extractFitDimensions('buy', answers, AJ)).toEqual({ budget_tier: 'mid' })
  })

  it('sin perfil no deriva nada, y deja en pie lo que el formulario declaró', () => {
    const answers = [
      { key: 'budget_tier',   value: 'entry' },
      { key: 'budget_amount', value: '300000' },
      { key: 'area',          value: 'Miami' },
    ]
    // Sin cortes ni zonas: budget_tier se queda con el código del formulario y
    // geo_fit no se inventa (restaría 10 puntos por un hueco de configuración).
    expect(extractFitDimensions('buy', answers, EMPTY_PROFILE)).toEqual({ budget_tier: 'entry' })
    expect(extractFitDimensions('buy', answers)).toEqual({ budget_tier: 'entry' })
  })

  it('un formulario de venta no inyecta budget_tier por mandar un monto', () => {
    // budget_tier no es dimensión de venta: el acotado por intención vale igual
    // para el camino derivado que para el directo.
    const answers = [
      { key: 'budget_amount', value: '900000' },
      { key: 'area',          value: 'Norfolk' },
    ]
    expect(extractFitDimensions('sell', answers, AJ)).toEqual({ geo_fit: 'zona_principal' })
  })

  it('un monto ilegible no produce bucket', () => {
    expect(extractFitDimensions('buy', [{ key: 'budget_amount', value: 'no sé todavía' }], AJ)).toEqual({})
  })
})

describe('parseAmount', () => {
  it('acepta números tal cual', () => {
    expect(parseAmount(350_000)).toBe(350_000)
    expect(parseAmount(0)).toBe(0)
    expect(parseAmount(-5)).toBeNull()
    expect(parseAmount(Number.NaN)).toBeNull()
  })

  it('resuelve los separadores por forma, no por locale', () => {
    // "350.000" es trescientos cincuenta mil en es-ES y trescientos cincuenta con
    // decimales en en-US. Un grupo final de exactamente 3 dígitos es de miles:
    // un presupuesto de 350,5 no existe.
    expect(parseAmount('350000')).toBe(350_000)
    expect(parseAmount('350,000')).toBe(350_000)
    expect(parseAmount('350.000')).toBe(350_000)
    expect(parseAmount('1,234,567')).toBe(1_234_567)
    expect(parseAmount('1.234.567')).toBe(1_234_567)
  })

  it('con los dos separadores, el último es el decimal', () => {
    expect(parseAmount('1,234.56')).toBe(1234.56)
    expect(parseAmount('1.234,56')).toBe(1234.56)
  })

  it('ignora símbolos de moneda y espacios', () => {
    expect(parseAmount('$350,000')).toBe(350_000)
    expect(parseAmount(' USD 350000 ')).toBe(350_000)
    expect(parseAmount('350000 €')).toBe(350_000)
  })

  it('entiende los sufijos de escala', () => {
    expect(parseAmount('350k')).toBe(350_000)
    expect(parseAmount('1.2M')).toBe(1_200_000)
  })

  it('un rango se resuelve al punto medio', () => {
    // "entre 300 y 400" no es una declaración de 300.
    expect(parseAmount('300000-400000')).toBe(350_000)
    expect(parseAmount('300.000 – 400.000')).toBe(350_000)
    expect(parseAmount('entre 300k y 400k')).toBe(350_000)
    expect(parseAmount('$300,000 to $400,000')).toBe(350_000)
    // Sin contemplar el sufijo antes del guion, esto se leía como el número
    // 300400 con sufijo k: trescientos millones, y el lead salía premium.
    expect(parseAmount('300k-400k')).toBe(350_000)
    expect(parseAmount('1M-2M')).toBe(1_500_000)
  })

  it('devuelve null cuando no hay nada parseable — nunca 0', () => {
    // Un 0 afirmaría que su presupuesto es cero. No saberlo no es eso.
    expect(parseAmount('no sé')).toBeNull()
    expect(parseAmount('')).toBeNull()
    expect(parseAmount(null)).toBeNull()
    expect(parseAmount(undefined)).toBeNull()
    expect(parseAmount(true)).toBeNull()
  })
})

describe('extractBudgetAmount', () => {
  it('devuelve el monto declarado en este envío', () => {
    expect(extractBudgetAmount([{ key: 'budget_amount', value: '$420,000' }])).toBe(420_000)
  })

  it('null cuando el formulario no lo manda o no se entiende', () => {
    expect(extractBudgetAmount([{ key: 'budget_tier', value: 'premium' }])).toBeNull()
    expect(extractBudgetAmount([{ key: 'budget_amount', value: 'depende' }])).toBeNull()
    expect(extractBudgetAmount(undefined)).toBeNull()
  })
})
