import { describe, it, expect } from 'vitest'
import {
  optionsFor, unavailableReason, resolveQuestions, QUALIFYING_DIMENSIONS,
  type ResolvableQuestion,
} from '@/lib/hosted-questions'
import { extractFitDimensions } from '@/lib/services/intake-fit'
import { EMPTY_PROFILE, type BusinessProfile } from '@/lib/business/profile'

// Los cortes REALES de A&J tras la calibración de esta sesión.
const AJ: BusinessProfile = {
  currency: 'USD', commissionModel: 'percentage', commissionBuy: 3, commissionSell: 3,
  budgetEntryMax: 300_000, budgetPremiumMin: 500_000,
  primaryAreas: ['Virginia Beach', 'Norfolk'], secondaryAreas: ['Chesapeake'],
}

describe('optionsFor — las opciones salen del perfil, no del código', () => {
  it('el presupuesto usa los cortes de ESA agencia', () => {
    const o = optionsFor('budget_amount', AJ, 'es')!
    expect(o.map(x => x.label)).toEqual([
      'Hasta $300.000', '$300.000 – $500.000', 'Más de $500.000', 'Aún no lo sé',
    ])
    expect(o.map(x => x.value)).toEqual(['300000', '300000-500000', '500000', 'no_definido'])
  })

  it('las zonas son las que declaró la agencia', () => {
    const o = optionsFor('area', AJ, 'es')!
    expect(o.map(x => x.value)).toEqual(['Virginia Beach', 'Norfolk', 'Chesapeake', 'otra'])
  })

  it('sin rangos ni zonas la pregunta no se ofrece', () => {
    // Ofrecerla vacía seria una trampa: el visitante no puede contestar y el CRM
    // recibe basura. Mejor decir que falta configurarla.
    expect(optionsFor('budget_amount', EMPTY_PROFILE, 'es')).toBeNull()
    expect(optionsFor('area', EMPTY_PROFILE, 'es')).toBeNull()
    expect(unavailableReason('budget_amount', EMPTY_PROFILE)).toBe('sin_rangos')
    expect(unavailableReason('area', EMPTY_PROFILE)).toBe('sin_zonas')
  })

  it('las dimensiones de vocabulario fijo no dependen del perfil', () => {
    for (const d of ['timeline', 'financing', 'agent_status', 'contingency'] as const) {
      expect(optionsFor(d, EMPTY_PROFILE, 'es')).not.toBeNull()
    }
  })

  it('traduce a los tres idiomas de la página', () => {
    expect(optionsFor('timeline', AJ, 'en')![0].label).toBe('In the next 3 months')
    expect(optionsFor('timeline', AJ, 'pt')![0].label).toBe('Nos próximos 3 meses')
    expect(optionsFor('budget_amount', AJ, 'en')![0].label).toBe('Up to $300.000')
  })
})

describe('resolveQuestions', () => {
  const califica = (dimension: string, label = 'x'): ResolvableQuestion =>
    ({ key: dimension, label, type: 'select', required: false, dimension: dimension as never })

  it('rellena las opciones y fija la clave a la dimensión', () => {
    const [q] = resolveQuestions([califica('budget_amount', '¿Presupuesto?')], AJ, 'es')
    expect(q.key).toBe('budget_amount')
    expect(q.label).toBe('¿Presupuesto?')
    expect(q.options).toEqual(['300000', '300000-500000', '500000', 'no_definido'])
    expect(q.optionLabels?.[0]).toBe('Hasta $300.000')
  })

  it('omite la pregunta si el perfil dejó de permitirla', () => {
    // El tenant borró sus rangos: mejor no mostrarla que mostrarla vacía.
    expect(resolveQuestions([califica('budget_amount')], EMPTY_PROFILE, 'es')).toEqual([])
  })

  it('las preguntas libres pasan intactas', () => {
    const libre: ResolvableQuestion = { key: 'comentario', label: 'Algo más', type: 'text', required: false }
    expect(resolveQuestions([libre], AJ, 'es')).toEqual([libre])
  })
})

describe('el círculo se cierra: lo que el formulario manda, el CRM lo puntúa', () => {
  it('cada opción generada produce el bucket correcto', () => {
    // Es la invariante que justifica todo el diseño: las opciones salen de los
    // mismos cortes con los que el CRM clasifica, asi que el nivel NO puede
    // discrepar de lo que el formulario ofrecio.
    const esperado = ['entry', 'mid', 'premium', undefined]
    optionsFor('budget_amount', AJ, 'es')!.forEach((o, i) => {
      const fit = extractFitDimensions('buy', [{ key: 'budget_amount', value: o.value }], AJ)
      expect(fit.budget_tier).toBe(esperado[i])
    })
  })

  it('las tres bandas son alcanzables desde el formulario', () => {
    // Con unos cortes mal puestos, las tres opciones podrian caer todas en el
    // mismo bucket y `budget_tier` dejaria de discriminar sin que nadie lo note.
    const buckets = optionsFor('budget_amount', AJ, 'es')!
      .map(o => extractFitDimensions('buy', [{ key: 'budget_amount', value: o.value }], AJ).budget_tier)
      .filter(Boolean)
    expect(new Set(buckets).size).toBe(3)
  })

  it('las zonas generadas caen donde deben', () => {
    const fit = (v: string) => extractFitDimensions('buy', [{ key: 'area', value: v }], AJ).geo_fit
    expect(fit('Virginia Beach')).toBe('zona_principal')
    expect(fit('Chesapeake')).toBe('zona_secundaria')
    expect(fit('otra')).toBe('fuera_de_zona')
  })

  it('toda dimensión ofrecida por el constructor la reconoce el intake', () => {
    for (const d of QUALIFYING_DIMENSIONS) {
      const o = optionsFor(d, AJ, 'es')
      if (!o) continue
      const fit = extractFitDimensions('buy', [{ key: d, value: o[0].value }], AJ)
      expect(Object.keys(fit).length).toBeGreaterThan(0)
    }
  })
})
