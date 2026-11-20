import { MIN_CLOSES_FOR_EVIDENCE } from './calibration'

// ── Salud del scoring de un tenant ───────────────────────────────────────────
//
// Convierte los conteos de `scoring_health(tenant_id)` en un veredicto que se
// lee de un vistazo: ¿el score de este tenant distingue a sus leads? Y si no,
// por qué. La idea es que nadie tenga que revisar la lista de reglas para darse
// cuenta de que algo no funciona: el Centro de control lo dice solo.
//
// Módulo PURO.

export interface ScoringHealthRaw {
  activeLeads:      number
  activeWithFit:    number
  distinctScores:   number
  topTie:           number
  recentLeads:      number
  recentWithFit:    number
  closes:           number
  closesWithFit:    number
  manualActions90d: number
  overrides:        number
  bands: {
    p20: number; p40: number; p60: number; p80: number
    activeLeads: number
    degenerate:  boolean
    computedAt:  string
  } | null
}

export type HealthLevel = 'info' | 'atencion' | 'problema'

/** Cómo se están calculando hoy las bandas de calidad del tenant. */
export type BandMode = 'quintiles' | 'fijos_pocos_leads' | 'fijos_sin_senal' | 'sin_calcular'

export interface HealthFinding {
  code:   'bandas_sin_senal' | 'poco_perfil' | 'pocos_leads' | 'sin_acciones' | 'sin_cartera'
  level:  HealthLevel
  title:  string
  detail: string
}

export interface ScoringHealth {
  raw:       ScoringHealthRaw
  /** El peor nivel entre los hallazgos; 'info' si todo está bien. */
  level:     HealthLevel
  bandMode:  BandMode
  /** % de leads (recientes, o activos si no hay recientes) con perfil declarado. */
  fitCoverage: number | null
  /** Sobre cuántos leads se calculó fitCoverage. */
  fitCoverageBase: number
  calibration: { closesWithFit: number; needed: number; ready: boolean }
  findings:  HealthFinding[]
}

/** Mínimo de leads activos para que los quintiles signifiquen algo (igual que leads_list). */
export const MIN_LEADS_FOR_QUINTILES = 20

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** Lee el JSON de `scoring_health` sin confiar en su forma. */
export function parseScoringHealth(json: unknown): ScoringHealthRaw {
  const o = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  const b = (o.bands && typeof o.bands === 'object' ? o.bands : null) as Record<string, unknown> | null
  return {
    activeLeads:      num(o.active_leads),
    activeWithFit:    num(o.active_with_fit),
    distinctScores:   num(o.distinct_scores),
    topTie:           num(o.top_tie),
    recentLeads:      num(o.recent_leads),
    recentWithFit:    num(o.recent_with_fit),
    closes:           num(o.closes),
    closesWithFit:    num(o.closes_with_fit),
    manualActions90d: num(o.manual_actions_90d),
    overrides:        num(o.overrides),
    bands: b ? {
      p20: num(b.p20), p40: num(b.p40), p60: num(b.p60), p80: num(b.p80),
      activeLeads: num(b.active_leads),
      degenerate:  b.degenerate === true,
      computedAt:  typeof b.computed_at === 'string' ? b.computed_at : '',
    } : null,
  }
}

const RANK: Record<HealthLevel, number> = { info: 0, atencion: 1, problema: 2 }

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

export function assessScoringHealth(raw: ScoringHealthRaw): ScoringHealth {
  const findings: HealthFinding[] = []

  // ── Modo de las bandas ──────────────────────────────────────────────────
  let bandMode: BandMode
  if (!raw.bands) bandMode = 'sin_calcular'
  else if (raw.bands.activeLeads < MIN_LEADS_FOR_QUINTILES) bandMode = 'fijos_pocos_leads'
  else if (raw.bands.degenerate) bandMode = 'fijos_sin_senal'
  else bandMode = 'quintiles'

  if (raw.activeLeads === 0) {
    findings.push({
      code: 'sin_cartera', level: 'info',
      title: 'Sin cartera activa',
      detail: 'No hay leads en Nuevo o Nutrición, así que no hay nada que clasificar todavía.',
    })
  } else if (bandMode === 'fijos_sin_senal') {
    findings.push({
      code: 'bandas_sin_senal', level: 'problema',
      title: 'La calidad no distingue entre leads',
      detail: `${pct(raw.topTie, raw.activeLeads)}% de la cartera activa tiene exactamente el mismo puntaje. `
        + 'Mientras sea así se usan los cortes fijos, que no inventan diferencias que no existen.',
    })
  } else if (bandMode === 'fijos_pocos_leads') {
    findings.push({
      code: 'pocos_leads', level: 'info',
      title: 'Cortes fijos por ahora',
      detail: `Con menos de ${MIN_LEADS_FOR_QUINTILES} leads activos no se reparte la cartera en quintiles: se usan cortes fijos (80, 60, 35, 15).`,
    })
  }

  // ── Perfil declarado ────────────────────────────────────────────────────
  // Los leads recientes dicen si el problema sigue ocurriendo; si no entró
  // ninguno en 90 días, la cartera activa es lo único que hay.
  const base = raw.recentLeads > 0 ? raw.recentLeads : raw.activeLeads
  const conPerfil = raw.recentLeads > 0 ? raw.recentWithFit : raw.activeWithFit
  const fitCoverage = base > 0 ? pct(conPerfil, base) : null

  if (fitCoverage !== null && base >= 5) {
    const level: HealthLevel | null = fitCoverage < 30 ? 'problema' : fitCoverage < 60 ? 'atencion' : null
    if (level) {
      findings.push({
        code: 'poco_perfil', level,
        title: 'Pocos leads con perfil',
        detail: `Sólo ${conPerfil} de ${base} ${raw.recentLeads > 0 ? 'leads de los últimos 90 días' : 'leads activos'} `
          + 'tienen perfil (cuándo compra, cómo paga, presupuesto…). Sin perfil, el score sólo mide actividad '
          + 'y casi todos empatan. Suele significar que los formularios no hacen esas preguntas.',
      })
    }
  }

  // ── Acciones del agente ─────────────────────────────────────────────────
  if (raw.activeLeads > 0 && raw.manualActions90d === 0) {
    findings.push({
      code: 'sin_acciones', level: 'info',
      title: 'Nadie registra acciones a mano',
      detail: 'En 90 días no se registró ninguna visita, cita ni propuesta. Esa parte del modelo no suma: la calidad sale sólo del perfil y la actividad.',
    })
  }

  const level = findings.reduce<HealthLevel>((max, f) => (RANK[f.level] > RANK[max] ? f.level : max), 'info')

  return {
    raw,
    level,
    bandMode,
    fitCoverage,
    fitCoverageBase: base,
    calibration: {
      closesWithFit: raw.closesWithFit,
      needed:        MIN_CLOSES_FOR_EVIDENCE,
      ready:         raw.closesWithFit >= MIN_CLOSES_FOR_EVIDENCE,
    },
    findings,
  }
}

export const BAND_MODE_LABEL: Record<BandMode, string> = {
  quintiles:         'Quintiles de la cartera',
  fijos_pocos_leads: 'Cortes fijos (pocos leads)',
  fijos_sin_senal:   'Cortes fijos (sin señal)',
  sin_calcular:      'Sin calcular todavía',
}

export const HEALTH_LEVEL_LABEL: Record<HealthLevel, string> = {
  info:     'Funciona',
  atencion: 'Mejorable',
  problema: 'Requiere atención',
}
