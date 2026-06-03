import 'server-only'

// Maps a form submission's intent + answers onto the lead's fit profile.
//
// The new scoring engine (migration 029) derives the "fit" component from
// leads.fit_profile — a flat map of { dimension: option_code } that recompute_lead_score
// matches against lead_score_rules (category='fit', match_value=option_code). This module
// turns the self-describing form_answers array into that map, scoped by the lead's intent
// so a buyer form can't inject seller dimensions (and vice-versa).
//
// Forms send the raw option code as the answer `value` (e.g. 'cash', 'under_3_months') —
// the same string the fit rules match on. We store that code verbatim.

export type FitIntent = 'buy' | 'invest' | 'sell'

// One self-describing answer item (see CLAUDE.md → answers contract). Only `key` and
// `value` are needed here; question/label are display-only.
export interface FormAnswerItem {
  key:   string
  value: string | number | boolean
}

// Normalize the many spellings a form might send into the canonical intent.
const INTENT_ALIASES: Record<string, FitIntent> = {
  buy: 'buy', purchase: 'buy', compra: 'buy', comprar: 'buy', comprador: 'buy',
  invest: 'invest', investment: 'invest', invierte: 'invest', invertir: 'invest',
  inversion: 'invest', inversionista: 'invest',
  sell: 'sell', sale: 'sell', vende: 'sell', vender: 'sell', vendedor: 'sell',
}

// Recognized fit dimensions per intent. Must match lead_score_rules.dimension
// for category='fit' (migration 029 seed).
const FIT_DIMENSIONS: Record<FitIntent, readonly string[]> = {
  buy:    ['timeline', 'financing', 'budget_tier', 'agent_status'],
  invest: ['timeline', 'financing', 'budget_tier', 'agent_status'],
  sell:   ['sell_motivation', 'timeline', 'listing_status'],
}

// Union of every recognized fit dimension — used as a graceful fallback when the
// intent is unknown/missing (forms only send their own intent's fields anyway).
const ALL_FIT_DIMENSIONS: readonly string[] = [
  'timeline', 'financing', 'budget_tier', 'agent_status', 'sell_motivation', 'listing_status',
]

export function normalizeIntent(raw: unknown): FitIntent | null {
  if (typeof raw !== 'string') return null
  return INTENT_ALIASES[raw.trim().toLowerCase()] ?? null
}

// Extract the recognized fit dimensions from the answers array, scoped by intent.
// Unknown/free-text keys are ignored. Empty values are dropped (don't overwrite a
// previously-known answer with a blank on re-submit).
export function extractFitDimensions(
  intent: FitIntent | null,
  answers: FormAnswerItem[] | undefined
): Record<string, string> {
  if (!answers?.length) return {}
  const allowed = intent ? FIT_DIMENSIONS[intent] : ALL_FIT_DIMENSIONS
  const out: Record<string, string> = {}
  for (const a of answers) {
    if (!allowed.includes(a.key)) continue
    const value = typeof a.value === 'string' ? a.value.trim() : String(a.value)
    if (value) out[a.key] = value
  }
  return out
}
