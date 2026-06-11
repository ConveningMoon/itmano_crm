import type { ScoreRule } from '@/lib/data/score-rules'

export interface FitLine {
  dimension: string
  value:     string
  label:     string
  points:    number
}

export interface ScoreBreakdown {
  fit:           { lines: FitLine[]; total: number }
  engagement:    { total: number }
  manual:        { total: number }
  total:         number   // = current_score
  frozen:        boolean
  hasFitProfile: boolean
}

// Builds the lead's score breakdown (calculated view, not events): each fit_profile
// dimension matched to its active rule (label + points); a dimension/value without
// an active rule is omitted. Component totals come from the cached columns
// (fit_score / engagement_score / manual_score); the visible sum is current_score.
export function buildScoreBreakdown(args: {
  fitProfile:      Record<string, unknown> | null
  fitScore:        number
  engagementScore: number
  manualScore:     number
  currentScore:    number
  frozen:          boolean
  rules:           ScoreRule[]
}): ScoreBreakdown {
  const fitRules = args.rules.filter(r => r.category === 'fit' && r.isActive)
  const profile  = args.fitProfile ?? {}

  const lines: FitLine[] = []
  for (const [dim, raw] of Object.entries(profile)) {
    const value = raw == null ? '' : String(raw)
    const rule  = fitRules.find(r => r.dimension === dim && r.matchValue === value)
    if (!rule) continue // no active rule for this dimension/value → omit
    lines.push({ dimension: dim, value, label: rule.label ?? dim, points: rule.points })
  }

  return {
    fit:           { lines, total: args.fitScore },
    engagement:    { total: args.engagementScore },
    manual:        { total: args.manualScore },
    total:         args.currentScore,
    frozen:        args.frozen,
    hasFitProfile: Object.keys(profile).length > 0,
  }
}
