import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/agent-api/errors'

// authenticate y checkRateLimit pegan a la base; se mockean. requireScope es
// puro y se deja real, que es justo lo que queremos ejercitar.
const mockAuthenticate = vi.fn()
const mockRateLimit    = vi.fn()
const mockBegin        = vi.fn()

vi.mock('@/lib/agent-api/auth', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/agent-api/auth')>()
  return { ...real, authenticate: (req: Request) => mockAuthenticate(req) }
})
vi.mock('@/lib/agent-api/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockRateLimit(...args),
}))
vi.mock('@/lib/agent-api/idempotency', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/agent-api/idempotency')>()
  return { ...real, beginIdempotent: (...args: unknown[]) => mockBegin(...args) }
})

const { defineRoute } = await import('@/lib/agent-api/handler')

const CTX = {
  tokenId: 'tok-1', tenantId: 'tenant-demo', tenantName: 'Demo',
  scopes: ['read'], expiresAt: '2026-12-01T00:00:00.000Z', db: {} as never,
}
const HEADERS = {
  'X-RateLimit-Limit': '120', 'X-RateLimit-Remaining': '119', 'X-RateLimit-Reset': '1800000000',
}
const sinParams = { params: Promise.resolve({}) }

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticate.mockResolvedValue(CTX)
  mockRateLimit.mockResolvedValue(HEADERS)
})

describe('defineRoute', () => {
  it('devuelve 401 sin autenticar y NO llega al handler', async () => {
    mockAuthenticate.mockRejectedValue(new ApiError('unauthorized', 'no token'))
    const handler = vi.fn()
    const route = defineRoute({ scope: 'read', kind: 'read', handler })

    const res = await route(new Request('http://x/agent/v1/leads'), sinParams)

    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it('devuelve 200 con JSON y los headers de rate limit', async () => {
    const route = defineRoute({
      scope: 'read', kind: 'read',
      handler: async () => ({ data: [{ id: 'lead-1' }], next_cursor: null }),
    })

    const res = await route(new Request('http://x/agent/v1/leads'), sinParams)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('119')
    expect(await res.json()).toEqual({ data: [{ id: 'lead-1' }], next_cursor: null })
  })

  it('rechaza con 403 si falta el scope, sin llegar al handler ni a la base', async () => {
    const handler = vi.fn()
    const route = defineRoute({ scope: 'write', kind: 'write', handler })

    const res = await route(
      new Request('http://x/agent/v1/notes', { method: 'POST', body: '{}' }), sinParams)

    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('insufficient_scope')
    expect(handler).not.toHaveBeenCalled()
    expect(mockRateLimit).not.toHaveBeenCalled()
  })

  it('el 429 lleva Retry-After tomado de los details del error', async () => {
    mockRateLimit.mockRejectedValue(
      new ApiError('rate_limited', 'demasiadas', { retry_after: 37 }))
    const route = defineRoute({ scope: 'read', kind: 'read', handler: async () => ({}) })

    const res = await route(new Request('http://x/agent/v1/leads'), sinParams)

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('37')
    expect((await res.json()).error.retryable).toBe(true)
  })

  it('un handler que se pasa del presupuesto devuelve 504 timeout', async () => {
    const route = defineRoute({
      scope: 'read', kind: 'read',
      handler: () => new Promise(resolve => setTimeout(resolve, 9000)),
    })

    const res = await route(new Request('http://x/agent/v1/leads'), sinParams)

    expect(res.status).toBe(504)
    expect((await res.json()).error.code).toBe('timeout')
  }, 20000)

  it('una escritura correcta devuelve 201', async () => {
    mockAuthenticate.mockResolvedValue({ ...CTX, scopes: ['read', 'write'] })
    const route = defineRoute({
      scope: 'write', kind: 'write', handler: async () => ({ id: 'nota-1' }),
    })

    const res = await route(
      new Request('http://x/agent/v1/notes', { method: 'POST', body: '{}' }), sinParams)

    expect(res.status).toBe(201)
    expect(mockBegin).not.toHaveBeenCalled() // sin Idempotency-Key no se reserva
  })

  it('con Idempotency-Key repetida devuelve la respuesta guardada sin reejecutar', async () => {
    mockAuthenticate.mockResolvedValue({ ...CTX, scopes: ['read', 'write'] })
    mockBegin.mockResolvedValue({
      replay: new Response(JSON.stringify({ id: 'nota-1' }), {
        status: 201, headers: { 'Idempotency-Replayed': 'true' },
      }),
    })
    const handler = vi.fn()
    const route = defineRoute({ scope: 'write', kind: 'write', handler })

    const res = await route(new Request('http://x/agent/v1/notes', {
      method: 'POST', body: '{"a":1}', headers: { 'Idempotency-Key': 'k-1' },
    }), sinParams)

    expect(res.headers.get('Idempotency-Replayed')).toBe('true')
    expect(await res.json()).toEqual({ id: 'nota-1' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('un error inesperado del handler sale como upstream_error sin filtrar detalle', async () => {
    const route = defineRoute({
      scope: 'read', kind: 'read',
      handler: async () => { throw new Error('postgres://user:clave@host/db') },
    })

    const res = await route(new Request('http://x/agent/v1/leads'), sinParams)
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error.code).toBe('upstream_error')
    expect(body.error.message).not.toContain('clave')
  })

  it('pasa los params de ruta al handler', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true })
    const route = defineRoute({ scope: 'read', kind: 'read', handler })

    await route(new Request('http://x/agent/v1/leads/lead-9'),
      { params: Promise.resolve({ id: 'lead-9' }) })

    expect(handler).toHaveBeenCalledWith(CTX, expect.anything(), { id: 'lead-9' })
  })
})
