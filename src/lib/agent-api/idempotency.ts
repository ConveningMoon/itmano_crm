import 'server-only'
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { ApiError } from './errors'
import type { AgentContext } from './auth'

// Huella de la petición. Las claves de los objetos se ordenan para que el orden
// del JSON no cuente como una petición distinta; el orden de los ARRAYS sí se
// respeta, porque ahí el orden es dato, no ruido de serialización.
export function requestHash(method: string, path: string, body: unknown): string {
  const canonical = JSON.stringify(body, (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b)),
        )
      : value,
  )
  return createHash('sha256')
    .update(`${method}\n${path}\n${canonical ?? 'null'}`)
    .digest('hex')
}

export type IdempotentStart =
  | { replay: Response }
  | { commit: (res: Response) => Promise<void> }

// Reserva la key ANTES de ejecutar: la clave primaria (tenant_id, key) resuelve
// la carrera entre dos peticiones simultáneas con la misma key — la segunda
// choca contra el índice único y cae al camino de conflicto.
export async function beginIdempotent(
  ctx: AgentContext,
  key: string,
  hash: string,
): Promise<IdempotentStart> {
  const admin = createAdminClient()

  const { error: insertError } = await admin.from('agent_idempotency_keys').insert({
    tenant_id:    ctx.tenantId,
    key,
    request_hash: hash,
    state:        'in_flight',
  })

  if (!insertError) {
    return {
      commit: async (res: Response) => {
        const body = await res.clone().json().catch(() => null)
        await admin.from('agent_idempotency_keys')
          .update({ state: 'done', response_status: res.status, response_body: body })
          .eq('tenant_id', ctx.tenantId)
          .eq('key', key)
      },
    }
  }

  const { data: existing } = await admin.from('agent_idempotency_keys')
    .select('request_hash, state, response_status, response_body')
    .eq('tenant_id', ctx.tenantId)
    .eq('key', key)
    .maybeSingle()

  if (!existing) throw new ApiError('upstream_error', 'Idempotency store unavailable')

  if (existing.request_hash !== hash) {
    throw new ApiError(
      'idempotency_key_reuse',
      'This Idempotency-Key was already used with a different request body',
    )
  }

  if (existing.state === 'in_flight') {
    throw new ApiError(
      'idempotency_key_in_flight',
      'A request with this Idempotency-Key is still in flight; retry shortly',
    )
  }

  return {
    replay: new Response(JSON.stringify(existing.response_body), {
      status: existing.response_status ?? 200,
      headers: {
        'content-type':        'application/json',
        'Idempotency-Replayed': 'true',
      },
    }),
  }
}
