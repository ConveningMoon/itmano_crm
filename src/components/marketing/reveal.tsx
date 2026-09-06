'use client'

import { m } from 'motion/react'
import { EASE_OUT_PREMIUM } from '@/components/motion/primitives'

interface RevealProps {
  children: React.ReactNode
  delay?: number
  y?: number
  className?: string
  style?: React.CSSProperties
}

// Scroll-reveal para la landing: fade + translateY al entrar al viewport, una
// sola vez. Variante de FadeIn (que anima en mount) para páginas largas donde
// el contenido está fuera de pantalla. MotionConfig global cubre reduced-motion.
export function Reveal({ children, delay = 0, y = 16, className, style }: RevealProps) {
  return (
    <m.div
      className={className}
      style={style}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2, margin: '0px 0px -48px 0px' }}
      transition={{ duration: 0.5, delay, ease: EASE_OUT_PREMIUM }}
    >
      {children}
    </m.div>
  )
}
