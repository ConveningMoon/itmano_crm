import { describe, it, expect } from 'vitest'
import {
  parseCanonicalTemplate,
  editionCanonicalUrl,
  isExternalCanonical,
  editionAlternates,
} from '@/lib/newsletters/canonical'

describe('parseCanonicalTemplate', () => {
  it('acepta una plantilla https con {slug}', () => {
    const r = parseCanonicalTemplate('https://ajrealestate.com/newsletter/{slug}')
    expect(r).toEqual({ ok: true, value: 'https://ajrealestate.com/newsletter/{slug}' })
  })

  it('recorta espacios alrededor', () => {
    const r = parseCanonicalTemplate('  https://a.com/n/{slug}  ')
    expect(r.ok && r.value).toBe('https://a.com/n/{slug}')
  })

  // Sin {slug} todas las ediciones declararian la MISMA canonica: Google
  // colapsaria el archivo entero en una sola pagina.
  it('rechaza una plantilla sin {slug}', () => {
    const r = parseCanonicalTemplate('https://ajrealestate.com/newsletter')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('{slug}')
  })

  it('rechaza http y cualquier cosa que no sea una URL absoluta', () => {
    expect(parseCanonicalTemplate('http://a.com/{slug}').ok).toBe(false)
    expect(parseCanonicalTemplate('/newsletter/{slug}').ok).toBe(false)
    expect(parseCanonicalTemplate('ajrealestate.com/{slug}').ok).toBe(false)
  })

  it('cadena vacia: no es un error, es "sin configurar"', () => {
    const r = parseCanonicalTemplate('   ')
    expect(r).toEqual({ ok: true, value: '' })
  })
})

describe('editionCanonicalUrl', () => {
  it('sin plantilla apunta a news.itmano.com', () => {
    expect(editionCanonicalUrl({ tenantSlug: 'aj-real-estate', editionSlug: 'agosto', template: null }))
      .toBe('https://news.itmano.com/aj-real-estate/agosto')
  })

  it('con plantilla apunta al dominio del cliente', () => {
    expect(editionCanonicalUrl({
      tenantSlug: 'aj-real-estate', editionSlug: 'agosto',
      template: 'https://ajrealestate.com/newsletter/{slug}',
    })).toBe('https://ajrealestate.com/newsletter/agosto')
  })

  it('sustituye todas las apariciones de {slug}', () => {
    expect(editionCanonicalUrl({
      tenantSlug: 't', editionSlug: 'agosto',
      template: 'https://a.com/{slug}/p/{slug}',
    })).toBe('https://a.com/agosto/p/agosto')
  })

  // Una plantilla invalida guardada por otra via no debe emitir una canonica
  // rota: se cae al host propio, que siempre es una URL real.
  it('una plantilla sin {slug} cae al host propio', () => {
    expect(editionCanonicalUrl({
      tenantSlug: 'aj-real-estate', editionSlug: 'agosto',
      template: 'https://ajrealestate.com/newsletter',
    })).toBe('https://news.itmano.com/aj-real-estate/agosto')
  })
})

describe('isExternalCanonical', () => {
  it('distingue configurado de no configurado', () => {
    expect(isExternalCanonical('https://a.com/{slug}')).toBe(true)
    expect(isExternalCanonical(null)).toBe(false)
    expect(isExternalCanonical('')).toBe(false)
    // Invalida = como si no hubiera: coherente con editionCanonicalUrl.
    expect(isExternalCanonical('https://a.com/sin-marcador')).toBe(false)
  })
})

describe('editionAlternates', () => {
  it('mapea idioma a URL de cada hermano', () => {
    expect(editionAlternates({
      tenantSlug: 'aj-real-estate',
      template: null,
      siblings: [{ slug: 'agosto', language: 'es' }, { slug: 'august', language: 'en' }],
    })).toEqual({
      es: 'https://news.itmano.com/aj-real-estate/agosto',
      en: 'https://news.itmano.com/aj-real-estate/august',
    })
  })

  // Mezclar hosts dentro del mismo grupo hreflang es una señal rota: si el
  // canonical vive en el dominio del cliente, los alternates tambien.
  it('con plantilla, los hermanos apuntan al dominio del cliente', () => {
    expect(editionAlternates({
      tenantSlug: 'aj-real-estate',
      template: 'https://ajrealestate.com/newsletter/{slug}',
      siblings: [{ slug: 'agosto', language: 'es' }, { slug: 'august', language: 'en' }],
    })).toEqual({
      es: 'https://ajrealestate.com/newsletter/agosto',
      en: 'https://ajrealestate.com/newsletter/august',
    })
  })

  it('un solo idioma no produce alternates', () => {
    expect(editionAlternates({
      tenantSlug: 't', template: null,
      siblings: [{ slug: 'agosto', language: 'es' }],
    })).toEqual({})
  })

  it('sin hermanos, objeto vacio', () => {
    expect(editionAlternates({ tenantSlug: 't', template: null, siblings: [] })).toEqual({})
  })
})
