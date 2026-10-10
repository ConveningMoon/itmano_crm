import { NextRequest, NextResponse, connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Toca la base por el mismo camino que una página (API REST → PostgREST →
// Postgres, con service_role) para que no se enfríe. Lo llama DbWarmer desde el
// navegador cada ~10 s mientras alguien usa el CRM, y puede llamarlo un
// programador externo con `Authorization: Bearer <CRON_SECRET>` para cubrir los
// huecos sin nadie conectado (ver src/lib/warm.ts).
//
// Sólo responde a una sesión válida o al secreto de cron: sin ellos no toca la
// base, así que no es un punto para generar carga anónima. /api queda fuera del
// matcher del proxy, de modo que la ruta se protege sola.
//
// La consulta es un conteo (HEAD): no devuelve ni lee filas de ningún tenant.
//
// `connection()`: con Cache Components un GET que no lee nada del request se
// prerenderiza en el build y respondería desde la caché sin tocar la base.
export async function GET(request: NextRequest) {
  await connection()

  const secreto = process.env.CRON_SECRET
  const viaCron = !!secreto && request.headers.get('authorization') === `Bearer ${secreto}`

  if (!viaCron) {
    const supabase = await createClient()
    const { data: claims } = await supabase.auth.getClaims()
    if (!claims) return respuesta(401)
  }

  const { error } = await createAdminClient()
    .from('tenants')
    .select('id', { head: true, count: 'exact' })

  return respuesta(error ? 503 : 204)
}

function respuesta(status: number) {
  return new NextResponse(null, { status, headers: { 'Cache-Control': 'no-store' } })
}
