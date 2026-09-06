import { describe, it, expect } from 'vitest'
import { genPublicId } from '@/lib/newsletters/slug'

describe('genPublicId', () => {
  it('cumple el CHECK de la base: ^chn_[a-z0-9]{12}$', () => {
    for (let i = 0; i < 200; i++) {
      expect(genPublicId()).toMatch(/^chn_[a-z0-9]{12}$/)
    }
  })

  it('no repite en 500 tiradas', () => {
    const vistos = new Set(Array.from({ length: 500 }, () => genPublicId()))
    expect(vistos.size).toBe(500)
  })
})
