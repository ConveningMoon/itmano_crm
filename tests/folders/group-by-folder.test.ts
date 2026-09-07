import { describe, it, expect } from 'vitest'
import { groupByFolder, type Folder } from '../../src/lib/data/folders'

// El reparto en carpetas ocurre DESPUÉS del filtro de visibilidad, y ahí está el
// riesgo: si `groupByFolder` sacara un elemento de su lista de entrada, una
// carpeta podría mostrar una fuente que quien mira no debería ver. Estos casos
// fijan esa garantía y las dos reglas que hacen que la lista cuadre: nada se
// duplica y nada se pierde.

type Item = { id: string; name: string }

const folder = (id: string, itemIds: string[], name = id): Folder =>
  ({ id, name, position: 0, itemIds })

describe('groupByFolder', () => {
  it('reparte cada elemento en su carpeta y deja el resto suelto', () => {
    const items: Item[] = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]
    const { folders, loose } = groupByFolder(items, [folder('f1', ['a', 'c'])])

    expect(folders[0].items.map(i => i.id)).toEqual(['a', 'c'])
    expect(loose.map(i => i.id)).toEqual(['b'])
  })

  it('ignora los ids que no están en la lista visible', () => {
    // La carpeta guarda una fuente de otro agente: para este usuario no existe,
    // y la carpeta no puede hacerla aparecer.
    const items: Item[] = [{ id: 'a', name: 'A' }]
    const { folders, loose } = groupByFolder(items, [folder('f1', ['a', 'ajena'])])

    expect(folders[0].items.map(i => i.id)).toEqual(['a'])
    expect(loose).toEqual([])
  })

  it('una carpeta vacía se conserva, para poder verla y llenarla', () => {
    const { folders, loose } = groupByFolder([{ id: 'a', name: 'A' }], [folder('f1', [])])

    expect(folders).toHaveLength(1)
    expect(folders[0].items).toEqual([])
    expect(loose.map(i => i.id)).toEqual(['a'])
  })

  it('sin carpetas, todo queda suelto y en el mismo orden', () => {
    const items: Item[] = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]
    const { folders, loose } = groupByFolder(items, [])

    expect(folders).toEqual([])
    expect(loose).toEqual(items)
  })

  it('ningún elemento aparece dos veces ni desaparece', () => {
    const items: Item[] = ['a', 'b', 'c', 'd'].map(id => ({ id, name: id.toUpperCase() }))
    const { folders, loose } = groupByFolder(items, [
      folder('f1', ['a']),
      folder('f2', ['b', 'c']),
    ])

    const vistos = [...folders.flatMap(f => f.items), ...loose].map(i => i.id)
    expect(vistos.sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(new Set(vistos).size).toBe(vistos.length)
  })
})
