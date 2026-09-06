import 'server-only'

// Taxonomía de errores de /agent/v1. Cada código es una cadena estable: los
// consumidores mapean por `code`, nunca por status HTTP. Ver docs/agent-api/DESIGN.md §8
// para la tabla de correspondencia con los códigos de CONDUIT.
export type ApiErrorCode =
  | 'invalid_arguments'
  | 'unauthorized'
  | 'insufficient_scope'
  | 'not_found'
  | 'idempotency_key_reuse'
  | 'idempotency_key_in_flight'
  | 'unprocessable'
  | 'rate_limited'
  | 'upstream_error'
  | 'timeout'

const SPEC: Record<ApiErrorCode, { status: number; retryable: boolean }> = {
  invalid_arguments:         { status: 400, retryable: false },
  unauthorized:              { status: 401, retryable: false },
  insufficient_scope:        { status: 403, retryable: false },
  not_found:                 { status: 404, retryable: false },
  idempotency_key_reuse:     { status: 409, retryable: false },
  idempotency_key_in_flight: { status: 409, retryable: true  },
  unprocessable:             { status: 422, retryable: false },
  rate_limited:              { status: 429, retryable: true  },
  upstream_error:            { status: 500, retryable: true  },
  timeout:                   { status: 504, retryable: true  },
}

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function statusFor(code: ApiErrorCode): number {
  return SPEC[code].status
}

// Un error no previsto NUNCA expone su mensaje: puede llevar cadenas de conexión,
// fragmentos de query o valores de fila. Se registra completo en el log del
// servidor y al cliente le llega un mensaje genérico.
export function errorResponse(
  err: unknown,
  headers: Record<string, string> = {},
): Response {
  const known = err instanceof ApiError

  if (!known) {
    console.error(JSON.stringify({
      service: 'agent-api',
      error:   'unhandled',
      detail:  err instanceof Error ? err.message : String(err),
    }))
  }

  const code    = known ? err.code : 'upstream_error'
  const spec    = SPEC[code]
  const message = known ? err.message : 'Internal error'

  return new Response(JSON.stringify({
    error: {
      code,
      message,
      retryable: spec.retryable,
      ...(known && err.details !== undefined ? { details: err.details } : {}),
    },
  }), {
    status:  spec.status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}
