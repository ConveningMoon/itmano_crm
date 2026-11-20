import type { NextRequest } from 'next/server'
import { responderLatido } from '@/lib/warm-handler'
import { withHeartbeat } from '@/lib/ops/heartbeat'

// El latido: lo usan el cron de `vercel.json` cada minuto y DbWarmer mientras
// alguien usa el CRM (ver src/lib/warm.ts). /api queda fuera del matcher del
// proxy, así que la ruta se protege sola (src/lib/warm-handler.ts). El camino
// de las páginas lo calienta /latido, que DbWarmer pide al volver de una pausa.
// Sólo la llamada del cron (con CRON_SECRET) deja latido: los navegadores lo
// piden cada ~10 s y no dicen nada de si el cron corre.
export const GET = withHeartbeat('cron:warm', (request: NextRequest) => responderLatido(request), { requireCronAuth: true })
