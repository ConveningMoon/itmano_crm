import { describe, it, expect } from 'vitest'
import {
  MAX_SOURCE_DOMAINS, normalizeDomain, parseSourceDomains, canGenerateWithAi,
} from '@/lib/newsletters/source-domains'

describe('normalizeDomain', () => {
  it('acepta un hostname normal y lo deja en minusculas', () => {
    expect(normalizeDomain('NAR.realtor')).toBe('nar.realtor')
    expect(normalizeDomain('fred.stlouisfed.org')).toBe('fred.stlouisfed.org')
  })

  it('quita el esquema, la ruta y los espacios', () => {
    expect(normalizeDomain('  https://www.idealista.com/precios/  ')).toBe('www.idealista.com')
    expect(normalizeDomain('http://ine.es')).toBe('ine.es')
  })

  it('rechaza lo que la herramienta rechaza', () => {
    expect(normalizeDomain('192.168.1.1')).toBeNull()   // IP
    expect(normalizeDomain('8.8.8.8')).toBeNull()       // IP
    expect(normalizeDomain('com')).toBeNull()           // TLD desnudo
    expect(normalizeDomain('localhost')).toBeNull()     // una sola etiqueta
    expect(normalizeDomain('intranet')).toBeNull()      // una sola etiqueta
    expect(normalizeDomain('')).toBeNull()
    expect(normalizeDomain('   ')).toBeNull()
  })
})

describe('parseSourceDomains', () => {
  it('separa lo valido de lo rechazado y deduplica', () => {
    const r = parseSourceDomains(['nar.realtor', 'NAR.realtor', '10.0.0.1', 'zillow.com'])
    expect(r.domains).toEqual(['nar.realtor', 'zillow.com'])
    expect(r.rejected).toEqual(['10.0.0.1'])
  })

  it('trunca en el maximo que admite la herramienta', () => {
    const muchos = Array.from({ length: 80 }, (_, i) => `fuente${i}.example.com`)
    expect(parseSourceDomains(muchos).domains).toHaveLength(MAX_SOURCE_DOMAINS)
  })

  it('devuelve vacio ante basura, sin lanzar', () => {
    expect(parseSourceDomains(null)).toEqual({ domains: [], rejected: [] })
    expect(parseSourceDomains('nar.realtor')).toEqual({ domains: [], rejected: [] })
    expect(parseSourceDomains({})).toEqual({ domains: [], rejected: [] })
  })

  it('acepta lo que produce un textarea de una fuente por linea', () => {
    const pegado = ['  nar.realtor  ', '', 'https://redfin.com/noticias', '   ', 'no-valido']
    const r = parseSourceDomains(pegado)
    expect(r.domains).toEqual(['nar.realtor', 'redfin.com'])
    expect(r.rejected).toEqual(['no-valido'])
  })
})

describe('canGenerateWithAi', () => {
  it('sin dominios declarados no se puede generar', () => {
    expect(canGenerateWithAi(null)).toBe(false)
    expect(canGenerateWithAi([])).toBe(false)
  })

  it('con al menos uno, si', () => {
    expect(canGenerateWithAi(['nar.realtor'])).toBe(true)
  })
})
