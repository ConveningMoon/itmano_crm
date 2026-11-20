import { describe, it, expect } from 'vitest'
import {
  planAutoCalibration, recalibrate, MIN_CLOSES_FOR_EVIDENCE,
  AUTO_CALIBRATION_COOLDOWN_DAYS, type CalibrationRule, type FitEvidence,
} from '@/lib/scoring/calibration'
import { assessScoringHealth, parseScoringHealth } from '@/lib/scoring/health'
import { groupOf } from '@/lib/scoring/model-catalog'

const fit = (dimension: string, matchValue: string, points: number): CalibrationRule =>
  ({ category: 'fit', dimension, matchValue, points, isActive: true })

// Reglas de fit de compra como están en la base.
const GLOBAL: CalibrationRule[] = [
  fit('timeline', 'under_3_months', 30),
  fit('timeline', '3_6_months', 15),
  fit('timeline', '6_12_months', 5),
  fit('timeline', 'over_12_explorando', 0),
  fit('financing', 'cash', 25),
  fit('financing', 'preapproved', 20),
  fit('financing', 'in_process', 10),
  fit('financing', 'not_started', 0),
  fit('budget_tier', 'premium', 20),
  fit('budget_tier', 'mid', 12),
  fit('budget_tier', 'entry', 5),
  fit('budget_tier', 'undefined', 0),
  fit('agent_status', 'sin_agente', 5),
  fit('agent_status', 'con_agente', -15),
  fit('contingency', 'sin_contingencia', 5),
  fit('contingency', 'con_contingencia', -10),
  fit('geo_fit', 'zona_principal', 5),
  fit('geo_fit', 'zona_secundaria', 0),
  fit('geo_fit', 'fuera_de_zona', -10),
]

function evidencia(spreads: Record<string, number | null>, closedWithFit = MIN_CLOSES_FOR_EVIDENCE): FitEvidence {
  return {
    withFit: 200,
    closedWithFit,
    enough: closedWithFit >= MIN_CLOSES_FOR_EVIDENCE,
    dimensions: Object.entries(spreads).map(([dimension, spread]) => ({ dimension, buckets: [], spread })),
  }
}

const NOW = new Date('2026-11-18T00:00:00Z')

describe('planAutoCalibration', () => {
  it('sin cierres suficientes no toca nada', () => {
    const plan = planAutoCalibration({
      effective: GLOBAL, global: GLOBAL, now: NOW, lastCalibrationAt: null,
      evidence: evidencia({ financing: 40, timeline: 5 }, MIN_CLOSES_FOR_EVIDENCE - 1),
    })
    expect(plan).toEqual({ apply: false, reason: 'sin_evidencia' })
  })

  it('respeta la espera entre calibraciones', () => {
    const plan = planAutoCalibration({
      effective: GLOBAL, global: GLOBAL, now: NOW,
      lastCalibrationAt: new Date(NOW.getTime() - (AUTO_CALIBRATION_COOLDOWN_DAYS - 1) * 86_400_000),
      evidence: evidencia({ financing: 40, timeline: 5 }),
    })
    expect(plan).toEqual({ apply: false, reason: 'reciente' })
  })

  it('sube al factor que separa claramente más', () => {
    const plan = planAutoCalibration({
      effective: GLOBAL, global: GLOBAL, now: NOW, lastCalibrationAt: null,
      evidence: evidencia({ timeline: 30, financing: 40, budget_tier: 10 }),
    })
    expect(plan.apply).toBe(true)
    if (!plan.apply) return
    expect(plan.before.slice(0, 3)).toEqual(['timeline', 'financing', 'budget_tier'])
    expect(plan.after.slice(0, 3)).toEqual(['financing', 'timeline', 'budget_tier'])
    // Financiamiento se lleva el máximo de 30; el horizonte baja a 25.
    expect(plan.changes).toContainEqual({ dimension: 'financing', matchValue: 'cash', from: 25, to: 30 })
    expect(plan.changes).toContainEqual({ dimension: 'timeline', matchValue: 'under_3_months', from: 30, to: 25 })
  })

  it('una diferencia menor al umbral no reordena', () => {
    const plan = planAutoCalibration({
      effective: GLOBAL, global: GLOBAL, now: NOW, lastCalibrationAt: null,
      evidence: evidencia({ timeline: 20, financing: 23 }),
    })
    expect(plan).toEqual({ apply: false, reason: 'sin_cambios' })
  })

  it('un factor atascado detrás de otros con el mismo máximo puede subir', () => {
    // geo_fit está último, detrás de dos factores que también valen 5: si sólo
    // pudiera subir un puesto, quedaría siempre en un intercambio sin efecto.
    const plan = planAutoCalibration({
      effective: GLOBAL, global: GLOBAL, now: NOW, lastCalibrationAt: null,
      evidence: evidencia({ timeline: 0, financing: 0, budget_tier: 0, agent_status: 0, contingency: 0, geo_fit: 60 }),
    })
    expect(plan.apply).toBe(true)
    if (!plan.apply) return
    expect(plan.after[0]).toBe('geo_fit')
    expect(plan.changes).toContainEqual({ dimension: 'geo_fit', matchValue: 'zona_principal', from: 5, to: 30 })
  })

  it('las diferencias bajo el umbral conservan el orden vigente', () => {
    const plan = planAutoCalibration({
      effective: GLOBAL, global: GLOBAL, now: NOW, lastCalibrationAt: null,
      evidence: evidencia({ timeline: 10, financing: 14, budget_tier: 40 }),
    })
    expect(plan.apply).toBe(true)
    if (!plan.apply) return
    // Presupuesto adelanta a los dos; financiamiento no adelanta al horizonte (4 pp).
    expect(plan.after.slice(0, 3)).toEqual(['budget_tier', 'timeline', 'financing'])
  })

  it('intercambiar dos factores con el mismo máximo no es una calibración', () => {
    // contingency y geo_fit valen 5: cambiarlos de orden no mueve ningún punto.
    const plan = planAutoCalibration({
      effective: GLOBAL, global: GLOBAL, now: NOW, lastCalibrationAt: null,
      evidence: evidencia({ timeline: 50, financing: 45, budget_tier: 40, agent_status: 30, contingency: 0, geo_fit: 30 }),
    })
    expect(plan).toEqual({ apply: false, reason: 'sin_cambios' })
  })

  it('parte del orden vigente del tenant, no del global', () => {
    // El tenant ya tiene financiamiento arriba: con la misma evidencia no hay nada que hacer.
    const cambios = new Map(recalibrate(GLOBAL, ['financing', 'timeline']).map(c => [`${c.dimension}|${c.matchValue}`, c.to]))
    const efectivo = GLOBAL.map(r => ({ ...r, points: cambios.get(`${r.dimension}|${r.matchValue}`) ?? r.points }))
    const plan = planAutoCalibration({
      effective: efectivo, global: GLOBAL, now: NOW, lastCalibrationAt: null,
      evidence: evidencia({ timeline: 5, financing: 40 }),
    })
    expect(plan).toEqual({ apply: false, reason: 'sin_cambios' })
  })
})

