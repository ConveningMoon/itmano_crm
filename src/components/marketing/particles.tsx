'use client'

import { m } from 'motion/react'
import { usePrefersReducedMotion } from '@/components/motion/use-prefers-reduced-motion'

interface Particle {
  left: string
  top: string
  size: number
  color: string
  duration: number
  delay: number
}

// Posiciones fijas (no Math.random en render — evita mismatch de hidratación
// SSR/cliente). Mezcla de acentos a baja opacidad, ascienden y se desvanecen
// en loop. Puramente decorativo: aria-hidden, pointer-events:none.
const PARTICLES: Particle[] = [
  { left: '6%',  top: '82%', size: 3, color: 'var(--accent-gold)',  duration: 9,  delay: 0 },
  { left: '14%', top: '30%', size: 2, color: 'var(--text-primary)', duration: 11, delay: 1.2 },
  { left: '23%', top: '68%', size: 4, color: 'var(--accent-blue)',  duration: 8,  delay: 2.4 },
  { left: '34%', top: '15%', size: 2, color: 'var(--accent-gold)',  duration: 12, delay: 0.6 },
  { left: '45%', top: '78%', size: 3, color: 'var(--accent-coral)', duration: 10, delay: 3.1 },
  { left: '58%', top: '40%', size: 2, color: 'var(--text-primary)', duration: 9,  delay: 1.8 },
  { left: '67%', top: '85%', size: 3, color: 'var(--accent-blue)',  duration: 13, delay: 0.3 },
  { left: '76%', top: '22%', size: 4, color: 'var(--accent-gold)',  duration: 8,  delay: 2.7 },
  { left: '85%', top: '60%', size: 2, color: 'var(--accent-coral)', duration: 11, delay: 1.5 },
  { left: '92%', top: '35%', size: 3, color: 'var(--text-primary)', duration: 10, delay: 3.6 },
  { left: '3%',  top: '48%', size: 2, color: 'var(--accent-blue)',  duration: 12, delay: 2.1 },
  { left: '51%', top: '10%', size: 3, color: 'var(--accent-gold)',  duration: 9,  delay: 0.9 },
]

export function Particles({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion()
  if (reduced) return null

  return (
    <div aria-hidden className={className} style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {PARTICLES.map((p, i) => (
        <m.div
          key={i}
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: [0, 0.9, 0], y: -52 }}
          transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            backgroundColor: p.color,
            boxShadow: `0 0 ${p.size * 3}px ${p.size * 0.8}px ${p.color}`,
          }}
        />
      ))}
    </div>
  )
}
