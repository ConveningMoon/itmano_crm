import { describe, it, expect } from 'vitest'
import { toList, stripMarkup, cleanProse } from '@/lib/properties/ai-text'

// La extracción de propiedades con IA declara las características como `array`
// de strings, y el modelo ha devuelto otra cosa dos veces seguidas: primero un
// string (que salía como lista vacía, sin error) y después ese string con cada
// elemento envuelto en `<value>`, que llegaba con las etiquetas al formulario.
// Estos casos son los que se vieron en producción, no supuestos.

const XML_REAL = [
  '<value>Casa adosada de dos niveles</value>',
  '<value>Cocina renovada con electrodomésticos nuevos</value>',
  '<value>Techo nuevo (2024) y calentador de agua nuevo (2025)</value>',
].join('\n')

describe('toList: formas en que el modelo devuelve una lista', () => {
  it('deja intacto un array de strings', () => {
    expect(toList(['Patio cercado', 'Cocina renovada'])).toEqual(['Patio cercado', 'Cocina renovada'])
  })

  it('desenvuelve los elementos serializados como XML', () => {
    expect(toList(XML_REAL)).toEqual([
      'Casa adosada de dos niveles',
      'Cocina renovada con electrodomésticos nuevos',
      'Techo nuevo (2024) y calentador de agua nuevo (2025)',
    ])
  })

  it('separa los etiquetados aunque vengan en una sola línea', () => {
    expect(toList('<value>Uno</value><value>Dos</value>')).toEqual(['Uno', 'Dos'])
  })

  it('acepta cualquier etiqueta, no sólo <value>', () => {
    expect(toList('<item>Uno</item>\n<item>Dos</item>')).toEqual(['Uno', 'Dos'])
  })

  it('corta por líneas cuando no hay etiquetas y quita la viñeta', () => {
    expect(toList('- Uno\n• Dos\n\n  Tres  ')).toEqual(['Uno', 'Dos', 'Tres'])
  })

  it('acepta un array de objetos', () => {
    expect(toList([{ text: 'Uno' }, { value: 'Dos' }, { label: 'Tres' }])).toEqual(['Uno', 'Dos', 'Tres'])
  })

  it('devuelve lista vacía para lo que no es lista', () => {
    expect(toList(null)).toEqual([])
    expect(toList(42)).toEqual([])
    expect(toList([{ otra: 'cosa' }])).toEqual([])
  })

  it('no deja entrar etiquetas sueltas dentro de un elemento', () => {
    expect(toList(['<b>Cocina</b> renovada'])).toEqual(['Cocina renovada'])
  })
})

describe('stripMarkup', () => {
  it('decodifica las entidades del mismo formato', () => {
    expect(stripMarkup('<value>Cocina &amp; despensa</value>')).toBe('Cocina & despensa')
  })

  it('no toca un texto que ya es llano', () => {
    expect(stripMarkup('Techo nuevo (2024)')).toBe('Techo nuevo (2024)')
  })
})

describe('cleanProse', () => {
  it('limpia la descripción sólo si trae marcado', () => {
    const llana = 'Bienvenido a esta casa adosada de dos niveles.'
    expect(cleanProse(llana)).toBe(llana)
    expect(cleanProse('<p>Bienvenido a esta casa.</p>')).toBe('Bienvenido a esta casa.')
  })
})
