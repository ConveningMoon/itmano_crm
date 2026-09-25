// Traza de round-trips a Supabase, apagada por defecto.
//
// Con SUPABASE_TRACE=1 cada request del cliente server/admin escribe una línea
// JSON con método, ruta REST, estado, inicio y duración. Sirve para ver
// cascadas: dos consultas cuyo `start` coincide van en paralelo; si una empieza
// cuando termina la otra, el código las serializó.
//
// Sólo se registra el pathname (tabla o RPC). Los query params llevan filtros
// con ids y emails, así que nunca salen al log.

type Fetch = typeof fetch

export function supabaseTraceFetch(client: 'server' | 'admin'): Fetch | undefined {
  if (process.env.SUPABASE_TRACE !== '1') return undefined

  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    const start = Date.now()
    let status = 0
    try {
      const response = await fetch(input, init)
      status = response.status
      return response
    } finally {
      console.log(JSON.stringify({
        trace: 'supabase',
        client,
        method,
        path: url.pathname.replace(/^\/(rest|auth|storage)\/v1/, '$1'),
        status,
        start,
        ms: Date.now() - start,
      }))
    }
  }
}
