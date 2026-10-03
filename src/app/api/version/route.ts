import { NextResponse } from 'next/server'

// Qué deploy está sirviendo producción AHORA. Lo consulta NewVersionNotice
// para saber si la pestaña abierta se ha quedado atrás.
//
// El cliente lo pide sin cookies (`credentials: 'omit'`) y sin las cabeceras
// de Skew Protection, así que Vercel lo enruta al deploy actual y no al de la
// pestaña. Es público como todo /api (el matcher del proxy lo excluye) y sólo
// expone el id del deployment, que ya viaja en el `?dpl=` de cada asset.
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json(
    { version: process.env.VERCEL_DEPLOYMENT_ID ?? null },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
