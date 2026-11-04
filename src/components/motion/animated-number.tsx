'use client'

import { useEffect, useRef } from 'react'
import { animate } from 'motion/react'
import { EASE_OUT_PREMIUM } from './primitives'

interface AnimatedNumberProps {
  value: number
  format?: (n: number) => string
  duration?: number
}

// en-US fija la coma de millares (1,284) igual en servidor y cliente. Un formato en
// función no puede cruzar de un Server Component a este Client Component: quien
// necesite otro formato lo resuelve en un wrapper cliente.
const defaultFormat = (n: number) => Math.round(n).toLocaleString('en-US')

// SSR renderiza el valor final (cero hydration mismatch, cero layout shift si
// JS no carga). En el primer mount anima desde 0 mutando textContent — React no
// re-renderiza este span, así que la mutación es segura.
export function AnimatedNumber({ value, format = defaultFormat, duration = 0.8 }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const controls = animate(0, value, {
      duration,
      ease: EASE_OUT_PREMIUM,
      onUpdate: v => {
        el.textContent = format(v)
      },
    })
    return () => controls.stop()
    // Solo en el primer mount, a propósito: los KPI no deben re-animar en updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <span ref={ref}>{format(value)}</span>
}
