import { describe, it, expect } from 'vitest'
import { slugify, uniqueSlug, isUniqueViolation } from '@/lib/newsletters/slug'

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

describe('slugify — caso latino', () => {
  it('normaliza acentos, espacios y signos', () => {
    expect(slugify('Mercado inmobiliario de Hampton Roads')).toBe('mercado-inmobiliario-de-hampton-roads')
    expect(slugify('¿Cómo está el mercado?')).toBe('como-esta-el-mercado')
    expect(slugify('  Doble   espacio  ')).toBe('doble-espacio')
  })

  it('no deja guiones sueltos en los extremos', () => {
    expect(slugify('--- Titular ---')).toBe('titular')
    expect(slugify('Titular!!!')).toBe('titular')
  })

  it('recorta a un ancho razonable sin dejar el guión colgando', () => {
    const s = slugify('a'.repeat(40) + ' ' + 'b'.repeat(40))
    expect(s.length).toBeLessThanOrEqual(60)
    expect(s.endsWith('-')).toBe(false)
    expect(s).toMatch(SLUG_RE)
  })
})

// El esquema admite 19 idiomas y el filtro sólo conserva [a-z0-9]: sin el
// respaldo, un titular ruso o chino daba slug '' y la página pública quedaba en
// una URL rota — o la fila ni siquiera pasaba el índice único.
describe('slugify — idiomas que no se translitera', () => {
  const casos = [
    ['cirílico', 'Рынок недвижимости'],
    ['chino',    '市场报告'],
    ['japonés',  '不動産市場'],
    ['griego',   'Αγορά ακινήτων'],
  ] as const

  for (const [nombre, titulo] of casos) {
    it(`${nombre} produce un slug válido y no vacío`, () => {
      const s = slugify(titulo)
      expect(s).not.toBe('')
      expect(s).toMatch(SLUG_RE)
    })
  }

  it('dos titulares distintos e intransliterables no comparten slug', () => {
    expect(slugify('Рынок недвижимости')).not.toBe(slugify('市场报告'))
  })

  it('es determinista: el mismo titular da siempre el mismo slug', () => {
    expect(slugify('市场报告')).toBe(slugify('市场报告'))
  })
})

describe('slugify — entradas degeneradas', () => {
  it('sólo símbolos', () => {
    const s = slugify('!!! ¿¿¿ ***')
    expect(s).toMatch(SLUG_RE)
  })

  it('cadena vacía y sólo espacios', () => {
    expect(slugify('')).toMatch(SLUG_RE)
    expect(slugify('   ')).toMatch(SLUG_RE)
    expect(slugify('')).toBe(slugify('   '))
  })

  it('nunca devuelve la cadena vacía', () => {
    for (const raw of ['', '   ', '---', '###', '市场报告', '́']) {
      expect(slugify(raw)).not.toBe('')
    }
  })
})

describe('uniqueSlug', () => {
  it('devuelve la base cuando está libre', () => {
    expect(uniqueSlug('mercado', [])).toBe('mercado')
    expect(uniqueSlug('mercado', ['contacto'])).toBe('mercado')
  })

  it('numera a partir de 2 y salta los ocupados', () => {
    expect(uniqueSlug('contacto', ['contacto'])).toBe('contacto-2')
    expect(uniqueSlug('contacto', ['contacto', 'contacto-2'])).toBe('contacto-3')
  })

  it('el resultado sigue siendo un slug válido', () => {
    expect(uniqueSlug('contacto', ['contacto'])).toMatch(SLUG_RE)
  })

  it('nunca devuelve un slug que sabemos ocupado', () => {
    const taken = ['x', ...Array.from({ length: 250 }, (_, i) => `x-${i + 2}`)]
    const s = uniqueSlug('x', taken)
    expect(taken).not.toContain(s)
    expect(s).toMatch(SLUG_RE)
  })
})

describe('isUniqueViolation', () => {
  it('reconoce el código de Postgres', () => {
    expect(isUniqueViolation({ code: '23505', message: 'whatever' })).toBe(true)
  })

  it('reconoce los mensajes de los dos índices que gobiernan esto', () => {
    expect(isUniqueViolation({
      message: 'duplicate key value violates unique constraint "acquisition_channels_tenant_slug_unique"',
    })).toBe(true)
    expect(isUniqueViolation({
      message: 'duplicate key value violates unique constraint "newsletter_editions_channel_slug_idx"',
    })).toBe(true)
  })

  it('deja pasar cualquier otro error sin disfrazarlo', () => {
    expect(isUniqueViolation({ code: '23503', message: 'foreign key violation' })).toBe(false)
    expect(isUniqueViolation({ message: 'network error' })).toBe(false)
    expect(isUniqueViolation({})).toBe(false)
  })
})
