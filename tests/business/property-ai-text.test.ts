import { describe, it, expect } from 'vitest'
import { toList, stripMarkup, cleanProse, splitEnumeration } from '@/lib/properties/ai-text'

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

// El modelo junta las enumeraciones de la ficha en un solo elemento y el
// formulario acaba mostrando una línea con comas donde deberían ir tres. Se
// separan, pero sólo cuando todo apunta a una enumeración: partir por comas a
// ciegas rompe cualquier característica que lleve una coma legítima, y eso se
// publica roto.
describe('splitEnumeration: comas que separan frente a comas que no', () => {
  it('separa una enumeración de la ficha', () => {
    expect(splitEnumeration('Lavavajillas, microondas, estufa eléctrica, refrigerador'))
      .toEqual(['Lavavajillas', 'microondas', 'estufa eléctrica', 'refrigerador'])
  })

  it('NO parte una frase con un conector', () => {
    const frase = 'Cocina renovada, incluyendo nevera nueva, estufa y lavavajillas'
    expect(splitEnumeration(frase)).toEqual([frase])
  })

  it('NO parte una frase con fragmentos largos', () => {
    const frase = 'Techo de tejas asfálticas reemplazado en 2024, calentador de agua nuevo instalado en 2025, patio de concreto'
    expect(splitEnumeration(frase)).toEqual([frase])
  })

  it('NO parte con una sola coma: no hay señal suficiente', () => {
    const frase = 'Techo nuevo, instalado en 2024'
    expect(splitEnumeration(frase)).toEqual([frase])
  })

  it('deja intacto lo que no tiene comas', () => {
    expect(splitEnumeration('Patio cercado')).toEqual(['Patio cercado'])
  })

  it('toList aplica la separación a cada elemento', () => {
    expect(toList(['Cul-de-sac', 'Lavavajillas, microondas, refrigerador']))
      .toEqual(['Cul-de-sac', 'Lavavajillas', 'microondas', 'refrigerador'])
  })

  it('toList separa también lo que venía en una etiqueta', () => {
    expect(toList('<value>Lavavajillas, microondas, refrigerador</value>'))
      .toEqual(['Lavavajillas', 'microondas', 'refrigerador'])
  })
})

// Desde la quinta ronda el campo se pide como TEXTO con una característica por
// línea, no como array: es el formato del formulario y no tiene forma que
// romper. Estos casos cubren lo que llega por esa vía.
describe('toList: el formato que ahora se pide — una por línea', () => {
  it('parte un texto de varias líneas', () => {
    const texto = [
      'Casa adosada de dos niveles',
      'Cocina renovada con electrodomésticos nuevos',
      'Techo nuevo (2024)',
    ].join('\n')
    expect(toList(texto)).toEqual([
      'Casa adosada de dos niveles',
      'Cocina renovada con electrodomésticos nuevos',
      'Techo nuevo (2024)',
    ])
  })

  it('quita la numeración que el modelo añade de su cuenta', () => {
    expect(toList('1. Uno\n2) Dos\n3. Tres')).toEqual(['Uno', 'Dos', 'Tres'])
  })

  it('NO se come un número que es parte de la característica', () => {
    expect(toList('2 espacios de estacionamiento\n200 amperios de servicio eléctrico'))
      .toEqual(['2 espacios de estacionamiento', '200 amperios de servicio eléctrico'])
  })

  it('ignora las líneas en blanco', () => {
    expect(toList('Uno\n\n\nDos\n   \nTres')).toEqual(['Uno', 'Dos', 'Tres'])
  })

  it('una sola línea sigue siendo una lista de uno', () => {
    expect(toList('Ubicación en cul-de-sac')).toEqual(['Ubicación en cul-de-sac'])
  })
})
