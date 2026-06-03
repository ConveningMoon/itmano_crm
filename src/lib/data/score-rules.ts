import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// A single global scoring rule (lead_score_rules row with tenant_id = null).
// dimension / match_value / category form the vocabulary and are NOT editable from
// the UI — only `points` and `isActive` are. Changing the vocabulary is a code change.
export interface ScoreRule {
  id:         string
  category:   'fit' | 'engagement' | 'manual'
  dimension:  string
  matchValue: string | null
  points:     number
  decays:     boolean
  isActive:   boolean
  sideEffect: string | null
  label:      string | null
}

interface ScoreRuleRow {
  id:          string
  category:    string
  dimension:   string
  match_value: string | null
  points:      number
  decays:      boolean
  is_active:   boolean
  side_effect: string | null
  label:       string | null
}

function mapRule(r: ScoreRuleRow): ScoreRule {
  return {
    id:         r.id,
    category:   r.category as ScoreRule['category'],
    dimension:  r.dimension,
    matchValue: r.match_value,
    points:     r.points,
    decays:     r.decays,
    isActive:   r.is_active,
    sideEffect: r.side_effect,
    label:      r.label,
  }
}

// Reads the global scoring rules (tenant_id = null). Global rules apply to every
// tenant; per-tenant overrides are a future feature. Globals are world-readable via
// RLS, but the settings page already runs on the admin client, so we use it for
// consistency. Writes go through the updateScoreRules server action (super_admin only).
export async function getGlobalScoreRules(): Promise<ScoreRule[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('lead_score_rules')
    .select('id, category, dimension, match_value, points, decays, is_active, side_effect, label')
    .is('tenant_id', null)
  return (data ?? []).map(r => mapRule(r as ScoreRuleRow))
}
