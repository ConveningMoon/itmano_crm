import { describe, it, expect } from 'vitest'
import { opportunitiesFor } from '@/lib/scoring/opportunities'
import { buildScoreBreakdown } from '@/lib/scoring/score-breakdown'
import type { ScoreRule } from '@/lib/data/score-rules'

const CONTINGENCY_RULES: ScoreRule[] = [
  { id: '1', dimension: 'contingency', matchValue: 'con_contingencia', points: -10,
    category: 'fit', isActive: true, label: 'Debe vender otra propiedad primero' } as ScoreRule,
  { id: '2', dimension: 'financing', matchValue: 'cash', points: 25,
    category: 'fit', isActive: true, label: 'Paga en efectivo' } as ScoreRule,
]

describe('opportunitiesFor — el comprador que además vende', () => {
  it('detecta la contingencia como listing potencial', () => {
    const [o] = opportunitiesFor({ contingency: 'con_contingencia' })
    expect(o.key).toBe('listing_potencial')
    expect(o.label).toMatch(/vender/i)
  })

  it('sin contingencia no hay oportunidad', () => {
    expect(opportunitiesFor({ contingency: 'sin_contingencia' })).toEqual([])
  })

  it('un fit sin la dimensión no inventa nada', () => {
    expect(opportunitiesFor({ financing: 'cash' })).toEqual([])
  })

  it('aguanta fit_profile nulo o basura', () => {
    expect(opportunitiesFor(null)).toEqual([])
    expect(opportunitiesFor(undefined)).toEqual([])
    // Un valor no-string en la dimensión no debe reventar ni matchear.
    expect(opportunitiesFor({ contingency: 42 } as unknown as Record<string, unknown>)).toEqual([])
  })
})

describe('La oportunidad NO toca el score', () => {
  it('la contingencia sigue restando y nada la compensa', () => {
    // El punto del diseño: reconocer la segunda operación no puede maquillar el
    // riesgo de la primera. Son dos respuestas a dos preguntas distintas.
    const fitProfile = { financing: 'cash', contingency: 'con_contingencia' }
    const b = buildScoreBreakdown({
      fitProfile, fitScore: 15, engagementScore: 0, manualScore: 0,
      currentScore: 15, rules: CONTINGENCY_RULES,
    })

    expect(b.total).toBe(15)                       // 25 - 10, sin bonus
    expect(opportunitiesFor(fitProfile)).toHaveLength(1)
    expect(b.fit.lines.some(l => l.points < 0)).toBe(true)
  })
})
