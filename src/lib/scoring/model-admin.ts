import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGlobalScoreRules, getScoreRulesBundle, type ScoreRule } from '@/lib/data/score-rules'
import { currentOrder, recalibrate, type CalibrationRule, type CalibratedPoint } from './calibration'

// ── Escrituras sobre el modelo de scoring ────────────────────────────────────
//
// Las tres formas de cambiar cómo se puntúa a los leads, en un solo lugar:
//
//   - applyGlobalRuleChanges: puntos o activación de reglas GLOBALES (todos
//     los tenants). Sólo ITMANO, desde el Centro de control.
//   - applyTenantCalibration: reordena los factores de perfil de UN tenant
//     (overrides de fit). La usa el cron con evidencia y, a mano, ITMANO.
//   - resetTenantCalibration: devuelve un tenant al modelo global.
//
// Las tres recalculan los leads afectados en el acto (recompute_scores_bulk,
// sin avisos de "lead caliente") y las bandas. Antes un cambio sólo llegaba a
// los leads sin actividad en los últimos 14 días, que son los que recorre el decay.
//
// Quien llama comprueba el rol: esto no lee la sesión para poder correr desde
// el cron.

export interface RuleChange { id: string; points: number; isActive: boolean }

function asCalibration(rules: ScoreRule[]): CalibrationRule[] {
  return rules.map(r => ({
    category: r.category, dimension: r.dimension,
    matchValue: r.matchValue, points: r.points, isActive: r.isActive,
  }))
}

async function recomputeAndRefresh(tenantId: string | null): Promise<string | null> {
  const db = createAdminClient()
  const { error } = await db.rpc('recompute_scores_bulk', tenantId ? { p_tenant_id: tenantId } : {})
  if (error) return error.message
  // Las bandas son quintiles de TODA la cartera del tenant: con scores nuevos
  // los cortes de ayer ya no aplican.
  const { error: bandsError } = await db.rpc('refresh_quality_bands')
  return bandsError ? bandsError.message : null
}

export async function applyGlobalRuleChanges(
  changes: RuleChange[],
): Promise<{ ok: true; recomputeError: string | null } | { ok: false; error: string }> {
  const db = createAdminClient()
  for (const c of changes) {
    const { error } = await db
      .from('lead_score_rules')
      .update({ points: c.points, is_active: c.isActive })
      .eq('id', c.id)
      .is('tenant_id', null) // sólo reglas globales: nunca un override de tenant
      .is('side_effect', null) // las protecciones no se editan desde la UI
    if (error) return { ok: false, error: error.message }
  }
  return { ok: true, recomputeError: await recomputeAndRefresh(null) }
}

export interface CalibrationResult {
  before:  string[]
  after:   string[]
  changes: CalibratedPoint[]
}

/**
 * Reparte los máximos del modelo global según `order` para un tenant, registra
 * la calibración y recalcula sus leads.
 */
export async function applyTenantCalibration(args: {
  tenantId:       string
  order:          string[]
  source:         'auto' | 'manual'
  actorUserId:    string | null
  closesWithFit:  number
}): Promise<{ ok: true; result: CalibrationResult; recomputeError: string | null } | { ok: false; error: string }> {
  const { tenantId, order, source, actorUserId, closesWithFit } = args
  const db = createAdminClient()

  const [globales, bundle] = await Promise.all([getGlobalScoreRules(), getScoreRulesBundle(tenantId)])
  const before  = currentOrder(asCalibration(bundle.effective))
  const changes = recalibrate(asCalibration(globales), order)

  // Borrar y reinsertar en vez de upsert: la clave única es un índice sobre
  // coalesce(match_value,''), que PostgREST no puede apuntar con onConflict. Su
  // peor caso es quedarse con las reglas globales, que es el estado seguro.
  const { error: delErr } = await db
    .from('lead_score_rules')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('category', 'fit')
  if (delErr) return { ok: false, error: delErr.message }

  if (changes.length > 0) {
    const porRegla = new Map(globales.map(r => [`${r.dimension}|${r.matchValue ?? ''}`, r]))
    const filas = changes.map(c => {
      const base = porRegla.get(`${c.dimension}|${c.matchValue}`)
      return {
        tenant_id:   tenantId,
        category:    'fit',
        dimension:   c.dimension,
        match_value: c.matchValue,
        points:      c.to,
        decays:      base?.decays ?? false,
        is_active:   base?.isActive ?? true,
        side_effect: base?.sideEffect ?? null,
        label:       base?.label ?? null,
      }
    })
    const { error: insErr } = await db.from('lead_score_rules').insert(filas)
    if (insErr) return { ok: false, error: insErr.message }
  }

  const after = currentOrder(asCalibration(globales).map(r => {
    const c = changes.find(x => x.dimension === r.dimension && x.matchValue === r.matchValue)
    return c ? { ...r, points: c.to } : r
  }))

  const { error: logErr } = await db.from('scoring_calibrations').insert({
    tenant_id: tenantId, source, order_before: before, order_after: after,
    changes: changes as unknown as never, closes_with_fit: closesWithFit, actor_user_id: actorUserId,
  })
  if (logErr) console.error(JSON.stringify({ service: 'scoring-calibration', tenant_id: tenantId, error: logErr.message }))

  return { ok: true, result: { before, after, changes }, recomputeError: await recomputeAndRefresh(tenantId) }
}

/** Quita la calibración de un tenant: vuelve a puntuar con el modelo global. */
export async function resetTenantCalibration(args: {
  tenantId: string
  actorUserId: string | null
}): Promise<{ ok: true; recomputeError: string | null } | { ok: false; error: string }> {
  const { tenantId, actorUserId } = args
  const db = createAdminClient()
  const bundle = await getScoreRulesBundle(tenantId)

  const { error } = await db
    .from('lead_score_rules')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('category', 'fit')
  if (error) return { ok: false, error: error.message }

  const { error: logErr } = await db.from('scoring_calibrations').insert({
    tenant_id: tenantId, source: 'reset',
    order_before: currentOrder(asCalibration(bundle.effective)),
    order_after:  currentOrder(asCalibration(bundle.global)),
    changes: [], closes_with_fit: 0, actor_user_id: actorUserId,
  })
  if (logErr) console.error(JSON.stringify({ service: 'scoring-calibration', tenant_id: tenantId, error: logErr.message }))

  return { ok: true, recomputeError: await recomputeAndRefresh(tenantId) }
}
