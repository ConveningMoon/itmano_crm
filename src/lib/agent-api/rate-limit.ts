import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ApiError } from './errors'
import type { AgentContext } from './auth'

// Ventana fija en Postgres: sin proveedor externo. Ver DESIGN.md §9.
export const LIMITS = { all: 120, write: 20 } as const

export type RateBucket = keyof typeof LIMITS

export interface RateLimitResult {
  headers: Record<string, string>
}

export async function checkRateLimit(
  ctx: Pick<AgentContext, 'tokenId'>,
  isWrite: boolean,
): Promise<Record<string, string>> {
  const admin   = createAdminClient()
  const buckets: RateBucket[] = isWrite ? ['all', 'write'] : ['all']
  let headers: Record<string, string> = {}

  for (const bucket of buckets) {
    const { data, error } = await admin.rpc('agent_api_rate_limit', {
      p_token_id: ctx.tokenId,
      p_bucket:   bucket,
      p_limit:    LIMITS[bucket],
      p_window_s: 60,
    })
    if (error) throw new ApiError('upstream_error', 'Rate limit check failed')

    const row = (Array.isArray(data) ? data[0] : data) as {
      allowed: boolean; remaining: number; reset_at: string
    }
    const resetEpoch = Math.ceil(new Date(row.reset_at).getTime() / 1000)

    // El cubo más restrictivo es el último evaluado, y es el que se reporta.
    headers = {
      'X-RateLimit-Limit':     String(LIMITS[bucket]),
      'X-RateLimit-Remaining': String(row.remaining),
      'X-RateLimit-Reset':     String(resetEpoch),
    }

    if (!row.allowed) {
      const retryAfter = Math.max(1, resetEpoch - Math.floor(Date.now() / 1000))
      throw new ApiError(
        'rate_limited',
        `Rate limit exceeded for bucket '${bucket}'`,
        { retry_after: retryAfter },
      )
    }
  }

  return headers
}
