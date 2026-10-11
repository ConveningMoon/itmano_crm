import type { NextRequest } from 'next/server'
import { responderLatido } from '@/lib/warm-handler'

// El mismo latido que /api/warm, pero DENTRO del matcher del proxy: lo usa
// DbWarmer al volver de una pausa (rutaDelLatido en src/lib/warm.ts) para que
// el proxy del borde de esa persona arranque antes de su primer clic. Sin
// sesión el proxy redirige a /login y la ruta no llega a ejecutarse.
export async function GET(request: NextRequest) {
  return responderLatido(request)
}
