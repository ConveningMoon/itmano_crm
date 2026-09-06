import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { FONT_CATALOG, FONT_FAMILIES, fontFaceCssFromUrls, fontFaceCssFromData } from '@/lib/studio/fonts/catalog'

describe('catalogo de fuentes', () => {
  it('todos los archivos declarados existen en public/studio/fonts', () => {
    for (const f of FONT_CATALOG) {
      expect(existsSync(join(process.cwd(), 'public', 'studio', 'fonts', f.file)), f.file).toBe(true)
    }
  })

  it('las familias no se repiten', () => {
    expect(new Set(FONT_FAMILIES).size).toBe(FONT_FAMILIES.length)
  })

  it('incluye las dos familias que ya usaba el Estudio', () => {
    expect(FONT_FAMILIES).toContain('Spectral')
    expect(FONT_FAMILIES).toContain('Marcellus')
  })

  it('la version por URL apunta a public', () => {
    const css = fontFaceCssFromUrls()
    expect(css).toContain('@font-face')
    expect(css).toContain('/studio/fonts/')
    expect(css).not.toContain('base64')
  })

  it('la version por data URI no sale a la red', () => {
    const css = fontFaceCssFromData(() => Buffer.from('abc'))
    expect(css).toContain('data:font/ttf;base64,')
    expect(css).not.toContain('/studio/fonts/')
  })

  it('declara familia, peso y estilo en cada cara', () => {
    const css = fontFaceCssFromData(() => Buffer.from('abc'))
    expect(css).toContain(`font-family:'${FONT_CATALOG[0].family}'`)
    expect(css).toContain(`font-weight:${FONT_CATALOG[0].weight}`)
    expect(css).toContain('font-style:normal')
  })
})
