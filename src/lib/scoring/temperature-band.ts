// Temperature band — the labelled band of a 0–100 score. Mirrors the Lead Scoring
// Model's score-driven status bands (CLAUDE.md): ≥60 Caliente, 35–59 Templado,
// 15–34 Nurturing, <15 Nuevo. Used for the analytics "Temperatura promedio" KPI.

// Post-funnel statuses whose score is frozen (a stale snapshot). Excluded from the
// average so the temperature reflects the LIVE pipeline, not closed/lost deals.
export const FROZEN_STATUSES = ['process_started', 'process_completed', 'closed', 'lost'] as const

export interface TemperatureBand {
  key:   'caliente' | 'templado' | 'nurturing' | 'nuevo'
  label: string
  color: string
}

// Los cortes, como constante nombrada: los consume bandForScore y también el
// cálculo de alcance de Ajustes (scoring/reach.ts), que avisa cuando una
// configuración de puntos deja una banda inalcanzable. Deben coincidir con el
// CASE de recompute_lead_score en Postgres, que es quien asigna leads.status.
export const SCORE_BANDS = {
  hot:       60,
  warm:      35,
  nurturing: 15,
} as const

export function bandForScore(score: number): TemperatureBand {
  if (score >= SCORE_BANDS.hot)       return { key: 'caliente',  label: 'Caliente',  color: '#E04040' }
  if (score >= SCORE_BANDS.warm)      return { key: 'templado',  label: 'Templado',  color: '#E07B3A' }
  if (score >= SCORE_BANDS.nurturing) return { key: 'nurturing', label: 'Nurturing', color: '#C9A96E' }
  return { key: 'nuevo', label: 'Nuevo', color: 'var(--text-muted)' }
}

// Mean current_score over the LIVE (non-frozen) leads in the scope. Returns null
// when there are no live leads (caller renders "—").
export function averageLiveTemperature(
  leads: ReadonlyArray<{ status: string; temperatureScore: number | null }>,
): number | null {
  const live = leads.filter(l => !(FROZEN_STATUSES as readonly string[]).includes(l.status))
  if (live.length === 0) return null
  const sum = live.reduce((s, l) => s + (l.temperatureScore ?? 0), 0)
  return Math.round(sum / live.length)
}
