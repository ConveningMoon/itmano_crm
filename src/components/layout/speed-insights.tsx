'use client'

import { useEffect, useRef } from 'react'
import { useParams, usePathname } from 'next/navigation'
import { rutaConPatron } from '@/lib/speed-insights'

declare global {
  interface Window {
    si?: (...args: unknown[]) => void
    siq?: unknown[][]
  }
}

/**
 * Vercel Speed Insights sin el paquete `@vercel/speed-insights`.
 *
 * El paquete no se puede instalar: su peer opcional `@sveltejs/kit` arrastra
 * `vite@8` y choca con el `vite@5` de vitest. Forzarlo con
 * `--legacy-peer-deps` saca `react-is` del lockfile (lo necesita recharts) y
 * el `npm ci` limpio, que es lo que hace Vercel, falla.
 *
 * Lo que hace el paquete en Next es esto y nada más: cargar el script que
 * Vercel sirve en el propio dominio y decirle en qué ruta está el usuario.
 * El script mide LCP, INP, CLS, FCP y TTFB en el navegador y los envía a
 * Vercel. Sólo existe en deploys de Vercel con Speed Insights activado en el
 * panel; por eso el layout lo monta únicamente en producción.
 */
export function SpeedInsights() {
  const pathname = usePathname()
  const params = useParams()
  const ruta = rutaConPatron(pathname, params)
  const script = useRef<HTMLScriptElement | null>(null)

  useEffect(() => {
    if (!script.current) {
      // Cola que el script vacía al cargar, igual que la del paquete.
      window.si ??= (...args: unknown[]) => { (window.siq ??= []).push(args) }
      // Vercel puede servir el script bajo un path propio del proyecto.
      const base = process.env.NEXT_PUBLIC_VERCEL_OBSERVABILITY_BASEPATH
      const s = document.createElement('script')
      s.src = base ? `${base}/speed-insights/script.js` : '/_vercel/speed-insights/script.js'
      s.defer = true
      document.head.appendChild(s)
      script.current = s
    }
    // El script lee la ruta de este atributo en cada medición.
    if (ruta) script.current.dataset.route = ruta
  }, [ruta])

  return null
}
