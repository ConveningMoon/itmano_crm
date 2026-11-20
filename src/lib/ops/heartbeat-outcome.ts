// Qué significa el status de una respuesta para el latido. Puro, para test.
//
//   401/403 → 'skip': alguien llamó sin el secreto o con una firma inválida.
//             No fue una ejecución del job y no debe parecerlo.
//   5xx     → 'fail': el job corrió y falló.
//   resto   → 'ok':   corrió. Un 4xx de un webhook (evento ignorado, datos que
//             no aplican) cuenta como procesado.
export type HeartbeatOutcome = 'ok' | 'fail' | 'skip'

export function heartbeatOutcome(status: number): HeartbeatOutcome {
  if (status === 401 || status === 403) return 'skip'
  if (status >= 500) return 'fail'
  return 'ok'
}
