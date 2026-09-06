import { describe, it, expect } from 'vitest'
import { diagnoseSource, healthHint, measurementHint } from '@/lib/sources/health'
import { EMPTY_PROFILE, type BusinessProfile } from '@/lib/business/profile'

const AJ: BusinessProfile = {
  currency: 'USD', commissionModel: 'percentage', commissionBuy: 3, commissionSell: 3,
  budgetEntryMax: 300_000, budgetPremiumMin: 500_000,
  primaryAreas: ['Virginia Beach'], secondaryAreas: ['North Carolina'],
  publicSiteUrl: null, newsletterCanonicalTemplate: null,
}

const envio = (...pares: Array<[string, string]>) =>
  ({ answers: pares.map(([key, value]) => ({ key, value })) })

// La mayoría de los casos no van del beacon: se les pasa una visita para
// aislar lo que cada prueba mide.
const CON_VISITAS = 10

describe('diagnoseSource', () => {
  it('una fuente bien integrada sale limpia', () => {
    const h = diagnoseSource([envio(
      ['timeline', 'under_3_months'], ['financing', 'cash'],
      ['budget_amount', '350000'], ['area', 'Virginia Beach'],
      ['agent_status', 'sin_agente'], ['contingency', 'sin_contingencia'],
    )], AJ, CON_VISITAS)
    expect(h.status).toBe('ok')
    expect(h.valoresInvalidos).toEqual([])
    expect(h.nuncaLlegan).toEqual([])
  })

  it('marca los valores que no casan ningún bucket', () => {
    // El caso real de la web principal de A&J: la clave existe, el valor no.
    const h = diagnoseSource([envio(['timeline', 'immediately'], ['financing', 'cash'])], AJ, CON_VISITAS)
    expect(h.status).toBe('parcial')
    expect(h.valoresInvalidos).toContainEqual({ key: 'timeline', value: 'immediately' })
    expect(h.reconocidas).not.toContain('timeline')
  })

  it('un lead magnet que manda 5 de 6 dimensiones sale VERDE', () => {
    // Es el caso real de A&J. No preguntar `contingency` (una dimensión de 5
    // puntos) es una decisión de producto — más preguntas dan mejor perfil pero
    // peor conversión. Mezclarlo con los defectos hacía que un formulario
    // impecable saliera en ámbar y el badge dejara de significar nada.
    const h = diagnoseSource([envio(
      ['timeline', '3_6_months'], ['financing', 'preapproved'],
      ['budget_amount', '300000'], ['area', 'Virginia Beach'],
      ['agent_status', 'sin_agente'], ['property_type', 'single_family'],
    )], AJ, CON_VISITAS)
    expect(h.status).toBe('ok')
    expect(h.nuncaLlegan).toEqual(['contingency'])
    // Pero la oportunidad se informa igual.
    expect(healthHint(h, AJ)).toContain('contingency')
  })

  it('un formulario de contacto puro no es un error', () => {
    // Sólo recoge contacto: no intenta calificar, y eso está bien.
    const h = diagnoseSource([envio(['message', 'Quiero una casa'], ['reason', 'buy'])], AJ, CON_VISITAS)
    expect(h.status).toBe('sin_calificar')
    expect(healthHint(h, AJ)).toContain('sólo recoge el contacto')
  })

  it('una fuente que no puntúa nada se marca entera', () => {
    // Claves slugificadas del texto de la pregunta: el formulario parece
    // calificar y en realidad no alimenta el score.
    const h = diagnoseSource([envio(
      ['cual_es_tu_presupuesto_estimado_de_compr', 'Menos de USD 300,000'],
      ['en_que_plazo_te_gustaria_comprar', 'Lo antes posible'],
      ['ya_estas_trabajando_con_otro_agente_de_b', 'No'],
    )], AJ, CON_VISITAS)
    // Hace preguntas de calificación y ninguna entra: eso SÍ está roto.
    expect(h.status).toBe('no_puntua')
    expect(healthHint(h, AJ)).toContain('ninguna alimenta el score')
  })

  it('avisa de quien manda el nivel ya resuelto', () => {
    const h = diagnoseSource([envio(['budget_tier', 'premium'], ['timeline', 'under_3_months'])], AJ, CON_VISITAS)
    expect(h.mandaNivelResuelto).toBe(true)
    expect(healthHint(h, AJ)).toContain('nivel ya resuelto')
  })

  it('reporta las zonas que no casan con las declaradas', () => {
    // Es la señal de la errata: si TODOS los envíos traen una zona que no casa,
    // algo está mal en una de las dos puntas.
    const h = diagnoseSource([envio(['area', 'Birginia Beach'], ['timeline', 'under_3_months'])], AJ, CON_VISITAS)
    expect(h.zonasSinCasar).toContain('Birginia Beach')
    expect(healthHint(h, AJ)).toContain('zonas fuera de las tuyas')
  })

  it('sin zonas declaradas no acusa a nadie', () => {
    // El problema estaría en el perfil, no en la fuente.
    const h = diagnoseSource([envio(['area', 'Miami'])], EMPTY_PROFILE, CON_VISITAS)
    expect(h.zonasSinCasar).toEqual([])
  })

  it('las preguntas libres no cuentan como error', () => {
    const h = diagnoseSource([envio(
      ['timeline', 'under_3_months'], ['comentario', 'busco algo con jardín'],
    )], AJ, CON_VISITAS)
    expect(h.valoresInvalidos).toEqual([])
  })

  it('envíos sin ninguna visita = falta el script de medición', () => {
    // Es el caso de las landing externas de A&J: los formularios entran, pero
    // nadie sabe cuánta gente vio la página sin llenarla.
    const h = diagnoseSource([envio(['timeline', 'under_3_months'])], AJ, 0)
    expect(h.faltaBeacon).toBe(true)
    expect(h.measurement).toBe('sin_medicion')
    expect(measurementHint(h)).toContain('script de medición')
    // Y NO ensucia el estado del formulario: las preguntas están bien. Son dos
    // problemas con dos culpables distintos.
    expect(h.status).toBe('ok')
    expect(healthHint(h, AJ)).not.toContain('script')
  })

  it('sin envíos no dice nada', () => {
    const h = diagnoseSource([], AJ, 0)
    expect(h.status).toBe('sin_envios')
    expect(healthHint(h, AJ)).toBeNull()
  })

  it('un monto ilegible se reporta', () => {
    const h = diagnoseSource([envio(['budget_amount', 'depende'], ['timeline', 'under_3_months'])], AJ, CON_VISITAS)
    expect(h.valoresInvalidos).toContainEqual({ key: 'budget_amount', value: 'depende' })
  })
})
