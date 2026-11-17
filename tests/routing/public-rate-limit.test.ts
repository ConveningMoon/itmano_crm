import { describe, it, expect, vi, beforeEach } from 'vitest'

// Endpoints públicos que crean leads (intake, RSVP): sin límite, un bucle podía
// crear leads, notificaciones y análisis de IA pagados sin freno.

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { checkPublicRateLimit, clientIp, rateLimitKey } from '@/lib/security/public-rate-limit'

const mockAdmin = createAdminClient as unknown as ReturnType<typeof vi.fn>

function req(headers: Record<string, string> = {}) {
  return new Request('https://app.example.com/api/intake/x/submit', { method: 'POST', headers })
}

beforeEach(() => mockAdmin.mockReset())

describe('clientIp / rateLimitKey', () => {
  it('toma la primera IP de x-forwarded-for y cae a x-real-ip', () => {
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7')
    expect(clientIp(req({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2')
    expect(clientIp(req())).toBe('unknown')
  })

  it('nunca guarda la IP en claro', () => {
    const k = rateLimitKey('203.0.113.7')
    expect(k).not.toContain('203')
    expect(k).toHaveLength(32)
    expect(rateLimitKey('203.0.113.7')).toBe(k)
  })
})

describe('checkPublicRateLimit', () => {
  it('permite mientras ambos cubos permiten', async () => {
    type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>
    const rpc = vi.fn<Rpc>(async () => ({ data: [{ allowed: true, remaining: 5, reset_at: new Date(Date.now() + 30_000).toISOString() }], error: null }))
    mockAdmin.mockReturnValue({ rpc })
    expect(await checkPublicRateLimit(req({ 'x-forwarded-for': '203.0.113.7' }), 'intake:abc')).toEqual({ allowed: true })
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_bucket: 'target:intake:abc', p_limit: 30 })
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_bucket: 'all', p_limit: 60 })
  })

  it('bloquea con Retry-After cuando un cubo se agota', async () => {
    const rpc = vi.fn(async () => ({ data: [{ allowed: false, remaining: 0, reset_at: new Date(Date.now() + 20_000).toISOString() }], error: null }))
    mockAdmin.mockReturnValue({ rpc })
    const res = await checkPublicRateLimit(req(), 'rsvp:1')
    expect(res.allowed).toBe(false)
    if (!res.allowed) expect(res.retryAfter).toBeGreaterThanOrEqual(1)
  })

  it('falla abierto si la base no responde', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'timeout' } }))
    mockAdmin.mockReturnValue({ rpc })
    expect(await checkPublicRateLimit(req(), 'intake:abc')).toEqual({ allowed: true })
  })
})
