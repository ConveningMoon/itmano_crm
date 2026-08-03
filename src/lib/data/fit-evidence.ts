import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { BUY_DIMS } from '@/lib/scoring/vocabulary'
import {
  MIN_CLOSES_FOR_EVIDENCE, type FitEvidence, type BucketEvidence, type DimensionEvidence,
} from '@/lib/scoring/calibration'

// ── La evidencia que debe sustituir a la opinión ──────────────────────────────
//
// El orden de importancia de los factores lo pone una persona al dar de alta al
// cliente, porque al principio no hay otra cosa. Esto mide lo que hace falta
// para que deje de ser una opinión: de los leads que declararon cada respuesta,
// ¿cuántos terminaron cerrando?
//
// La dimensión que MÁS SEPARA a los que cierran de los que no es la que debería
// ir arriba del orden. La que da la misma tasa en todos sus buckets no está
// discriminando nada, por muchos puntos que reparta.
//
// Deliberadamente sin ML y sin regresión: son conteos sobre `leads`. Con las
// muestras que tiene una agencia inmobiliaria, un modelo daría una precisión
// falsa sobre los mismos datos.

const EMPTY: FitEvidence = { withFit: 0, closedWithFit: 0, enough: false, dimensions: [] }

export async function getFitEvidence(tenantId: string): Promise<FitEvidence> {
  const db = createAdminClient()
  const { data, error } = await db
    .from('leads')
    .select('fit_profile, stage')
    .eq('tenant_id', tenantId)
    .neq('fit_profile', '{}')
    .limit(5000)

  if (error) {
    console.error(JSON.stringify({ service: 'fit-evidence', error: error.message }))
    return EMPTY
  }

  const rows = (data ?? []) as { fit_profile: Record<string, unknown> | null; stage: string }[]
  if (rows.length === 0) return EMPTY

  const closedWithFit = rows.filter(r => r.stage === 'cerrado').length

  // { dimensión → { bucket → [leads, cerrados] } }
  const conteo = new Map<string, Map<string, [number, number]>>()
  for (const r of rows) {
    const cerrado = r.stage === 'cerrado' ? 1 : 0
    for (const [dim, val] of Object.entries(r.fit_profile ?? {})) {
      if (typeof val !== 'string') continue
      const porBucket = conteo.get(dim) ?? new Map<string, [number, number]>()
      const [n, c] = porBucket.get(val) ?? [0, 0]
      porBucket.set(val, [n + 1, c + cerrado])
      conteo.set(dim, porBucket)
    }
  }

  const dimensions: DimensionEvidence[] = BUY_DIMS.map(dimension => {
    const porBucket = conteo.get(dimension)
    const buckets: BucketEvidence[] = [...(porBucket ?? new Map())]
      .map(([matchValue, [leads, closed]]) => ({
        matchValue, leads, closed,
        closeRate: leads > 0 ? Math.round((closed / leads) * 100) : null,
      }))
      .sort((a, b) => (b.closeRate ?? -1) - (a.closeRate ?? -1))

    // Sólo buckets con muestra propia: un bucket con 1 lead que cerró da 100% y
    // arrastraría el spread entero.
    const tasas = buckets.filter(b => b.leads >= 5 && b.closeRate !== null).map(b => b.closeRate!)
    const spread = tasas.length >= 2 ? Math.max(...tasas) - Math.min(...tasas) : null

    return { dimension, buckets, spread }
  })

  return {
    withFit: rows.length,
    closedWithFit,
    enough: closedWithFit >= MIN_CLOSES_FOR_EVIDENCE,
    dimensions,
  }
}
