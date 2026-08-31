import { describe, it, expect } from 'vitest'
import { buildImportPrompt } from '@/lib/newsletters/import-prompt'
import { NEWSLETTER_CATEGORIES } from '@/lib/newsletters/category'

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
