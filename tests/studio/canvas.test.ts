import { describe, it, expect } from 'vitest'
import { CANVAS, MARGIN, allowedZones, textBand, resolveZone } from '@/lib/studio/canvas'
import { getStudioFont, sanitize, wrap, fit, measure, ellipsize } from '@/lib/studio/typeset'

describe('canvas', () => {
  it('los tres formatos tienen las dimensiones de Instagram', () => {
    expect(CANVAS['1:1']).toEqual({ width: 1080, height: 1080 })
    expect(CANVAS['4:5']).toEqual({ width: 1080, height: 1350 })
    expect(CANVAS['9:16']).toEqual({ width: 1080, height: 1920 })
  })

  it('9:16 no admite banda lateral', () => {
    expect(allowedZones('9:16')).toEqual(['top', 'bottom'])
    expect(allowedZones('1:1')).toContain('left')
    expect(resolveZone('9:16', 'left')).toBe('top')
    expect(resolveZone('1:1', 'left')).toBe('left')
  })

  it('la banda cabe en el lienzo y respeta el margen', () => {
    for (const aspect of ['1:1', '4:5', '9:16'] as const) {
      for (const zone of allowedZones(aspect)) {
        const b = textBand(aspect, zone)
        expect(b.x).toBeGreaterThanOrEqual(MARGIN)
        expect(b.x + b.width).toBeLessThanOrEqual(CANVAS[aspect].width - MARGIN)
        expect(b.y + b.height).toBeLessThanOrEqual(CANVAS[aspect].height)
        expect(b.height).toBeGreaterThan(200)
      }
    }
  })

  it('9:16 deja aire para la interfaz de Instagram', () => {
    const top = textBand('9:16', 'top')
    expect(top.y).toBeGreaterThanOrEqual(200)
    const bottom = textBand('9:16', 'bottom')
    expect(CANVAS['9:16'].height - (bottom.y + bottom.height)).toBeGreaterThanOrEqual(200)
  })
})

describe('typeset', () => {
  it('quita los caracteres que la fuente no tiene', () => {
    const font = getStudioFont('title')
    expect(sanitize(font, 'Casa 🏡 abierta')).toBe('Casa abierta')
    expect(sanitize(font, 'Ñandú con tildes áéí')).toBe('Ñandú con tildes áéí')
  })

  it('parte el texto sin exceder el ancho', () => {
    const font = getStudioFont('body')
    const lines = wrap(font, 'Una dirección bastante larga en Virginia Beach', 40, 400)
    expect(lines.length).toBeGreaterThan(1)
    for (const l of lines) expect(measure(font, l, 40)).toBeLessThanOrEqual(400)
  })

  it('reduce el tamaño hasta caber, nunca por debajo del mínimo', () => {
    const font = getStudioFont('title')
    const long = 'Un titular deliberadamente larguísimo que no cabe en dos líneas de ninguna manera'
    const r = fit(font, long, { maxWidth: 500, maxLines: 2, start: 90, min: 40 })
    expect(r.size).toBeGreaterThanOrEqual(40)
    expect(r.size).toBeLessThan(90)
  })

  it('trunca con elipsis lo que no cabe en las líneas permitidas', () => {
    const font = getStudioFont('body')
    const long = 'Una zona con un nombre absurdamente largo que jamás cabría en una sola línea de la banda'
    const lines = ellipsize(font, long, 30, 400, 2)
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith('…')).toBe(true)
    for (const l of lines) expect(measure(font, l, 30)).toBeLessThanOrEqual(400)
  })
})
