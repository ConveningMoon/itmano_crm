import type { NextRequest } from 'next/server'
import { responderLatido } from '@/lib/warm-handler'

// Latido directo: lo usan el cron de `vercel.json` cada minuto y DbWarmer
// mientras alguien usa el CRM (ver src/lib/warm.ts). /api queda fuera del
// matcher del proxy, así que la ruta se protege sola (src/lib/warm-handler.ts).
// El latido de vuelta tras una pausa va a /warm, que sí pasa por el proxy.
export async function GET(request: NextRequest) {
  return responderLatido(request)
}
