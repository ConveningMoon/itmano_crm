import { describe, it, expect } from 'vitest'
import { formatResponseTime, responseTimeTone } from '@/lib/leads/response-time'

describe('formatResponseTime — la unidad se elige por magnitud', () => {
  it('debajo de una hora, minutos', () => {
    expect(formatResponseTime(0.5)).toBe('30 min')
    expect(formatResponseTime(0.25)).toBe('15 min')
  })

  it('una respuesta casi instantánea no se muestra como 0', () => {
    // Redondear a "0 min" se leería como "no tardó nada", que es una afirmación
    // más fuerte que el dato.
    expect(formatResponseTime(0.001)).toBe('<1 min')
  })

  it('entre una hora y un día, horas', () => {
    expect(formatResponseTime(1)).toBe('1 h')
    expect(formatResponseTime(3.5)).toBe('3.5 h')
    expect(formatResponseTime(23.9)).toBe('23.9 h')
  })

  it('a partir de un día, días con el resto', () => {
    expect(formatResponseTime(24)).toBe('1 d')
    expect(formatResponseTime(28)).toBe('1 d 4 h')
    expect(formatResponseTime(50)).toBe('2 d 2 h')
  })

  it('el redondeo del resto no inventa un "1 d 24 h"', () => {
    expect(formatResponseTime(47.8)).toBe('2 d')
  })

  it('sin dato es raya, no cero', () => {
    // Cero significa "respondió al instante"; null significa "no sabemos".
    expect(formatResponseTime(null)).toBe('—')
    expect(formatResponseTime(undefined)).toBe('—')
    expect(formatResponseTime(NaN)).toBe('—')
  })
})

describe('responseTimeTone — colorea, no puntúa', () => {
  it('la primera hora es el estándar del sector', () => {
    expect(responseTimeTone(0.5)).toBe('bueno')
    expect(responseTimeTone(1)).toBe('bueno')
  })

  it('dentro del día, aceptable', () => {
    expect(responseTimeTone(1.1)).toBe('medio')
    expect(responseTimeTone(24)).toBe('medio')
  })

  it('más de un día, mal', () => {
    expect(responseTimeTone(24.1)).toBe('malo')
    expect(responseTimeTone(200)).toBe('malo')
  })

  it('sin dato no opina', () => {
    expect(responseTimeTone(null)).toBe('neutro')
  })
})
