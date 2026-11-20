import 'server-only'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { OpsJobId } from '@/lib/ops/jobs'
import { heartbeatOutcome } from '@/lib/ops/heartbeat-outcome'

// Envuelve un route handler para que cada ejecución real deje su latido en
// `cron_heartbeats` (migración platform_ops). Se escribe con `after()`: la
// respuesta no espera a la base, y un fallo al escribir el latido nunca rompe el
// cron ni el webhook que envuelve.

interface HeartbeatOptions {
  /**
   * Sólo cuenta las llamadas que traen `Authorization: Bearer CRON_SECRET`.
   * Para rutas que también llaman los navegadores (el latido de /api/warm cada
   * ~10 s mientras alguien usa el CRM): esas no son el cron.
   */
  requireCronAuth?: boolean
}

export function withHeartbeat<Req extends Request, Ctx extends unknown[]>(
  job: OpsJobId,
  handler: (request: Req, ...ctx: Ctx) => Promise<Response>,
  opts: HeartbeatOptions = {},
): (request: Req, ...ctx: Ctx) => Promise<Response> {
  return async (request, ...ctx) => {
    const started = Date.now()
    const eligible = isEligible(request, opts)

    let response: Response
    try {
      response = await handler(request, ...ctx)
    } catch (err) {
      if (eligible) schedule(job, { ok: false, error: err instanceof Error ? err.message : String(err) }, started, null)
      throw err
    }

    if (eligible) {
      const outcome = heartbeatOutcome(response.status)
      if (outcome !== 'skip') schedule(job, { ok: outcome === 'ok', error: outcome === 'ok' ? null : `HTTP ${response.status}` }, started, response.status)
    }
    return response
  }
}

function isEligible(request: Request, opts: HeartbeatOptions): boolean {
  const url = new URL(request.url)
  // Una prueba manual con dry_run no es una ejecución del job.
  if (url.searchParams.get('dry_run') === 'true') return false
  if (!opts.requireCronAuth) return true
  const secret = process.env.CRON_SECRET
  return !!secret && request.headers.get('authorization') === `Bearer ${secret}`
}

function schedule(job: OpsJobId, result: { ok: boolean; error: string | null }, started: number, status: number | null): void {
  const run = async () => {
    try {
      const { error } = await createAdminClient().rpc('record_heartbeat', {
        p_job:         job,
        p_ok:          result.ok,
        p_duration_ms: Date.now() - started,
        p_error:       result.error ?? undefined,
        p_detail:      status === null ? undefined : { status },
      })
      if (error) console.error(JSON.stringify({ service: 'heartbeat', job, error: error.message }))
    } catch (err) {
      console.error(JSON.stringify({ service: 'heartbeat', job, error: String(err) }))
    }
  }
  try {
    after(run)
  } catch {
    // Fuera de un request de Next (scripts, tests) no hay `after`: se lanza sin esperar.
    void run()
  }
}
