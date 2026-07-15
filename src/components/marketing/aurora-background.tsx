'use client'

import { m } from 'motion/react'
import { usePrefersReducedMotion } from '@/components/motion/use-prefers-reduced-motion'

interface Blob {
  color: string
  size: number
  top: string
  left: string
  x: [number, number, number]
  y: [number, number, number]
  duration: number
}

// Tres blobs de color a máxima difusión (blur 90–120px) que derivan muy
// lentamente detrás del contenido — la "libertad" de color que el CRM no se
// permite (allí un solo halo dorado), aquí con la paleta completa de acentos.
// Nunca interactivo, nunca sobre texto sin overlay: aria-hidden + pointer-events:none.
const BLOBS: Blob[] = [
  { color: 'var(--accent-gold)',  size: 620, top: '-16%', left: '54%',  x: [0, 50, 0],   y: [0, -30, 0], duration: 22 },
  { color: 'var(--accent-blue)',  size: 540, top: '12%',  left: '-12%', x: [0, -30, 0],  y: [0, 40, 0],  duration: 26 },
  { color: 'var(--accent-coral)', size: 480, top: '48%',  left: '66%',  x: [0, -35, 0],  y: [0, -25, 0], duration: 30 },
]

export function AuroraBackground({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const reduced = usePrefersReducedMotion()

  return (
    <div
      aria-hidden
      className={className}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', ...style }}
    >
      {BLOBS.map((b, i) => (
        <m.div
          key={i}
          animate={reduced ? undefined : { x: b.x, y: b.y }}
          transition={reduced ? undefined : { duration: b.duration, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            top: b.top,
            left: b.left,
            width: b.size,
            height: b.size,
            borderRadius: '50%',
            backgroundColor: b.color,
            opacity: 0.34,
            filter: 'blur(90px)',
          }}
        />
      ))}
    </div>
  )
}
