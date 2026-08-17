import 'server-only'
import { authenticate, requireScope, type AgentContext, type Scope } from './auth'
import { checkRateLimit } from './rate-limit'
import { beginIdempotent, requestHash } from './idempotency'
import { withDeadline, DEADLINES, type DeadlineKind } from './deadline'
import { ApiError, errorResponse } from './errors'

export interface RouteOptions {
  /** Scope exigido. `write` implica también consumir el cubo de escrituras. */
  scope: Scope
  /** Clase de endpoint: fija el presupuesto de tiempo. */
  kind: DeadlineKind
  handler: (
    ctx: AgentContext,
    req: Request,
    params: Record<string, string>,
  ) => Promise<unknown>
}

type RouteContext = { params: Promise<Record<string, string>> }

/**
 * Compone una ruta de /agent/v1. El orden es fijo y deliberado:
 *
 *   autenticar → scope → rate limit → idempotencia → deadline → handler
 *
 * El scope se comprueba ANTES del rate limit para que un token sin permiso no
 * consuma cuota ajena, y la idempotencia reserva antes de ejecutar para que dos
 * peticiones simultáneas con la misma key no produzcan dos efectos.
 */
export function defineRoute(opts: RouteOptions) {
  return async function route(req: Request, routeCtx: RouteContext): Promise<Response> {
    let rateHeaders: Record<string, string> = {}

    try {
      const ctx = await authenticate(req)
      requireScope(ctx, opts.scope)

      rateHeaders = await checkRateLimit(ctx, opts.scope === 'write')

      const params  = await routeCtx.params
      const isWrite = opts.scope === 'write'

      const run = async (): Promise<Response> => {
        const data = await withDeadline(
          opts.handler(ctx, req, params),
          DEADLINES[opts.kind],
        )
        return new Response(JSON.stringify(data), {
          status:  isWrite ? 201 : 200,
          headers: { 'content-type': 'application/json', ...rateHeaders },
        })
      }

      const key = req.headers.get('idempotency-key')
      if (!isWrite || !key) return await run()

      const body  = await req.clone().json().catch(() => null)
      const begun = await beginIdempotent(
        ctx, key, requestHash(req.method, new URL(req.url).pathname, body))

      if ('replay' in begun) return begun.replay

      const res = await run()
      await begun.commit(res)
      return res
    } catch (err) {
      const retryHeader: Record<string, string> = {}
      if (err instanceof ApiError && err.code === 'rate_limited') {
        const retryAfter = (err.details as { retry_after?: number } | undefined)?.retry_after
        if (typeof retryAfter === 'number') {
          retryHeader['Retry-After'] = String(retryAfter)
        }
      }

      return errorResponse(err, { ...rateHeaders, ...retryHeader })
    }
  }
}
