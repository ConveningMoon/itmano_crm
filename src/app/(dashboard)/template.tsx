'use client'

import { Suspense, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

// Entrada única de página para todo el dashboard.
//
// La entrada es una animación CSS (.page-enter en globals.css), no motion/react:
// así corre en la primera pintura del HTML. Con Cache Components ese HTML es el
// shell prerenderizado que sale del CDN, y un `initial={{ opacity: 0 }}` lo
// dejaría invisible —skeleton incluido— hasta que hidrate el JS.
//
// El template sólo se remonta cuando cambia el segmento superior (docs de
// template.js); en navegaciones profundas (/leads → /leads/[id]) la entrada la
// repite ReplayEntrance. Los search params no disparan re-animación.
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-enter">
      {/* Lee la ruta, que en el prerender de una ruta con parámetros no se
          conoce: va en su propio <Suspense> para no sacar la página del shell. */}
      <Suspense fallback={null}>
        <ReplayEntrance />
      </Suspense>
      {children}
    </div>
  )
}

const ENTRANCE: Keyframe[] = [
  { opacity: 0, transform: 'translateY(6px)' },
  { opacity: 1, transform: 'none' },
]

function ReplayEntrance() {
  const pathname = usePathname()
  const marker = useRef<HTMLSpanElement>(null)
  const first = useRef(pathname)

  useEffect(() => {
    // La primera pintura ya la anima el CSS.
    if (pathname === first.current) return
    first.current = pathname
    const wrapper = marker.current?.parentElement
    if (!wrapper || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    wrapper.animate(ENTRANCE, { duration: 250, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
  }, [pathname])

  return <span ref={marker} hidden />
}
