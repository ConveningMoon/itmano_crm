import { describe, it, expect } from 'vitest'
import { diagnoseSource, healthHint } from '@/lib/sources/health'
import { EMPTY_PROFILE, type BusinessProfile } from '@/lib/business/profile'

const AJ: BusinessProfile = {
  currency: 'USD', commissionModel: 'percentage', commissionBuy: 3, commissionSell: 3,
  budgetEntryMax: 300_000, budgetPremiumMin: 500_000,
  primaryAreas: ['Virginia Beach'], secondaryAreas: ['North Carolina'],
}

const envio = (...pares: Array<[string, string]>) =>
  ({ answers: pares.map(([key, value]) => ({ key, value })) })

describe('diagnoseSource', () => {
  it('una fuente bien integrada sale limpia', () => {
    const h = diagnoseSource([envio(
      ['timeline', 'under_3_months'], ['financing', 'cash'],
      ['budget_amount', '350000'], ['area', 'Virginia Beach'],
      ['agent_status', 'sin_agente'], ['contingency', 'sin_contingencia'],
    )], AJ)
    expect(h.status).toBe('ok')
    expect(h.valoresInvalidos).toEqual([])
    expect(h.nuncaLlegan).toEqual([])
  })

  it('marca los valores que no casan ningún bucket', () => {
    // El caso real de la web principal de A&J: la clave existe, el valor no.
    const h = diagnoseSource([envio(['timeline', 'immediately'])], AJ)
    expect(h.valoresInvalidos).toContainEqual({ key: 'timeline', value: 'immediately' })
    expect(h.reconocidas).not.toContain('timeline')
  })

  it('una fuente que no puntúa nada se marca entera', () => {
    // Claves slugificadas del texto de la pregunta: el formulario parece
    // calificar y en realidad no alimenta el score.
    const h = diagnoseSource([envio(
      ['cual_es_tu_presupuesto_estimado_de_compr', 'Menos de USD 300,000'],
      ['en_que_plazo_te_gustaria_comprar', 'Lo antes posible'],
    )], AJ)
    expect(h.status).toBe('no_puntua')
    expect(healthHint(h, AJ)).toContain('Ningún envío')
  })

  it('avisa de quien manda el nivel ya resuelto', () => {
    const h = diagnoseSource([envio(['budget_tier', 'premium'])], AJ)
    expect(h.mandaNivelResuelto).toBe(true)
    expect(healthHint(h, AJ)).toContain('nivel ya resuelto')
  })

  it('reporta las zonas que no casan con las declaradas', () => {
    // Es la señal de la errata: si TODOS los envíos traen una zona que no casa,
    // algo está mal en una de las dos puntas.
    const h = diagnoseSource([envio(['area', 'Birginia Beach'])], AJ)
    expect(h.zonasSinCasar).toContain('Birginia Beach')
    expect(healthHint(h, AJ)).toContain('zonas fuera de las tuyas')
  })

  it('sin zonas declaradas no acusa a nadie', () => {
    // El problema estaría en el perfil, no en la fuente.
    const h = diagnoseSource([envio(['area', 'Miami'])], EMPTY_PROFILE)
    expect(h.zonasSinCasar).toEqual([])
  })

  it('las preguntas libres no cuentan como error', () => {
    const h = diagnoseSource([envio(
      ['timeline', 'under_3_months'], ['comentario', 'busco algo con jardín'],
    )], AJ)
    expect(h.valoresInvalidos).toEqual([])
  })

  it('sin envíos no dice nada', () => {
    const h = diagnoseSource([], AJ)
    expect(h.status).toBe('sin_envios')
    expect(healthHint(h, AJ)).toBeNull()
  })

  it('un monto ilegible se reporta', () => {
    const h = diagnoseSource([envio(['budget_amount', 'depende'])], AJ)
    expect(h.valoresInvalidos).toContainEqual({ key: 'budget_amount', value: 'depende' })
  })
})
