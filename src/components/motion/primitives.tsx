'use client'

import { m, type Variants } from 'motion/react'

export const EASE_OUT_PREMIUM = [0.22, 1, 0.36, 1] as const

interface FadeInProps {
  children: React.ReactNode
  delay?: number
  y?: number
  className?: string
  style?: React.CSSProperties
}

// Entrada estándar de contenido: fade + translateY(8px) → 0, 350ms.
// Server Components la usan pasando su JSX como children (patrón isla).
export function FadeIn({ children, delay = 0, y = 8, className, style }: FadeInProps) {
  return (
    <m.div
      className={className}
      style={style}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: EASE_OUT_PREMIUM }}
    >
      {children}
    </m.div>
  )
}

const groupVariants: Variants = {
  hidden: {},
  visible: (stagger: number) => ({
    transition: { staggerChildren: stagger },
  }),
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: EASE_OUT_PREMIUM },
  },
}

interface StaggerGroupProps {
  children: React.ReactNode
  stagger?: number
  className?: string
  style?: React.CSSProperties
}

// Grupo escalonado: cada StaggerItem hijo entra con 50ms de separación.
// Máximo recomendado ~8 items animados (ver README).
export function StaggerGroup({ children, stagger = 0.05, className, style }: StaggerGroupProps) {
  return (
    <m.div
      className={className}
      style={style}
      custom={stagger}
      initial="hidden"
      animate="visible"
      variants={groupVariants}
    >
      {children}
    </m.div>
  )
}

interface StaggerItemProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export function StaggerItem({ children, className, style }: StaggerItemProps) {
  return (
    <m.div className={className} style={style} variants={itemVariants}>
      {children}
    </m.div>
  )
}
