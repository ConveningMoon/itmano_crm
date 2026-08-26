import { describe, it, expect } from 'vitest'
import {
  normalizeTopic, periodFor, cacheKeyFor, domainsMatch,
} from '@/lib/newsletters/ai/dossier-cache'

// Las cuatro piezas puras del caché del dossier. Lo que se prueba aquí es la
// LLAVE, que es donde un caché se rompe de verdad: una llave demasiado laxa
// sirve datos que no corresponden, y una demasiado estricta no acierta nunca y
// el ahorro no existe.

describe('normalizeTopic', () => {
  it('acentos, mayúsculas y puntuación no cambian la llave', () => {
    const base = normalizeTopic('mercado de virginia beach')
    expect(normalizeTopic('Mercado de Virginia Beach')).toBe(base)
    expect(normalizeTopic('  MERCADO de Virginia Beach!  ')).toBe(base)
    expect(normalizeTopic('Mercado  de   Virginia Beach')).toBe(base)
  })

  it('quita los diacríticos sin perder la letra', () => {
    expect(normalizeTopic('Hipotecas y crédito')).toBe('hipotecas y credito')
    expect(normalizeTopic('Niños compradores')).toBe('ninos compradores')
  })

  it('temas distintos siguen siendo llaves distintas', () => {
    expect(normalizeTopic('mercado de Norfolk'))
      .not.toBe(normalizeTopic('mercado de Virginia Beach'))
  })
})

describe('periodFor', () => {
  it('es el mes natural en UTC', () => {
    expect(periodFor(new Date('2026-08-26T16:00:00Z'))).toBe('2026-08')
    expect(periodFor(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01')
  })

  it('dos fechas del mismo mes comparten periodo', () => {
    expect(periodFor(new Date('2026-08-01T00:00:00Z')))
      .toBe(periodFor(new Date('2026-08-31T23:59:59Z')))
  })
})

describe('cacheKeyFor', () => {
  const now = new Date('2026-08-26T16:00:00Z')

  it('sin tema NO hay llave: el tema lo elige la IA y reutilizar repetiría la edición', () => {
    expect(cacheKeyFor(null, 'es', now)).toBeNull()
    expect(cacheKeyFor('', 'es', now)).toBeNull()
    expect(cacheKeyFor('   ', 'es', now)).toBeNull()
  })

  it('un tema que se queda vacío al normalizar tampoco da llave', () => {
    expect(cacheKeyFor('!!! ???', 'es', now)).toBeNull()
  })

  it('el idioma forma parte de la llave', () => {
    const es = cacheKeyFor('Mercado de Norfolk', 'es', now)
    const en = cacheKeyFor('Mercado de Norfolk', 'en', now)
    expect(es).not.toBeNull()
    expect(en).not.toBeNull()
    expect(es!.topicKey).toBe(en!.topicKey)
    expect(es!.language).not.toBe(en!.language)
  })

  it('el mismo tema escrito distinto da la MISMA llave', () => {
    expect(cacheKeyFor('Mercado de Norfolk', 'es', now))
      .toEqual(cacheKeyFor('  mercado  de  norfolk ', 'es', now))
  })
})

describe('domainsMatch', () => {
  it('el orden no cuenta', () => {
    expect(domainsMatch(['a.com', 'b.com'], ['b.com', 'a.com'])).toBe(true)
  })

  it('añadir o quitar un dominio invalida el dossier guardado', () => {
    // Reutilizarlo publicaría citas de dominios que el tenant ya no autoriza,
    // que es la garantía que sostiene el producto entero.
    expect(domainsMatch(['a.com'], ['a.com', 'b.com'])).toBe(false)
    expect(domainsMatch(['a.com', 'b.com'], ['a.com'])).toBe(false)
    expect(domainsMatch(['a.com'], ['b.com'])).toBe(false)
  })

  it('dos listas vacías coinciden', () => {
    expect(domainsMatch([], [])).toBe(true)
  })
})
