'use client'

import { usePathname } from 'next/navigation'
import { m } from 'motion/react'
import { EASE_OUT_PREMIUM } from '@/components/motion/primitives'

// Entrada única de página para todo el dashboard. El template del grupo solo
// se remonta cuando cambia el segmento superior (docs de template.js), así que
// el key por pathname garantiza la entrada también en navegaciones profundas
// (/leads → /leads/[id]). Los search params no disparan re-animación.
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <m.div
      key={pathname}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: EASE_OUT_PREMIUM }}
    >
      {children}
    </m.div>
  )
}
