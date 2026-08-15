import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PALETTE, PALETTE_PRESETS, PALETTE_ROLES,
  contrastRatio, readableOn, rgba, tenantPreset, paletteRow, samePalette,
} from '@/lib/studio/palettes'

describe('readableOn', () => {
  it('respeta el rol pedido cuando se lee', () => {
    // Crema sobre navy: es el par que el diseño quiere y no se toca.
    expect(readableOn('#1B2A41', '#FBF6EE', '#000000')).toBe('#FBF6EE')
  })

  it('degrada al alternativo cuando el rol pedido no se separa del fondo', () => {
    // El caso REAL que rompía "Foto completa": la paleta por defecto usa el
    // mismo hex para el primario y para el color de texto, así que el texto
    // caía invisible sobre su propio degradado.
    expect(DEFAULT_PALETTE.brand).toBe(DEFAULT_PALETTE.ink)
    expect(readableOn(DEFAULT_PALETTE.brand, DEFAULT_PALETTE.ink, DEFAULT_PALETTE.surface))
      .toBe(DEFAULT_PALETTE.surface)
  })

  it('cae a blanco o negro cuando ningún rol sirve', () => {
    expect(readableOn('#1B2A41', '#1B2A41', '#22304A')).toBe('#FFFFFF')
    expect(readableOn('#FBF6EE', '#FBF6EE', '#F2EDE4')).toBe('#000000')
  })

  it('ningún preset deja texto ilegible sobre su color primario', () => {
    for (const preset of [tenantPreset('#00BD1F'), ...PALETTE_PRESETS]) {
      const color = readableOn(preset.palette.brand, preset.palette.surface, preset.palette.ink)
      expect(contrastRatio(preset.palette.brand, color)).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('contrastRatio', () => {
  it('va de 1 (idénticos) a 21 (negro y blanco)', () => {
    expect(contrastRatio('#1B2A41', '#1B2A41')).toBeCloseTo(1, 5)
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
  })
})

describe('rgba', () => {
  it('conserva el color y aplica el alfa', () => {
    expect(rgba('#1B2A41', 0.5)).toBe('rgba(27,42,65,0.5)')
  })

  it('un hex inválido cae a negro en vez de romper el degradado', () => {
    expect(rgba('no-es-un-color', 0.8)).toBe('rgba(0,0,0,0.8)')
  })
})

describe('paleta por roles', () => {
  it('los cuatro roles tienen etiqueta y todos existen en la paleta', () => {
    expect(PALETTE_ROLES).toHaveLength(4)
    for (const role of PALETTE_ROLES) {
      expect(DEFAULT_PALETTE[role.key]).toMatch(/^#[0-9A-F]{6}$/i)
      expect(role.label.length).toBeGreaterThan(0)
    }
  })

  it('paletteRow entrega los cuatro hex en orden de rol', () => {
    expect(paletteRow(DEFAULT_PALETTE)).toEqual([
      DEFAULT_PALETTE.brand, DEFAULT_PALETTE.surface, DEFAULT_PALETTE.ink, DEFAULT_PALETTE.logo,
    ])
  })

  it('samePalette distingue un cambio en cualquiera de los cuatro', () => {
    expect(samePalette(DEFAULT_PALETTE, { ...DEFAULT_PALETTE })).toBe(true)
    expect(samePalette(DEFAULT_PALETTE, { ...DEFAULT_PALETTE, logo: '#C9A96E' })).toBe(false)
  })
})
