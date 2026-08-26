import { describe, it, expect } from 'vitest'
import { CANVAS, MARGIN, allowedZones, textBand, resolveZone } from '@/lib/studio/canvas'

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

describe('formato apaisado 16:9', () => {
  it('tiene lienzo de 1920x1080', () => {
    expect(CANVAS['16:9']).toEqual({ width: 1920, height: 1080 })
  })

  it('admite las mismas zonas que los formatos anchos', () => {
    expect(allowedZones('16:9')).toEqual(['top', 'bottom', 'left'])
  })

  it('la banda de texto cabe dentro del lienzo', () => {
    for (const zona of allowedZones('16:9')) {
      const b = textBand('16:9', zona)
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.y).toBeGreaterThanOrEqual(0)
      expect(b.x + b.width).toBeLessThanOrEqual(CANVAS['16:9'].width)
      expect(b.y + b.height).toBeLessThanOrEqual(CANVAS['16:9'].height)
    }
  })

  it('resolveZone respeta una zona admitida', () => {
    expect(resolveZone('16:9', 'bottom')).toBe('bottom')
  })

  it('no altera la geometria de los formatos existentes', () => {
    expect(CANVAS['1:1']).toEqual({ width: 1080, height: 1080 })
    expect(CANVAS['4:5']).toEqual({ width: 1080, height: 1350 })
    expect(CANVAS['9:16']).toEqual({ width: 1080, height: 1920 })
    expect(allowedZones('9:16')).toEqual(['top', 'bottom'])
  })
})
