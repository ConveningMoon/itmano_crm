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

// Salud: el caso real que motivó esto (noviembre de 2026). 71 leads activos,
// 49 empatados en 30: registros de asistencia a eventos (fuentes "solo
// registro") sin secuencia de correo. El formulario de contacto sí filtra.
const canal = (o: Record<string, unknown>) => ({
  channel_id: 'c', name: 'Canal', channel_type: 'event', channel_has_sequence: false,
  asks_fit_questions: false, leads: 0, with_fit: 0, at_mode: 0, in_sequence: 0, stuck: 0,
  recent_leads: 0, recent_with_fit: 0, ...o,
})
const CANALES_AJ = [
  canal({ channel_id: 'nav', name: 'Evento de Navidad 2026', leads: 36, at_mode: 36, stuck: 36, recent_leads: 36 }),
  canal({ channel_id: 'fgs', name: 'Feel Good Social', leads: 15, with_fit: 4, at_mode: 12, in_sequence: 4, stuck: 8, recent_leads: 15, recent_with_fit: 4 }),
  canal({ channel_id: 'cu', name: 'Contact Us - Web', channel_type: 'contact_form', asks_fit_questions: true, leads: 10, with_fit: 9, at_mode: 1, stuck: 1, recent_leads: 9, recent_with_fit: 8 }),
  canal({ channel_id: null, name: null, channel_type: null, leads: 10, in_sequence: 6, stuck: 4, recent_leads: 9 }),
]
// Con la regla anterior (dos cortes iguales = sin señal): cortes fijos.
const SIN_SENAL = {
  active_leads: 71, active_with_fit: 13, distinct_scores: 7, top_tie: 49, mode_score: 30,
  recent_leads: 69, recent_with_fit: 12,
  recent_form_leads: 9, recent_form_with_fit: 8, active_form_leads: 10, active_form_with_fit: 9,
  closes: 123, closes_with_fit: 0, manual_actions_90d: 0, overrides: 0,
  channels: CANALES_AJ,
  bands: { p20: 30, p40: 30, p60: 30, p80: 30, active_leads: 71, degenerate: true, computed_at: '2026-11-28T00:00:12Z' },
}
// Con la regla nueva los 12 con perfil se separan del empate: quintiles.
const EMPATE_SEPARADO = { ...SIN_SENAL, bands: { ...SIN_SENAL.bands, degenerate: false } }

