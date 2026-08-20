import documento from '@/lib/agent-api/openapi.generated.json'

export const runtime = 'nodejs'

/**
 * El contrato, servido tal cual. Público a propósito: no hay nada que proteger
 * —los ejemplos salen del tenant demo sintético— y un contrato tras
 * autenticación es incómodo para generar clientes.
 *
 * Se sirve el MISMO archivo que se commitea en docs/agent-api/openapi.json, y
 * un test verifica que ambos sean idénticos: así lo publicado y lo documentado
 * no pueden separarse.
 */
export function GET() {
  return new Response(JSON.stringify(documento), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=300',
    },
  })
}
