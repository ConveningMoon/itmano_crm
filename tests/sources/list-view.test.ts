import { describe, expect, it } from 'vitest'
import { combinedHealth, filterChannels } from '@/lib/sources/list-view'
import { MEASUREMENT_COPY, STATUS_COPY, type SourceHealth } from '@/lib/sources/health'

function health(over: Partial<SourceHealth>): SourceHealth {
  return {
    submissions: 5, status: 'ok', measurement: 'midiendo', reconocidas: [],
    valoresInvalidos: [], zonasSinCasar: [], mandaNivelResuelto: false,
    nuncaLlegan: [], preguntasLibres: 0, faltaBeacon: false, ...over,
  }
}

describe('combinedHealth', () => {
  it('sin envíos devuelve null', () => {
    expect(combinedHealth(undefined)).toBeNull()
    expect(combinedHealth(health({ submissions: 0, status: 'sin_envios', measurement: 'sin_datos' }))).toBeNull()
  })

  it('usa el peor tono de los dos semáforos: bad > warn > ok > mute', () => {
    expect(combinedHealth(health({ status: 'no_puntua', measurement: 'sin_medicion' }))!.tone).toBe('bad')
    expect(combinedHealth(health({ status: 'ok', measurement: 'sin_medicion' }))!.tone).toBe('warn')
    expect(combinedHealth(health({ status: 'parcial', measurement: 'midiendo' }))!.tone).toBe('warn')
    expect(combinedHealth(health({ status: 'ok', measurement: 'midiendo' }))!.tone).toBe('ok')
    expect(combinedHealth(health({ status: 'sin_calificar', measurement: 'sin_datos' }))!.tone).toBe('mute')
    expect(combinedHealth(health({ status: 'sin_calificar', measurement: 'midiendo' }))!.tone).toBe('ok')
  })

  it('la etiqueta es la del semáforo peor y lines trae ambos con what y why', () => {
    const r = combinedHealth(health({ status: 'ok', measurement: 'sin_medicion' }))!
    expect(r.label).toBe(MEASUREMENT_COPY.sin_medicion.label)
    expect(r.lines).toEqual([
      { label: STATUS_COPY.ok.label, what: STATUS_COPY.ok.what, why: STATUS_COPY.ok.why },
      { label: MEASUREMENT_COPY.sin_medicion.label, what: MEASUREMENT_COPY.sin_medicion.what, why: MEASUREMENT_COPY.sin_medicion.why },
    ])
    expect(combinedHealth(health({ status: 'no_puntua', measurement: 'midiendo' }))!.label)
      .toBe(STATUS_COPY.no_puntua.label)
  })
})

const channels = [
  { name: 'Casa Árbol', channelType: 'form', publicId: 'abc123' },
  { name: 'Landing Miami', channelType: 'landing', publicId: 'xyz789' },
  { name: 'Sección Única', channelType: 'form', publicId: 'q-55' },
]

describe('filterChannels', () => {
  it('type all deja pasar todo; otro type filtra', () => {
    expect(filterChannels(channels, { type: 'all', query: '' })).toHaveLength(3)
    expect(filterChannels(channels, { type: 'form', query: '' }).map(c => c.publicId)).toEqual(['abc123', 'q-55'])
  })

  it('busca sin distinguir mayúsculas ni acentos, por nombre e id público', () => {
    expect(filterChannels(channels, { type: 'all', query: 'ARBOL' }).map(c => c.publicId)).toEqual(['abc123'])
    expect(filterChannels(channels, { type: 'all', query: 'seccion unica' }).map(c => c.publicId)).toEqual(['q-55'])
    expect(filterChannels(channels, { type: 'all', query: 'XYZ' }).map(c => c.publicId)).toEqual(['xyz789'])
  })

  it('consulta vacía o con espacios no filtra', () => {
    expect(filterChannels(channels, { type: 'all', query: '   ' })).toHaveLength(3)
  })

  it('funciona igual para canales que estén dentro de carpetas: filtra la lista de entrada', () => {
    const enCarpeta = channels.filter(c => c.channelType === 'landing')
    expect(filterChannels(enCarpeta, { type: 'all', query: 'miami' })).toHaveLength(1)
    expect(filterChannels(enCarpeta, { type: 'form', query: '' })).toHaveLength(0)
  })
})
