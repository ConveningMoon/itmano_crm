import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { drainJob } from '@/lib/carousels/render'
import { logCarousel } from '@/lib/carousels/log'

// Red de seguridad del motor de carruseles.
//
// El camino normal es que startCarousel drene los slides en segundo plano con
// after(). Ese drenado vive dentro del maxDuration de SU invocación, así que un
// carrusel largo (tres imágenes de Nano Banana) puede quedarse a medias, y una
// invocación que muera del todo no deja a nadie terminando el trabajo. Este
// barrido recoge lo que quedó: slides en 'pending', en 'failed' y los colgados
// en 'rendering' cuya invocación nunca volvió (renderOneSlide los considera
// abandonados pasados 10 minutos y los vuelve a reclamar).
//
// Es idempotente: drainJob reclama cada slide con un UPDATE condicional, así
// que dos pasadas simultáneas nunca renderizan —ni pagan— el mismo slide dos veces.

export const maxDuration = 300

// Solo carruseles tocados en la última hora: más atrás es trabajo abandonado y
// no queremos que un barrido reviva algo de la semana pasada gastando imágenes.
const LOOKBACK_MS = 60 * 60 * 1000
// Techo por pasada para no agotar el presupuesto en un solo carrusel atascado.
const MAX_JOBS_PER_RUN = 3

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const dryRun = new URL(request.url).searchParams.get('dry_run') === 'true'

  try {
    const db = createAdminClient()
    const since = new Date(Date.now() - LOOKBACK_MS).toISOString()

    // Cualquier carrusel reciente que no haya llegado a 'ready'. El estado del
    // job lo deriva refreshJobStatus de sus slides, así que esto basta: si
    // quedaba algo por hacer, no está en 'ready'. Un job sin slides todavía
    // (aún redactando el copy) simplemente no da trabajo al drenado.
    const { data: jobs, error } = await db.from('carousel_jobs')
      .select('id')
      .neq('status', 'ready')
      .gte('updated_at', since)
      .order('updated_at', { ascending: true })
      .limit(MAX_JOBS_PER_RUN)
    if (error) throw error

    const jobIds = (jobs ?? []).map((j: { id: string }) => j.id)

    if (dryRun) {
      return NextResponse.json({ ok: true, dry_run: true, jobs_pendientes: jobIds.length, job_ids: jobIds })
    }

    const results: Record<string, unknown>[] = []
    for (const jobId of jobIds) {
      // Presupuesto por carrusel: lo que queda de la ventana, repartido para
      // que un job atascado no se coma el turno de los demás.
      const remaining = 280_000 - (Date.now() - startedAt)
      if (remaining < 20_000) break
      try {
        const r = await drainJob(jobId, { budgetMs: Math.min(remaining, 120_000) })
        results.push({ job_id: jobId, ...r })
        if (r.rendered > 0 || r.failed > 0) {
          await logCarousel({
            jobId, step: 'render',
            message: `Barrido automático: ${r.rendered} renderizado(s), ${r.failed} con error, ${r.skipped} ya en curso`,
            detail: { origin: 'cron', exhausted: r.exhausted },
          })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'error'
        results.push({ job_id: jobId, error: msg })
        await logCarousel({ jobId, level: 'error', step: 'render', message: `El barrido automático falló: ${msg}`, detail: { origin: 'cron' } })
      }
    }

    return NextResponse.json({ ok: true, jobs_revisados: results.length, duration_ms: Date.now() - startedAt, results })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    console.error(JSON.stringify({ service: 'carousel-render-cron', error: msg }))
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
