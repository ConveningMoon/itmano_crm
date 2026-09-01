import { describe, it, expect } from 'vitest'
import {
  NEWSLETTER_CATEGORIES, CATEGORY_LABELS, parseCategory,
} from '@/lib/newsletters/category'

describe('categorías de edición', () => {
  it('toda categoría tiene etiqueta en español', () => {
    for (const c of NEWSLETTER_CATEGORIES) {
      expect(CATEGORY_LABELS[c]).toBeTruthy()
      expect(CATEGORY_LABELS[c]).not.toBe(c)
    }
  })

  it('parseCategory acepta las válidas', () => {
    for (const c of NEWSLETTER_CATEGORIES) expect(parseCategory(c)).toBe(c)
  })

  it('parseCategory cae a informativo ante cualquier basura', () => {
    // La columna es NOT NULL con default: una fila nunca debería traer otra
    // cosa, pero el parse defensivo evita que una fila vieja rompa la lista.
    for (const malo of [null, undefined, '', 'otra', 42, {}]) {
      expect(parseCategory(malo)).toBe('informativo')
    }
  })
})
