'use client'

import { m } from 'motion/react'

// Contador de no leídas sobre la campana. Va en su propio componente cliente
// porque el layout lo monta desde un <Suspense> server-side: el número llega
// por streaming y la campana (con su navegación) ya está pintada.
export function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <m.span
      key={count}
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 26 }}
      className="unread-badge"
      aria-label={`${count} sin leer`}
    >
      {count > 9 ? '9+' : count}
    </m.span>
  )
}
