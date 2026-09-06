import { describe, it, expect } from 'vitest'
import { buildImportPrompt } from '@/lib/newsletters/import-prompt'
import { NEWSLETTER_CATEGORIES, parseCategory } from '@/lib/newsletters/category'

describe('el prompt de importación tras retirar las series', () => {
  const prompt = buildImportPrompt()

  it('no menciona series ni channelId', () => {
    expect(prompt).not.toMatch(/serie/i)
    expect(prompt).not.toContain('channelId')
  })

  it('documenta la categoría y sus cuatro valores', () => {
    expect(prompt).toContain('"category"')
    for (const c of NEWSLETTER_CATEGORIES) expect(prompt).toContain(c)
  })
})

// createEditionFromJsonImpl (actions.ts) resuelve la categoría efectiva con
// `parseCategory(d.category, parsed.data.category)`: la del JSON parseado y la
// del selector del modal como fallback. Esta suite fija esa precedencia sobre
// la función pura que la implementa, sin levantar el server action completo
// (que necesita guard(), Supabase admin y contexto de tenant).
describe('precedencia de categoría al importar', () => {
  const delSelector = 'analisis' as const

  it('gana la categoría del JSON cuando es una de las cuatro válidas', () => {
    expect(parseCategory('educativo', delSelector)).toBe('educativo')
  })

  it('sin categoría en el JSON, manda la del selector del modal', () => {
    expect(parseCategory(undefined, delSelector)).toBe(delSelector)
  })

  it('una categoría inválida en el JSON no tumba la importación: cae al selector', () => {
    expect(parseCategory('no-es-una-categoria', delSelector)).toBe(delSelector)
    expect(parseCategory(42, delSelector)).toBe(delSelector)
    expect(parseCategory(null, delSelector)).toBe(delSelector)
  })
})
