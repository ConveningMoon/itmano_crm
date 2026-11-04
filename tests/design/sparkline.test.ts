import { describe, expect, it } from 'vitest'
import { sparklinePoints } from '@/components/charts/sparkline'

describe('sparklinePoints', () => {
  it('con un solo valor o todos iguales no divide entre cero', () => {
    for (const values of [[5], [3, 3, 3], [0, 0], []]) {
      const pts = sparklinePoints(values, 62, 20)
      expect(pts).toHaveLength(values.length)
      for (const [x, y] of pts) {
        expect(Number.isFinite(x)).toBe(true)
        expect(Number.isFinite(y)).toBe(true)
      }
    }
  })

  it('mantiene los puntos dentro del alto y del ancho', () => {
    const pts = sparklinePoints([0, 10, 4, 25, 7], 62, 20)
    for (const [x, y] of pts) {
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(20)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(62)
    }
  })

  it('el valor mayor queda arriba y el menor abajo', () => {
    const pts = sparklinePoints([1, 9], 62, 20)
    expect(pts[1][1]).toBeLessThan(pts[0][1])
  })
})
