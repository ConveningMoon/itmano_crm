import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { assessScoringHealth, parseScoringHealth, type ScoringHealth } from '@/lib/scoring/health'

// Lecturas del scoring para el Centro de control y la pestaña Scoring de un
// tenant. Todo es de super_admin: usa el admin client y quien llama comprueba
// el rol. Ver `scoring_health` y `scoring_rule_usage` (migración 20261118120000).

/** Ventana de "uso" de las reglas, en días. */
export const USAGE_DAYS = 90

export async function getScoringHealth(tenantId: string): Promise<ScoringHealth> {
  const db = createAdminClient()
  const { data, error } = await db.rpc('scoring_health', { p_tenant_id: tenantId })
  if (error) console.error(JSON.stringify({ service: 'scoring-health', tenant_id: tenantId, error: error.message }))
  return assessScoringHealth(parseScoringHealth(error ? null : data))
}

export interface TenantScoringHealth {
  tenantId:   string
  tenantName: string
  health:     ScoringHealth
}

/** Salud de todos los tenants, en paralelo (son pocas decenas). */
export async function getAllScoringHealth(): Promise<TenantScoringHealth[]> {
  const db = createAdminClient()
  const { data } = await db.from('tenants').select(columns('tenants', ['id', 'name'])).order('name')
  const tenants = (data ?? []) as unknown as { id: string; name: string }[]
  const healths = await Promise.all(tenants.map(t => getScoringHealth(t.id)))
  return tenants.map((t, i) => ({ tenantId: t.id, tenantName: t.name, health: healths[i] }))
}

/** Usos por regla global: clave `${category}|${dimension}|${matchValue ?? ''}`. */
export type RuleUsage = Record<string, number>

export function usageKey(category: string, dimension: string, matchValue: string | null): string {
  return `${category}|${dimension}|${matchValue ?? ''}`
}

export async function getRuleUsage(tenantId: string | null): Promise<RuleUsage> {
  const db = createAdminClient()
  const { data, error } = await db.rpc('scoring_rule_usage', {
    p_days: USAGE_DAYS,
    ...(tenantId ? { p_tenant_id: tenantId } : {}),
  })
  if (error) {
    console.error(JSON.stringify({ service: 'scoring-usage', error: error.message }))
    return {}
  }
  const out: RuleUsage = {}
  const rows = (data ?? []) as { category: string; dimension: string; match_value: string | null; leads: number }[]
  for (const r of rows) out[usageKey(r.category, r.dimension, r.match_value)] = Number(r.leads)
  return out
}

export interface CalibrationLogEntry {
  id:          string
  tenantId:    string
  source:      'auto' | 'manual' | 'reset'
  orderBefore: string[]
  orderAfter:  string[]
  changes:     number
  closesWithFit: number
  createdAt:   string
}

const LOG_COLUMNS = columns('scoring_calibrations', [
  'id', 'tenant_id', 'source', 'order_before', 'order_after', 'changes', 'closes_with_fit', 'created_at',
])

export async function getCalibrationLog(opts: { tenantId?: string; limit?: number } = {}): Promise<CalibrationLogEntry[]> {
  const db = createAdminClient()
  let q = db.from('scoring_calibrations').select(LOG_COLUMNS).order('created_at', { ascending: false }).limit(opts.limit ?? 10)
  if (opts.tenantId) q = q.eq('tenant_id', opts.tenantId)
  const { data, error } = await q
  if (error) {
    console.error(JSON.stringify({ service: 'scoring-calibration-log', error: error.message }))
    return []
  }
  return ((data ?? []) as unknown as {
    id: string; tenant_id: string; source: string; order_before: string[]; order_after: string[]
    changes: unknown; closes_with_fit: number; created_at: string
  }[]).map(r => ({
    id: r.id,
    tenantId: r.tenant_id,
    source: (r.source === 'auto' || r.source === 'reset' ? r.source : 'manual'),
    orderBefore: r.order_before ?? [],
    orderAfter: r.order_after ?? [],
    changes: Array.isArray(r.changes) ? r.changes.length : 0,
    closesWithFit: r.closes_with_fit,
    createdAt: r.created_at,
  }))
}
