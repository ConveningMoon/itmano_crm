import type { NextRequest } from 'next/server'
import { responderLatido } from '@/lib/warm-handler'

// El latido: lo usan el cron de `vercel.json` cada minuto y DbWarmer mientras
// alguien usa el CRM (ver src/lib/warm.ts). /api queda fuera del matcher del
// proxy, así que la ruta se protege sola (src/lib/warm-handler.ts). El camino
// de las páginas lo calienta /latido, que DbWarmer pide al volver de una pausa.
export async function GET(request: NextRequest) {
  return responderLatido(request)
}
