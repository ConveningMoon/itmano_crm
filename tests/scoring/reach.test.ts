import { describe, it, expect } from 'vitest'
import { computeScoreReach, type ReachRule } from '@/lib/scoring/reach'

// Reglas que replican la configuración global sembrada por la migración 029
// (solo lo necesario para el alcance: fit por dimensión + positivos acumulativos).
const GLOBALES: ReachRule[] = [
  // fit — comprador
  { category: 'fit', dimension: 'timeline',     points: 30, isActive: true },
  { category: 'fit', dimension: 'timeline',     points: 15, isActive: true },
  { category: 'fit', dimension: 'timeline',     points:  5, isActive: true },
  { category: 'fit', dimension: 'timeline',     points:  0, isActive: true },
  { category: 'fit', dimension: 'financing',    points: 25, isActive: true },
  { category: 'fit', dimension: 'financing',    points: 20, isActive: true },
  { category: 'fit', dimension: 'financing',    points: 10, isActive: true },
  { category: 'fit', dimension: 'financing',    points:  0, isActive: true },
  { category: 'fit', dimension: 'budget_tier',  points: 20, isActive: true },
  { category: 'fit', dimension: 'budget_tier',  points: 12, isActive: true },
  { category: 'fit', dimension: 'budget_tier',  points:  5, isActive: true },
  { category: 'fit', dimension: 'agent_status', points:  5, isActive: true },
  { category: 'fit', dimension: 'agent_status', points: -15, isActive: true },
  // fit — vendedor
  { category: 'fit', dimension: 'sell_motivation', points: 35, isActive: true },
  { category: 'fit', dimension: 'sell_motivation', points: 15, isActive: true },
  { category: 'fit', dimension: 'sell_motivation', points:  0, isActive: true },
  { category: 'fit', dimension: 'listing_status',  points:  5, isActive: true },
  { category: 'fit', dimension: 'listing_status',  points: -15, isActive: true },
  // engagement
  { category: 'engagement', dimension: 'event_submission',    points:  20, isActive: true },
  { category: 'engagement', dimension: 'email_replied',       points:  20, isActive: true },
  { category: 'engagement', dimension: 'contact_us_question', points:  20, isActive: true },
  { category: 'engagement', dimension: 'third_lm',            points:  12, isActive: true },
  { category: 'engagement', dimension: 'email_clicked',       points:  10, isActive: true },
  { category: 'engagement', dimension: 'form_baseline',       points:  10, isActive: true },
  { category: 'engagement', dimension: 'second_lm',           points:   8, isActive: true },
  { category: 'engagement', dimension: 'email_unsubscribed',  points: -40, isActive: true },
  { category: 'engagement', dimension: 'email_spam_complaint',points:-100, isActive: true },
  // manual
  { category: 'manual', dimension: 'visit_attended',       points:  25, isActive: true },
  { category: 'manual', dimension: 'proposal_sent',        points:  20, isActive: true },
  { category: 'manual', dimension: 'appointment_scheduled',points:  15, isActive: true },
  { category: 'manual', dimension: 'manual_disqualify',    points:   0, isActive: true },
  { category: 'manual', dimension: 'no_show_no_answer',    points: -10, isActive: true },
]

describe('computeScoreReach — configuración global', () => {
  const r = computeScoreReach(GLOBALES)

  it('el fit del comprador es el mejor bucket de cada una de sus dimensiones', () => {
    // 30 timeline + 25 financing + 20 budget + 5 agent_status
    expect(r.fitBuyer).toBe(80)
  })

  it('el fit del vendedor usa SUS dimensiones, no la suma de todas', () => {
    // 35 sell_motivation + 30 timeline + 5 listing_status
    expect(r.fitSeller).toBe(70)
  })

  it('el mejor fit es el mayor de los dos caminos, no su suma', () => {
    expect(r.bestFit).toBe(80)
    expect(r.bestFit).toBeLessThan(r.fitBuyer + r.fitSeller)
  })

  it('los acumulativos suman solo los positivos', () => {
    expect(r.engagement).toBe(100) // 20+20+20+12+10+10+8 — sin baja ni spam
    expect(r.manual).toBe(60)      // 25+20+15 — sin no-show ni descalificación
  })

  it('el alcance real corta en 100 aunque el techo teórico sea mayor', () => {
    expect(r.ceiling).toBe(240)
    expect(r.reachable).toBe(100)
  })

  it('avisa de saturación cuando el techo desborda el tope', () => {
    expect(r.warnings.map(w => w.code)).toContain('saturated')
  })

  it('no avisa de bandas inalcanzables con la configuración recomendada', () => {
    expect(r.warnings.map(w => w.code)).not.toContain('hot_unreachable')
    expect(r.warnings.map(w => w.code)).not.toContain('warm_unreachable')
  })
})

describe('computeScoreReach — configuraciones que rompen las bandas', () => {
  it('avisa cuando Caliente queda fuera de alcance', () => {
    // Alcance 45: pasa Tibio (35) pero nunca llega a Caliente (60).
    const bajos: ReachRule[] = [
      { category: 'fit', dimension: 'timeline',  points: 20, isActive: true },
      { category: 'fit', dimension: 'financing', points: 15, isActive: true },
      { category: 'engagement', dimension: 'email_clicked', points: 10, isActive: true },
    ]
    const r = computeScoreReach(bajos)
    expect(r.reachable).toBe(45)
    expect(r.warnings.map(w => w.code)).toContain('hot_unreachable')
    expect(r.warnings.map(w => w.code)).not.toContain('warm_unreachable')
  })

  it('avisa del caso peor cuando ni Tibio se alcanza', () => {
    const r = computeScoreReach([
      { category: 'fit', dimension: 'timeline', points: 10, isActive: true },
    ])
    expect(r.reachable).toBe(10)
    expect(r.warnings.map(w => w.code)).toContain('warm_unreachable')
    // El aviso grave reemplaza al leve, no se duplican.
    expect(r.warnings.map(w => w.code)).not.toContain('hot_unreachable')
  })

  it('una regla desactivada no cuenta para el alcance', () => {
    const r = computeScoreReach([
      { category: 'fit', dimension: 'timeline', points: 30, isActive: false },
      { category: 'fit', dimension: 'timeline', points:  5, isActive: true },
    ])
    expect(r.fitBuyer).toBe(5)
  })

  it('una dimensión donde todo resta aporta 0, no negativo', () => {
    // El lead simplemente no declara ese bucket: no puede restarle al máximo.
    const r = computeScoreReach([
      { category: 'fit', dimension: 'agent_status', points: -15, isActive: true },
    ])
    expect(r.fitBuyer).toBe(0)
    expect(r.reachable).toBe(0)
  })

  it('sin reglas el alcance es 0 y avisa', () => {
    const r = computeScoreReach([])
    expect(r.reachable).toBe(0)
    expect(r.warnings.map(w => w.code)).toContain('warm_unreachable')
  })
})
