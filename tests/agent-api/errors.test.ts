import { describe, it, expect } from 'vitest'
import { ApiError, errorResponse, type ApiErrorCode } from '@/lib/agent-api/errors'

describe('taxonomía de errores', () => {
  it('mapea cada código a su status y su retryable', async () => {
    const cases: [ApiErrorCode, number, boolean][] = [
      ['invalid_arguments',         400, false],
      ['unauthorized',              401, false],
      ['insufficient_scope',        403, false],
      ['not_found',                 404, false],
      ['idempotency_key_reuse',     409, false],
      ['idempotency_key_in_flight', 409, true],
      ['unprocessable',             422, false],
      ['rate_limited',              429, true],
      ['upstream_error',            500, true],
      ['timeout',                   504, true],
    ]

    for (const [code, status, retryable] of cases) {
      const res = errorResponse(new ApiError(code, 'mensaje de prueba'))
      expect(res.status, code).toBe(status)

      const body = await res.json()
      expect(body.error.code, code).toBe(code)
      expect(body.error.retryable, code).toBe(retryable)
      expect(typeof body.error.message).toBe('string')
    }
  })

  it('responde siempre con content-type json', () => {
    const res = errorResponse(new ApiError('not_found', 'x'))
    expect(res.headers.get('content-type')).toBe('application/json')
  })

  it('convierte un error desconocido en upstream_error sin filtrar el mensaje', async () => {
    const res = errorResponse(new Error('postgres://usuario:clave@host:5432/db'))
    expect(res.status).toBe(500)

    const body = await res.json()
    expect(body.error.code).toBe('upstream_error')
    expect(body.error.message).not.toContain('postgres://')
    expect(body.error.message).not.toContain('clave')
  })

  it('incluye details solo cuando el error los trae', async () => {
    const con = await errorResponse(new ApiError('unprocessable', 'x', { field: 'email' })).json()
    expect(con.error.details).toEqual({ field: 'email' })

    const sin = await errorResponse(new ApiError('not_found', 'x')).json()
    expect('details' in sin.error).toBe(false)
  })

  it('propaga headers adicionales', () => {
    const res = errorResponse(new ApiError('rate_limited', 'x'), { 'Retry-After': '30' })
    expect(res.headers.get('Retry-After')).toBe('30')
    expect(res.status).toBe(429)
  })
})
