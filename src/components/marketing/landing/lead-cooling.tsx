'use client'

import { useRef } from 'react'
import { m, useScroll, useTransform, type MotionValue } from 'motion/react'
import { usePrefersReducedMotion } from '@/components/motion/use-prefers-reduced-motion'

// "Se pierde antes": la semana de un lead que nadie llamó a tiempo. La luz
// avanza con el scroll y pierde el oro a medida que pasan los días — el scroll
// es el tiempo que pasa, por eso la animación va atada a él y no a un timer.

const STOPS = [
  { when: 'Martes, 21:04', what: 'Mariana descarga tu guía para vendedores. Quiere mudarse antes de que empiece el colegio.' },
  { when: 'Miércoles', what: 'Entran doce leads más. El suyo queda en la planilla, sin dueño.' },
  { when: 'Jueves', what: 'Alguien piensa en llamarla, pero hay una visita, un cierre y una reunión.' },
  { when: 'Viernes, 11:30', what: 'Por fin la llaman. Ya firmó con el agente que le contestó el martes.' },
]

function Light({ heat }: { heat: MotionValue<number> }) {
  const cold = useTransform(heat, v => 1 - v)
  const scale = useTransform(heat, [0, 1], [0.6, 1])
  return (
    <m.span className="mk-cool-light" style={{ scale }}>
      <m.span className="mk-cool-light-warm" style={{ opacity: heat }} />
      <m.span className="mk-cool-light-cold" style={{ opacity: cold }} />
    </m.span>
  )
}

function Rail({ axis, progress, heat }: { axis: 'x' | 'y'; progress: MotionValue<number>; heat: MotionValue<number> }) {
  const along = useTransform(progress, v => `${v * 100}%`)
  return (
    <div className={`mk-cool-rail mk-cool-rail-${axis}`} aria-hidden>
      <m.span className="mk-cool-fill" style={axis === 'x' ? { scaleX: progress } : { scaleY: progress }} />
      <m.span className="mk-cool-runner" style={axis === 'x' ? { x: along } : { y: along }}>
        <Light heat={heat} />
      </m.span>
    </div>
  )
}

// Con reduced motion la semana se ve completa y quieta: riel lleno, luz fría
// en el viernes. El contenido es el mismo; sólo falta el recorrido.
function StillRail({ axis }: { axis: 'x' | 'y' }) {
  return (
    <div className={`mk-cool-rail mk-cool-rail-${axis}`} aria-hidden>
      <span className="mk-cool-fill" />
      <span className="mk-cool-runner" style={{ transform: axis === 'x' ? 'translateX(100%)' : 'translateY(100%)' }}>
        <span className="mk-cool-light" style={{ transform: 'scale(0.6)' }}>
          <span className="mk-cool-light-cold" />
        </span>
      </span>
    </div>
  )
}

export function LeadCooling() {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = usePrefersReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 80%', 'end 45%'] })
  const heat = useTransform(scrollYProgress, [0, 0.3, 1], [1, 0.85, 0])

  return (
    <div ref={ref} className="mk-cool">
      {reduced ? (
        <>
          <StillRail axis="x" />
          <StillRail axis="y" />
        </>
      ) : (
        <>
          <Rail axis="x" progress={scrollYProgress} heat={heat} />
          <Rail axis="y" progress={scrollYProgress} heat={heat} />
        </>
      )}

      <ol className="mk-cool-stops">
        {STOPS.map(stop => (
          <li key={stop.when} className="mk-cool-stop">
            <span className="mk-cool-when">{stop.when}</span>
            <p className="mk-cool-what">{stop.what}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}
