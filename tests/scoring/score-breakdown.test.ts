import { describe, it, expect } from 'vitest'
import { buildScoreBreakdown } from '@/lib/scoring/score-breakdown'
import type { ScoreRule } from '@/lib/data/score-rules'

function rule(p: Partial<ScoreRule>): ScoreRule {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    category: p.category ?? 'fit',
    dimension: p.dimension ?? 'timeline',
    matchValue: p.matchValue ?? null,
    points: p.points ?? 0,
    decays: p.decays ?? false,
    isActive: p.isActive ?? true,
    sideEffect: p.sideEffect ?? null,
    label: p.label ?? null,
  }
}

const RULES: ScoreRule[] = [
  rule({ category: 'fit', dimension: 'timeline',   matchValue: 'under_3_months', points: 30, label: 'Compra en <3 meses' }),
  rule({ category: 'fit', dimension: 'budget_tier', matchValue: 'mid',           points: 12, label: 'Presupuesto medio' }),
  rule({ category: 'fit', dimension: 'financing',  matchValue: 'cash',           points: 25, label: 'Pago en efectivo', isActive: false }),
]

describe('buildScoreBreakdown', () => {
  it('matches each fit_profile dimension to its active rule (label + points)', () => {
    const b = buildScoreBreakdown({
      fitProfile: { timeline: 'under_3_months', budget_tier: 'mid' },
      fitScore: 42, engagementScore: 10, manualScore: 5, currentScore: 57,
      frozen: false, rules: RULES,
    })
    expect(b.fit.lines).toEqual([
      { dimension: 'timeline',    value: 'under_3_months', label: 'Compra en <3 meses', points: 30 },
      { dimension: 'budget_tier', value: 'mid',            label: 'Presupuesto medio',  points: 12 },
    ])
    expect(b.fit.total).toBe(42)
    expect(b.engagement.total).toBe(10)
    expect(b.manual.total).toBe(5)
    expect(b.total).toBe(57)
    expect(b.hasFitProfile).toBe(true)
  })

  it('omits a dimension whose value has no active rule', () => {
    const b = buildScoreBreakdown({
      fitProfile: { financing: 'cash', timeline: 'unknown_value' },
      fitScore: 0, engagementScore: 0, manualScore: 0, currentScore: 0,
      frozen: false, rules: RULES,
    })
    // financing:cash rule is inactive; timeline:unknown_value has no rule → both omitted
    expect(b.fit.lines).toEqual([])
    expect(b.hasFitProfile).toBe(true) // profile present, just no scorable lines
  })

  it('empty / null fit_profile → hasFitProfile false', () => {
    expect(buildScoreBreakdown({ fitProfile: null, fitScore: 0, engagementScore: 0, manualScore: 0, currentScore: 0, frozen: false, rules: RULES }).hasFitProfile).toBe(false)
    expect(buildScoreBreakdown({ fitProfile: {}, fitScore: 0, engagementScore: 0, manualScore: 0, currentScore: 0, frozen: false, rules: RULES }).hasFitProfile).toBe(false)
  })

  it('passes through the frozen flag', () => {
    const b = buildScoreBreakdown({ fitProfile: null, fitScore: 0, engagementScore: 0, manualScore: 0, currentScore: 80, frozen: true, rules: RULES })
    expect(b.frozen).toBe(true)
    expect(b.total).toBe(80)
  })
})
