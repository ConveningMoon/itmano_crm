import { describe, it, expect } from 'vitest'
import { pickByIds } from '@/lib/data-scope'

describe('pickByIds', () => {
  it('conserva sólo las claves pedidas', () => {
    expect(pickByIds({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({ a: 1, c: 3 })
  })
  it('ignora ids sin entrada y no inventa claves', () => {
    expect(pickByIds({ a: 1 }, ['x', 'a'])).toEqual({ a: 1 })
  })
  it('devuelve vacío sin ids', () => {
    expect(pickByIds({ a: 1 }, [])).toEqual({})
  })
  it('no hereda claves del prototipo', () => {
    expect(pickByIds({ a: 1 }, ['toString', '__proto__'])).toEqual({})
  })
})
