'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, m, useScroll, useTransform } from 'motion/react'
import { EASE_OUT_PREMIUM } from '@/components/motion/primitives'
import { usePrefersReducedMotion } from '@/components/motion/use-prefers-reduced-motion'
import { JOURNEY_MOCKS } from './journey-mocks'

// El recorrido de un lead, en cuatro pasos. En escritorio el texto avanza y el
// producto queda fijo a la derecha, cambiando de escena con el paso activo; la
// misma luz dorada del hero baja por el riel marcando dónde va el lead. En
// móvil cada paso lleva su escena debajo, en su estado final.

const STEPS = [
  {
    tag: 'Llega',
    title: 'Entra por donde sea, ya identificado',
    body: 'Tu página de captura, una guía descargable, un open house o el formulario de tu web. Cada lead entra con su fuente y sus respuestas, sin copiar ni exportar nada.',
  },
  {
    tag: 'La IA lo lee',
    title: 'Antes de que lo abras, ya está leído',
    body: 'Su motivación real, su urgencia, qué decirle y qué objeción anticipar: lo que un buen director de ventas te diría en diez segundos. Viene encendido desde el primer día, en todos los planes.',
  },
  {
    tag: 'Se ordena solo',
    title: 'Aparece donde tiene que estar',
    body: 'Con lo que respondió al llegar y con lo que hace después: si contestó tu correo, si volvió a tu web, si pidió una valoración. Cuando se calienta, su agente lo sabe en segundos, en la aplicación y en Telegram.',
  },
  {
    tag: 'El seguimiento sale solo',
    title: 'Nadie tiene que acordarse',
    body: 'Secuencias con tu tono, la firma del agente que lo atiende y el idioma del lead. Una etiqueta como “pre-aprobado” dispara el correo que corresponde, y las bajas y los rebotes se respetan solos.',
  },
] as const

export function LeadJourney() {
  const [active, setActive] = useState(0)
  const reduced = usePrefersReducedMotion()
  const listRef = useRef<HTMLOListElement>(null)
  const stepRefs = useRef<(HTMLLIElement | null)[]>([])

  // Paso activo = el que cruza la franja central del viewport.
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const index = stepRefs.current.indexOf(entry.target as HTMLLIElement)
          if (index !== -1) setActive(index)
        }
      },
      { rootMargin: '-48% 0px -48% 0px' },
    )
    stepRefs.current.forEach(el => el && observer.observe(el))
    return () => observer.disconnect()
  }, [])

  const { scrollYProgress } = useScroll({ target: listRef, offset: ['start 50%', 'end 50%'] })
  const along = useTransform(scrollYProgress, v => `${v * 100}%`)
  const Scene = JOURNEY_MOCKS[active]

  return (
    <div className="mk-journey">
      <div className="mk-journey-track">
        <div className="mk-journey-rail" aria-hidden>
          <m.span className="mk-journey-fill" style={{ scaleY: reduced ? 1 : scrollYProgress }} />
          {!reduced && (
            <m.span className="mk-journey-runner" style={{ y: along }}>
              <span className="mk-journey-light" />
            </m.span>
          )}
        </div>

        <ol ref={listRef} className="mk-journey-steps">
          {STEPS.map((step, i) => {
            const Inline = JOURNEY_MOCKS[i]
            return (
              <li
                key={step.tag}
                ref={el => {
                  stepRefs.current[i] = el
                }}
                className="mk-journey-step"
                data-active={i === active || undefined}
              >
                <h3 className="mk-journey-title">{step.tag}</h3>
                <p className="mk-journey-sub">{step.title}</p>
                <p className="mk-body">{step.body}</p>
                <div className="mk-journey-inline">
                  <Inline run={false} />
                </div>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="mk-journey-stage" aria-hidden>
        <div className="mk-journey-sticky">
          <div className="mk-journey-frame">
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={active}
                initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -10, filter: 'blur(6px)', transition: { duration: 0.2 } }}
                transition={{ duration: 0.5, ease: EASE_OUT_PREMIUM }}
              >
                <Scene run={!reduced} />
                <p className="mk-demo-note">Ejemplo con datos ficticios</p>
              </m.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
