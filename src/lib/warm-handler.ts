import 'server-only'
import { NextRequest, NextResponse, connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { opcionesClaims } from '@/lib/supabase/jwks'
import { debeRenovarSesion } from '@/lib/warm'

// El latido que sirven /api/warm y /warm (reglas y motivo en src/lib/warm.ts).
//
// Toca la base por el mismo camino que una página (API REST → PostgREST →
// Postgres, con service_role) para que no se enfríe. Sólo responde a una
// sesión válida o al secreto de cron (Vercel manda `Authorization: Bearer
// <CRON_SECRET>`): sin ellos no toca la base, así que no es un punto para
// generar carga anónima.
//
// La consulta es un conteo (HEAD): no devuelve ni lee filas de ningún tenant.
//
// Con sesión, además, renueva el token antes de que caduque. Las cookies nuevas
// salen en esta misma respuesta.
//
// `connection()`: con Cache Components un GET que no lee nada del request se
// prerenderiza en el build y respondería desde la caché sin tocar la base.
export async function responderLatido(request: NextRequest) {
  await connection()

  const secreto = process.env.CRON_SECRET
  const viaCron = !!secreto && request.headers.get('authorization') === `Bearer ${secreto}`

  if (!viaCron) {
    const supabase = await createClient()
    const { data: claims } = await supabase.auth.getClaims(undefined, opcionesClaims)
    if (!claims) return respuesta(401)
    // Si falla (Auth caído), el siguiente latido lo vuelve a intentar.
    if (debeRenovarSesion(claims.claims.exp, Date.now())) await supabase.auth.refreshSession()
  }

  const { error } = await createAdminClient()
    .from('tenants')
    .select('id', { head: true, count: 'exact' })

  return respuesta(error ? 503 : 204)
}

function respuesta(status: number) {
  return new NextResponse(null, { status, headers: { 'Cache-Control': 'no-store' } })
}
