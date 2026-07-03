'use client'

import { m } from 'motion/react'
import { EASE_OUT_PREMIUM } from './primitives'

interface GrowBarProps {
  axis?: 'x' | 'y'
  delay?: number
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}

// Elemento firma del rediseño: una barra que crece al entrar (600ms). El caller
// define tamaño y color vía style con tokens; esto solo aporta la escala.
// axis='x' crece desde la izquierda, axis='y' desde abajo.
export function GrowBar({ axis = 'x', delay = 0, className, style, children }: GrowBarProps) {
  const scaleProp = axis === 'x' ? 'scaleX' : 'scaleY'
  return (
    <m.div
      className={className}
      style={{
        ...style,
        transformOrigin: axis === 'x' ? 'left center' : 'center bottom',
      }}
      initial={{ [scaleProp]: 0 }}
      animate={{ [scaleProp]: 1 }}
      transition={{ duration: 0.6, delay, ease: EASE_OUT_PREMIUM }}
    >
      {children}
    </m.div>
  )
}