// Salud: el caso real que motivó esto (noviembre de 2026). 54 leads activos,
// casi todos con 30 puntos, 11 de 60 leads recientes con perfil.
const SIN_SENAL = {
  active_leads: 54, active_with_fit: 3, distinct_scores: 4, top_tie: 40,
  recent_leads: 60, recent_with_fit: 11, closes: 123, closes_with_fit: 0,
  manual_actions_90d: 0, overrides: 0,
  bands: { p20: 30, p40: 30, p60: 30, p80: 32, active_leads: 54, degenerate: true, computed_at: '2026-11-18T00:00:12Z' },
}

describe('assessScoringHealth', () => {
  it('detecta bandas que no distinguen y poco perfil', () => {
    const h = assessScoringHealth(parseScoringHealth(SIN_SENAL))
    expect(h.level).toBe('problema')
    expect(h.bandMode).toBe('fijos_sin_senal')
    expect(h.findings.map(f => f.code)).toEqual(['bandas_sin_senal', 'poco_perfil', 'sin_acciones'])
    expect(h.fitCoverage).toBe(18)
    expect(h.calibration).toEqual({ closesWithFit: 0, needed: MIN_CLOSES_FOR_EVIDENCE, ready: false })
  })

  it('un tenant sano sólo da información', () => {
    const h = assessScoringHealth(parseScoringHealth({
      ...SIN_SENAL, active_with_fit: 50, top_tie: 4, recent_with_fit: 55, manual_actions_90d: 12,
      bands: { ...SIN_SENAL.bands, p20: 20, p40: 35, p60: 50, p80: 70, degenerate: false },
    }))
    expect(h.level).toBe('info')
    expect(h.bandMode).toBe('quintiles')
    expect(h.findings).toEqual([])
  })

  it('con pocos leads explica los cortes fijos sin alarmar', () => {
    const h = assessScoringHealth(parseScoringHealth({
      ...SIN_SENAL, active_leads: 12, active_with_fit: 10, recent_leads: 0, recent_with_fit: 0, manual_actions_90d: 3,
      bands: { ...SIN_SENAL.bands, active_leads: 12, degenerate: false },
    }))
    expect(h.bandMode).toBe('fijos_pocos_leads')
    expect(h.level).toBe('info')
    // Sin leads recientes, la cobertura se mide sobre la cartera activa.
    expect(h.fitCoverage).toBe(83)
  })

  it('tolera un JSON incompleto', () => {
    const h = assessScoringHealth(parseScoringHealth(null))
    expect(h.bandMode).toBe('sin_calcular')
    expect(h.fitCoverage).toBeNull()
  })
})

describe('groupOf', () => {
  it('lo que tiene efecto secundario es una protección, sea de la categoría que sea', () => {
    expect(groupOf({ category: 'engagement', sideEffect: 'force_perdido' })).toBe('proteccion')
    expect(groupOf({ category: 'manual', sideEffect: 'force_perdido' })).toBe('proteccion')
    expect(groupOf({ category: 'engagement', sideEffect: null })).toBe('actividad')
    expect(groupOf({ category: 'manual', sideEffect: null })).toBe('agente')
    expect(groupOf({ category: 'fit', sideEffect: null })).toBe('perfil')
  })
})
