import 'server-only'
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

// Rate limit de los endpoints públicos que crean leads desde el navegador
// (intake de páginas alojadas y embebidas, RSVP de open houses). Ventana fija
// en Postgres (`public_rate_limit`, migración 20261117150000): sin proveedor
// externo, igual que la API de agentes.
//
// Límites pensados para un evento real: en un check-in, decenas de asistentes
// comparten la IP del wifi del lugar. 30 envíos por minuto a la misma fuente
// desde una IP cubren eso con holgura y cortan un bucle automatizado.
//
// La IP nunca se guarda en claro: la clave es un hash. Las filas se purgan a
// la hora.
//
// Falla abierto: si la base no responde, el envío pasa. Perder un lead real
// por un fallo del limitador es peor que dejar pasar unos envíos de más.

export const PUBLIC_LIMITS = {
  /** Por IP y por fuente (publicId u open house). */
  perTarget: 30,
  /** Por IP, sumando todas las fuentes. */
  perIp:     60,
} as const

const WINDOW_S = 60

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  return first || request.headers.get('x-real-ip')?.trim() || 'unknown'
}

export function rateLimitKey(ip: string): string {
  return createHash('sha256').update(`public-rl:${ip}`).digest('hex').slice(0, 32)
}

export type PublicRateLimitResult = { allowed: true } | { allowed: false; retryAfter: number }

export async function checkPublicRateLimit(request: Request, target: string): Promise<PublicRateLimitResult> {
  const key = rateLimitKey(clientIp(request))
  const checks: [string, number][] = [
    [`target:${target}`, PUBLIC_LIMITS.perTarget],
    ['all', PUBLIC_LIMITS.perIp],
  ]

  try {
    const db = createAdminClient()
    for (const [bucket, limit] of checks) {
      const { data, error } = await db.rpc('public_rate_limit', {
        p_key: key, p_bucket: bucket, p_limit: limit, p_window_s: WINDOW_S,
      })
      if (error) throw new Error(error.message)
      const row = (Array.isArray(data) ? data[0] : data) as { allowed: boolean; reset_at: string } | null
      if (row && !row.allowed) {
        const retryAfter = Math.max(1, Math.ceil((Date.parse(row.reset_at) - Date.now()) / 1000))
        console.warn(JSON.stringify({ service: 'public-rate-limit', result: 'limited', bucket: bucket.split(':')[0], target }))
        return { allowed: false, retryAfter }
      }
    }
  } catch (e) {
    console.error(JSON.stringify({ service: 'public-rate-limit', result: 'check_failed', error: e instanceof Error ? e.message : 'unknown' }))
  }
  return { allowed: true }
}