describe('assessScoringHealth', () => {
  it('sin nadie que se separe, avisa y dice de qué fuentes viene el empate', () => {
    const h = assessScoringHealth(parseScoringHealth(SIN_SENAL))
    expect(h.level).toBe('problema')
    expect(h.bandMode).toBe('fijos_sin_senal')
    expect(h.findings.map(f => f.code)).toEqual(['bandas_sin_senal', 'sin_nutricion', 'sin_acciones'])
    const empate = h.findings[0]
    expect(empate.detail).toContain('69%')
    expect(empate.detail).toContain('(30 puntos)')
    expect(empate.detail).toContain('Evento de Navidad 2026 (36), Feel Good Social (12) y Contact Us - Web (1)')
    expect(h.calibration).toEqual({ closesWithFit: 0, needed: MIN_CLOSES_FOR_EVIDENCE, ready: false })
  })

  it('un empate grande de fuentes "solo registro" con los de arriba separados es información', () => {
    const h = assessScoringHealth(parseScoringHealth(EMPATE_SEPARADO))
    expect(h.bandMode).toBe('quintiles')
    const f = h.findings.find(x => x.code === 'empate_amplio')!
    expect(f.level).toBe('info')
    expect(f.detail).toContain('Es normal en registros sin preguntas de filtrado')
    // Lo que sí pide acción son los leads fuera de cualquier secuencia.
    expect(h.level).toBe('atencion')
    expect(h.findings.some(x => x.code === 'bandas_sin_senal')).toBe(false)
  })

  it('un empate grande que viene de fuentes que filtran pide revisar', () => {
    const h = assessScoringHealth(parseScoringHealth({
      ...EMPATE_SEPARADO,
      channels: [canal({ name: 'Guía del comprador', asks_fit_questions: true, leads: 60, with_fit: 50, at_mode: 45, recent_leads: 60, recent_with_fit: 50 })],
      top_tie: 45, active_leads: 71,
    }))
    expect(h.findings.find(x => x.code === 'empate_amplio')!.level).toBe('atencion')
  })

  it('señala las fuentes "solo registro" cuyos leads no están en ninguna secuencia', () => {
    const h = assessScoringHealth(parseScoringHealth(SIN_SENAL))
    const f = h.findings.find(x => x.code === 'sin_nutricion')!
    expect(f.level).toBe('atencion')
    expect(f.detail).toMatch(/^44 leads activos de fuentes sin preguntas de filtrado/)
    expect(f.detail).toContain('asigna una a Evento de Navidad 2026 y Feel Good Social')
    // Menos de MIN_STUCK_PER_CHANNEL atascados no se listan; las fuentes que filtran tampoco.
    expect(f.items).toEqual([
      'Evento de Navidad 2026: 36 de 36 · la fuente no tiene secuencia',
      'Feel Good Social: 8 de 15 · la fuente no tiene secuencia',
    ])
  })

  it('una fuente "solo registro" con secuencia cuyos leads no entraron', () => {
    const h = assessScoringHealth(parseScoringHealth({
      ...SIN_SENAL, channels: [canal({ name: 'Open house', leads: 8, stuck: 6, channel_has_sequence: true })],
    }))
    const f = h.findings.find(x => x.code === 'sin_nutricion')!
    expect(f.items).toEqual(['Open house: 6 de 8 · la fuente tiene secuencia, pero no entraron'])
    expect(f.detail).toMatch(/Inscríbelos en una secuencia\.$/)
  })

  it('un evento marcado como "con filtrado" se juzga por su perfil, no por su secuencia', () => {
    const h = assessScoringHealth(parseScoringHealth({
      ...SIN_SENAL,
      recent_form_leads: 45, recent_form_with_fit: 8,
      channels: [
        canal({ channel_id: 'nav', name: 'Evento de Navidad 2026', asks_fit_questions: true, leads: 36, stuck: 36, recent_leads: 36 }),
        CANALES_AJ[2],
      ],
    }))
    expect(h.findings.some(x => x.code === 'sin_nutricion')).toBe(false)
    const f = h.findings.find(x => x.code === 'poco_perfil')!
    expect(f.level).toBe('problema')
    expect(f.detail).toContain('Sólo 8 de 45 leads de los últimos 90 días de fuentes con preguntas de filtrado')
    expect(f.items).toEqual(['Evento de Navidad 2026: 0 de 36 con perfil'])
  })

  it('la cobertura de perfil sólo cuenta fuentes con filtrado', () => {
    const h = assessScoringHealth(parseScoringHealth(SIN_SENAL))
    // 8 de 9 de contacto: los 36 registros a la fiesta no bajan la cobertura.
    expect(h.fitCoverage).toBe(89)
    expect(h.fitCoverageBase).toBe(9)
    expect(h.fitCoverageScope).toBe('recientes')
    expect(h.findings.some(f => f.code === 'poco_perfil')).toBe(false)
  })

  it('una fuente con filtrado rota se señala aunque el total salga bien', () => {
    const h = assessScoringHealth(parseScoringHealth({
      ...SIN_SENAL,
      recent_form_leads: 60, recent_form_with_fit: 50,
      channels: [
        canal({ name: 'Guía del comprador', asks_fit_questions: true, leads: 50, with_fit: 49, recent_leads: 50, recent_with_fit: 49 }),
        canal({ name: 'Landing nueva', asks_fit_questions: true, leads: 10, with_fit: 1, recent_leads: 10, recent_with_fit: 1 }),
      ],
    }))
    const f = h.findings.find(x => x.code === 'poco_perfil')!
    expect(f.level).toBe('atencion')
    expect(f.title).toBe('Una fuente con filtrado llega sin perfil')
    expect(f.items).toEqual(['Landing nueva: 1 de 10 con perfil'])
  })

  it('un tenant sano sólo da información', () => {
    const h = assessScoringHealth(parseScoringHealth({
      ...SIN_SENAL, top_tie: 4, manual_actions_90d: 12,
      channels: [canal({ asks_fit_questions: true, leads: 71, with_fit: 60, in_sequence: 60, stuck: 4, recent_leads: 69, recent_with_fit: 60 })],
      recent_form_leads: 69, recent_form_with_fit: 60,
      bands: { ...SIN_SENAL.bands, p20: 20, p40: 35, p60: 50, p80: 70, degenerate: false },
    }))
    expect(h.level).toBe('info')
    expect(h.bandMode).toBe('quintiles')
    expect(h.findings).toEqual([])
  })

  it('con pocos leads explica los cortes fijos sin alarmar', () => {
    const h = assessScoringHealth(parseScoringHealth({
      ...SIN_SENAL, active_leads: 12, top_tie: 3, recent_form_leads: 0, active_form_leads: 12, active_form_with_fit: 10,
      manual_actions_90d: 3, channels: [],
      bands: { ...SIN_SENAL.bands, active_leads: 12, degenerate: false },
    }))
    expect(h.bandMode).toBe('fijos_pocos_leads')
    expect(h.level).toBe('info')
    // Sin leads recientes de fuentes con filtrado, la cobertura se mide sobre los activos.
    expect(h.fitCoverage).toBe(83)
    expect(h.fitCoverageScope).toBe('activos')
  })

  it('tolera un JSON incompleto', () => {
    const h = assessScoringHealth(parseScoringHealth(null))
    expect(h.bandMode).toBe('sin_calcular')
    expect(h.fitCoverage).toBeNull()
    expect(h.raw.channels).toEqual([])
    expect(h.raw.modeScore).toBeNull()
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
