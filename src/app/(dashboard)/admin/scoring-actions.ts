'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { getFitEvidence } from '@/lib/data/fit-evidence'
import { calibratableDimensions } from '@/lib/scoring/calibration'
import { getGlobalScoreRules } from '@/lib/data/score-rules'
import {
  applyGlobalRuleChanges, applyTenantCalibration, resetTenantCalibration,
} from '@/lib/scoring/model-admin'

// Acciones del modelo de scoring. Sólo ITMANO (super_admin): el modelo es el
// mismo para todos los clientes y es parte de lo que compran. La política RLS
// de lead_score_rules también exige super_admin para escribir; este guard da
// un error limpio, porque un UPDATE bloqueado por RLS afecta 0 filas en silencio.

type Fail = { ok: false; error: string }

const NO_AUTORIZADO: Fail = { ok: false, error: 'El modelo de scoring lo administra ITMANO.' }

async function soloItmano() {
  const ctx = await getCurrentTenantContext()
  return ctx.role === 'super_admin' ? ctx : null
}

const ChangesSchema = z
  .array(z.object({
    id:       z.string().uuid(),
    points:   z.number().int().min(-100).max(100),
    isActive: z.boolean(),
  }))
  .min(1)
  .max(200)

export interface ImpactRow {
  tenantId:         string
  tenantName:       string
  activeLeads:      number
  scoreChanged:     number
  bandChanged:      number
  altaBefore:       number
  altaAfter:        number
  degenerateBefore: boolean
  degenerateAfter:  boolean
}

interface PreviewRow {
  tenant_id: string; tenant_name: string; active_leads: number
  score_changed: number; band_changed: number; alta_before: number; alta_after: number
  degenerate_before: boolean; degenerate_after: boolean
}

/** Qué pasaría en cada tenant con estos cambios. No escribe nada. */
export async function previewScoringChanges(changes: unknown): Promise<{ ok: true; impact: ImpactRow[] } | Fail> {
  if (!(await soloItmano())) return NO_AUTORIZADO
  const parsed = ChangesSchema.safeParse(changes)
  if (!parsed.success) return { ok: false, error: 'Los puntos deben ser números enteros entre -100 y 100.' }

  const db = createAdminClient()
  const { data, error } = await db.rpc('preview_score_rule_changes', { p_changes: parsed.data })
  if (error) return { ok: false, error: error.message }

  return {
    ok: true,
    impact: ((data ?? []) as PreviewRow[]).map(r => ({
      tenantId: r.tenant_id, tenantName: r.tenant_name, activeLeads: r.active_leads,
      scoreChanged: r.score_changed, bandChanged: r.band_changed,
      altaBefore: r.alta_before, altaAfter: r.alta_after,
      degenerateBefore: r.degenerate_before, degenerateAfter: r.degenerate_after,
    })),
  }
}

/** Aplica cambios al modelo global y recalcula todos los leads en el acto. */
export async function applyScoringChanges(changes: unknown): Promise<{ ok: true; warning: string | null } | Fail> {
  if (!(await soloItmano())) return NO_AUTORIZADO
  const parsed = ChangesSchema.safeParse(changes)
  if (!parsed.success) return { ok: false, error: 'Los puntos deben ser números enteros entre -100 y 100.' }

  const res = await applyGlobalRuleChanges(parsed.data)
  if (!res.ok) return res

  revalidatePath('/admin')
  revalidatePath('/settings')
  revalidatePath('/leads')
  revalidatePath('/dashboard')
  return {
    ok: true,
    warning: res.recomputeError
      ? 'Los puntos se guardaron, pero el recálculo de los leads falló; se completará en la pasada diaria.'
      : null,
  }
}

/** Orden de los factores de perfil elegido a mano para un tenant. */
export async function calibrateTenantManually(
  tenantId: string,
  order: string[],
): Promise<{ ok: true; changed: number } | Fail> {
  const ctx = await soloItmano()
  if (!ctx) return NO_AUTORIZADO
  if (!tenantId) return { ok: false, error: 'Selecciona un tenant desde el Centro de control.' }

  // Sólo dimensiones que existen y se pueden ordenar: el orden llega del cliente.
  const globales = await getGlobalScoreRules()
  const validas = new Set(calibratableDimensions(globales.map(r => ({
    category: r.category, dimension: r.dimension, matchValue: r.matchValue, points: r.points, isActive: r.isActive,
  }))))
  const orden = order.filter(d => validas.has(d))
  if (orden.length === 0) return { ok: false, error: 'El orden no contiene factores válidos.' }

  const evidence = await getFitEvidence(tenantId)
  const res = await applyTenantCalibration({
    tenantId, order: orden, source: 'manual', actorUserId: ctx.user_id, closesWithFit: evidence.closedWithFit,
  })
  if (!res.ok) return res

  revalidatePath('/settings')
  revalidatePath('/admin')
  return { ok: true, changed: res.result.changes.length }
}

/** Devuelve el tenant al modelo global (sin calibración propia). */
export async function resetTenantScoring(tenantId: string): Promise<{ ok: true } | Fail> {
  const ctx = await soloItmano()
  if (!ctx) return NO_AUTORIZADO
  if (!tenantId) return { ok: false, error: 'Selecciona un tenant desde el Centro de control.' }

  const res = await resetTenantCalibration({ tenantId, actorUserId: ctx.user_id })
  if (!res.ok) return res

  revalidatePath('/settings')
  revalidatePath('/admin')
  return { ok: true }
}
