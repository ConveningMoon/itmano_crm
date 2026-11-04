import { describe, expect, it } from 'vitest'
import { colorsByKey, foldCategories, GOLD_RAMP } from '@/lib/charts/palette'

const row = (name: string, value: number) => ({ name, value })

describe('foldCategories', () => {
  it('agrupa desde la quinta en Otras sin perder conteos', () => {
    const r = foldCategories([row('a', 9), row('b', 8), row('c', 7), row('d', 6), row('e', 5), row('f', 4)])
    expect(r.map(x => x.name)).toEqual(['a', 'b', 'c', 'd', 'Otras'])
    expect(r[4].value).toBe(9)
  })

  it('con 5 o menos no agrupa', () => {
    const r = foldCategories([row('a', 1), row('b', 2), row('c', 3), row('d', 4), row('e', 5)])
    expect(r.map(x => x.name)).not.toContain('Otras')
    expect(r).toHaveLength(5)
  })

  it('ordena de mayor a menor', () => {
    expect(foldCategories([row('a', 1), row('b', 3)]).map(x => x.name)).toEqual(['b', 'a'])
  })

  it('sin categorías devuelve vacío', () => {
    expect(foldCategories([])).toEqual([])
  })
})

describe('colorsByKey', () => {
  it('el color sigue a la categoría, no a su rango', () => {
    expect(colorsByKey(['a', 'b', 'c']).b).toBe(GOLD_RAMP[1])
  })

  it('más claves que tonos repite el último', () => {
    expect(colorsByKey(['a', 'b', 'c', 'd', 'e', 'f']).f).toBe(GOLD_RAMP[4])
  })
})
