import { Suspense } from 'react'
import type { Metadata } from 'next'
import { connection } from 'next/server'

// Página vacía que DbWarmer pide al volver de una pausa (src/lib/warm.ts).
// Tiene que ser una PÁGINA: en producción, tras ~10 minutos sin tráfico, el
// recargo de la primera página está sobre todo en el camino propio de las
// páginas, y un Route Handler como /api/warm no lo calienta (medido el
// 2026-10-11). Al estar dentro del matcher, también calienta el proxy del
// borde de esa persona. Sin sesión, el proxy redirige a /login.
//
// El hueco dinámico obliga a que cada petición llegue a la función. Sin él,
// Cache Components la prerenderizaría entera y saldría del CDN sin despertar
// nada. No lee datos ni pinta nada.
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default function Latido() {
  return (
    <Suspense>
      <Pulso />
    </Suspense>
  )
}

async function Pulso() {
  await connection()
  return null
}
