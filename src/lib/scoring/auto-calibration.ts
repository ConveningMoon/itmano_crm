import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { getScoreRulesBundle } from '@/lib/data/score-rules'
import { getFitEvidence } from '@/lib/data/fit-evidence'
import { planAutoCalibration, type CalibrationRule } from './calibration'
import { applyTenantCalibration } from './model-admin'

// ── Calibración automática (cron diario) ─────────────────────────────────────
//
// Recorre los tenants y, donde la evidencia de cierres lo justifica, reordena
// sus factores de perfil sin que nadie lo pida. Las reglas de cuándo y cuánto
// viven en `planAutoCalibration` (módulo puro, con tests). Cada tenant es
// independiente: un fallo en uno no frena a los demás.

export interface AutoCalibrationOutcome {
  tenantId: string
  applied:  boolean
  reason?:  string
  error?:   string
}

const CAL_COLUMNS = columns('scoring_calibrations', ['tenant_id', 'created_at'])

export async function runAutoCalibrations(now = new Date()): Promise<AutoCalibrationOutcome[]> {
  const db = createAdminClient()
  const [{ data: tenantRows, error }, { data: lastRows }] = await Promise.all([
    db.from('tenants').select('id'),
    // La última calibración de cada tenant, de cualquier origen: la espera
    // entre calibraciones cuenta también una manual o un restablecimiento.
    db.from('scoring_calibrations').select(CAL_COLUMNS).order('created_at', { ascending: false }).limit(500),
  ])
  if (error) throw new Error(`tenants: ${error.message}`)

  const ultima = new Map<string, Date>()
  for (const r of (lastRows ?? []) as unknown as { tenant_id: string; created_at: string }[]) {
    if (!ultima.has(r.tenant_id)) ultima.set(r.tenant_id, new Date(r.created_at))
  }

  const out: AutoCalibrationOutcome[] = []
  for (const { id: tenantId } of (tenantRows ?? []) as { id: string }[]) {
    try {
      const [evidence, bundle] = await Promise.all([getFitEvidence(tenantId), getScoreRulesBundle(tenantId)])
      const toCal = (rs: typeof bundle.global): CalibrationRule[] => rs.map(r => ({
        category: r.category, dimension: r.dimension, matchValue: r.matchValue, points: r.points, isActive: r.isActive,
      }))
      const plan = planAutoCalibration({
        effective: toCal(bundle.effective),
        global:    toCal(bundle.global),
        evidence,
        lastCalibrationAt: ultima.get(tenantId) ?? null,
        now,
      })
      if (!plan.apply) { out.push({ tenantId, applied: false, reason: plan.reason }); continue }

      const res = await applyTenantCalibration({
        tenantId, order: plan.after, source: 'auto', actorUserId: null, closesWithFit: evidence.closedWithFit,
      })
      out.push(res.ok
        ? { tenantId, applied: true, ...(res.recomputeError ? { error: res.recomputeError } : {}) }
        : { tenantId, applied: false, error: res.error })
    } catch (err) {
      out.push({ tenantId, applied: false, error: err instanceof Error ? err.message : 'unknown' })
    }
  }
  return out
}
