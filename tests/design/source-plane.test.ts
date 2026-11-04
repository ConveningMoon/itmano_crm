import { describe, expect, it } from 'vitest'
import { overallConversion, planeCuts, planePoints, samePoint, topThree } from '@/lib/dashboard/source-plane'

const row = (id: string, leads: number, score: number | null, name = id) => ({ id, name, leads, score })

describe('planePoints', () => {
  it('omite fuentes sin leads', () => {
    const pts = planePoints([row('a', 0, 50), row('b', 3, 60)])
    expect(pts.map(p => p.id)).toEqual(['b'])
  })
  it('omite fuentes sin score, aunque tengan leads', () => {
    expect(planePoints([row('a', 5, null)])).toEqual([])
  })
  it('conserva score 0: es un dato, no una ausencia', () => {
    expect(planePoints([row('a', 5, 0)]).map(p => p.id)).toEqual(['a'])
  })
})

describe('topThree', () => {
  it('Top 3 por leads × score, con desempate estable por nombre', () => {
    const pts = planePoints([
      row('z', 10, 10, 'Zeta'), row('a', 10, 10, 'Alfa'), // empate en 100
      row('m', 20, 20, 'Mu'),                              // 400
      row('x', 1, 1, 'Xi'),                                // 1
    ])
    expect(topThree(pts)).toEqual(['m', 'a', 'z'])
  })
  it('con menos de 3 fuentes devuelve las que haya', () => {
    expect(topThree(planePoints([row('a', 2, 50)]))).toEqual(['a'])
    expect(topThree([])).toEqual([])
  })
})

describe('planeCuts', () => {
  it('cortes en el promedio', () => {
    expect(planeCuts(planePoints([row('a', 10, 80), row('b', 20, 40)]))).toEqual({ leads: 15, score: 60 })
  })
  it('sin puntos no divide entre cero', () => {
    expect(planeCuts([])).toEqual({ leads: 0, score: 0 })
  })
})

describe('samePoint', () => {
  it('agrupa las fuentes de una misma coordenada', () => {
    const pts = planePoints([row('a', 5, 50), row('b', 5, 50), row('c', 5, 51)])
    expect(samePoint(pts, 'a').sort()).toEqual(['a', 'b'])
    expect(samePoint(pts, 'c')).toEqual(['c'])
  })
  it('un id desconocido no enciende nada', () => {
    expect(samePoint(planePoints([row('a', 5, 50)]), 'nope')).toEqual([])
  })
})

describe('overallConversion', () => {
  it('suma envíos y vistas sólo de fuentes con vistas', () => {
    expect(overallConversion([
      { views: 100, submissions: 5 },
      { views: 0, submissions: 50 },
    ])).toBe(5)
  })
  it('sin vistas da 0', () => {
    expect(overallConversion([{ views: 0, submissions: 9 }])).toBe(0)
    expect(overallConversion([])).toBe(0)
  })
})
