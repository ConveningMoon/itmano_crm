import { describe, it, expect } from 'vitest'
import {
  slugifyTag, normalizeTagName, checkTagName, planTagFilter,
  isValidTagColor, tagChipStyle, TAG_COLORS, TAG_NAME_MAX, DEFAULT_TAG_COLOR,
} from '@/lib/leads/tags'

// El slug es el identificador ESTABLE de una etiqueta: viaja en la URL de /leads
// y en los enlaces que la gente guarda. Estas pruebas fijan que se calcule igual
// para los nombres reales del catálogo por defecto (con acentos, barras y
// espacios) y que el filtro sepa distinguir "no hay filtro" de "el slug de la
// URL ya no existe" — que son dos listas muy distintas.

describe('slugifyTag', () => {
  it('quita acentos y pasa a minúsculas con guiones', () => {
    expect(slugifyTag('Pre-aprobación en trámite')).toBe('pre-aprobacion-en-tramite')
    expect(slugifyTag('Contactado sin respuesta')).toBe('contactado-sin-respuesta')
  })

  it('colapsa separadores y no deja guiones en los extremos', () => {
    expect(slugifyTag('Vendedor / listing')).toBe('vendedor-listing')
    expect(slugifyTag('  Cash   buyer  ')).toBe('cash-buyer')
    expect(slugifyTag('¡Renta!')).toBe('renta')
  })

  it('un nombre sin letras ni números produce slug vacío', () => {
    // No es un caso hipotético: la base tiene un CHECK sobre el formato del
    // slug, así que esto es lo que checkTagName tiene que atajar antes.
    expect(slugifyTag('///')).toBe('')
    expect(slugifyTag('   ')).toBe('')
  })

  it('recorta largo sin dejar el guion final', () => {
    const slug = slugifyTag('a'.repeat(58) + ' bc')
    expect(slug.length).toBeLessThanOrEqual(60)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('normalizeTagName', () => {
  it('recorta y colapsa espacios internos', () => {
    expect(normalizeTagName('  Cash   buyer ')).toBe('Cash buyer')
  })
})

describe('checkTagName', () => {
  it('acepta los nombres del catálogo por defecto', () => {
    for (const name of ['Contactado sin respuesta', 'Cash buyer', 'Vendedor / listing']) {
      expect(checkTagName(name).ok).toBe(true)
    }
  })

  it('rechaza vacío, sólo espacios y sólo símbolos', () => {
    expect(checkTagName('').ok).toBe(false)
    expect(checkTagName('   ').ok).toBe(false)
    expect(checkTagName('///').ok).toBe(false)
  })

  it('rechaza pasarse del largo que admite la columna', () => {
    expect(checkTagName('x'.repeat(TAG_NAME_MAX)).ok).toBe(true)
    expect(checkTagName('x'.repeat(TAG_NAME_MAX + 1)).ok).toBe(false)
  })

  it('todo rechazo trae un mensaje para mostrar', () => {
    const res = checkTagName('')
    expect(res.error).toBeTruthy()
  })
})

describe('planTagFilter', () => {
  const TAGS = [
    { id: 'tag-1', slug: 'contactado-sin-respuesta' },
    { id: 'tag-2', slug: 'pre-aprobado' },
  ]

  it('"all" no filtra y no es imposible', () => {
    expect(planTagFilter('all', TAGS)).toEqual({ tagId: null, impossible: false })
  })

  it('resuelve el slug al id del catálogo', () => {
    expect(planTagFilter('pre-aprobado', TAGS)).toEqual({ tagId: 'tag-2', impossible: false })
  })

  it('un slug que ya no existe es imposible, no "sin filtro"', () => {
    // La diferencia importa: devolver { tagId: null } haría que un enlace a una
    // etiqueta borrada mostrara la lista COMPLETA, como si el filtro no
    // estuviera puesto. `impossible` corta la consulta y devuelve vacío.
    expect(planTagFilter('etiqueta-borrada', TAGS)).toEqual({ tagId: null, impossible: true })
  })

  it('con catálogo vacío, cualquier slug es imposible', () => {
    expect(planTagFilter('pre-aprobado', []).impossible).toBe(true)
  })
})

describe('Paleta', () => {
  it('el color por defecto es uno de la paleta', () => {
    expect(isValidTagColor(DEFAULT_TAG_COLOR)).toBe(true)
  })

  it('rechaza un hex fuera de la paleta', () => {
    expect(isValidTagColor('#FF00FF')).toBe(false)
  })

  it('no distingue mayúsculas en el hex', () => {
    expect(isValidTagColor(TAG_COLORS[0].value.toLowerCase())).toBe(true)
  })

  it('el chip deriva fondo y borde del color, sin guardarlos aparte', () => {
    const style = tagChipStyle('#C97B6B')
    expect(style.color).toBe('#C97B6B')
    expect(style.background).toContain('#C97B6B')
    expect(style.border).toContain('#C97B6B')
  })
})
