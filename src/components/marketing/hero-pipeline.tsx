'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { EASE_OUT_PREMIUM } from '@/components/motion/primitives'
import { usePrefersReducedMotion } from '@/components/motion/use-prefers-reduced-motion'

// Demostración en vivo del scoring: un pipeline en miniatura donde los leads
// acumulan puntos por eventos reales y el sistema los promueve de columna solo.
// Guion determinista en loop — nada aleatorio, para que cada ciclo se vea igual
// de pulido. Con prefers-reduced-motion el tablero se muestra estático.

interface DemoCard {
  id: string
  name: string
  score: number
}

type ColumnKey = 'nuevo' | 'nurturing' | 'tibio' | 'caliente'

const COLUMNS: { key: ColumnKey; label: string; color: string }[] = [
  { key: 'nuevo',     label: 'Nuevo',     color: 'var(--status-new)' },
  { key: 'nurturing', label: 'Nurturing', color: 'var(--status-nurturing)' },
  { key: 'tibio',     label: 'Tibio',     color: 'var(--status-warm)' },
  { key: 'caliente',  label: 'Caliente',  color: 'var(--status-hot)' },
]

// Mismas bandas que el producto: 0–14 nuevo · 15–34 nurturing · 35–59 tibio · 60+ caliente.
function bandFor(score: number): ColumnKey {
  if (score >= 60) return 'caliente'
  if (score >= 35) return 'tibio'
  if (score >= 15) return 'nurturing'
  return 'nuevo'
}

const INITIAL: DemoCard[] = [
  { id: 'c1', name: 'Mariana G.', score: 12 },
  { id: 'c2', name: 'Carlos P.',  score: 28 },
  { id: 'c3', name: 'Lucía F.',   score: 45 },
  { id: 'c4', name: 'Andrés M.',  score: 68 },
  { id: 'c5', name: 'Sofía R.',   score: 8 },
]

type Step =
  | { type: 'event'; id: string; label: string; pts: number }
  | { type: 'exit'; id: string; label: string; spawn: DemoCard }

const SCRIPT: Step[] = [
  { type: 'event', id: 'c3', label: 'Respondió al email',   pts: 30 },
  { type: 'event', id: 'c1', label: 'Clic en el CTA',       pts: 15 },
  { type: 'event', id: 'c4', label: 'Consulta agendada',    pts: 50 },
  { type: 'exit',  id: 'c4', label: 'Pasó a proceso',       spawn: { id: 'c6', name: 'Diego T.', score: 10 } },
  { type: 'event', id: 'c2', label: 'Descargó otra guía',   pts: 20 },
  { type: 'event', id: 'c5', label: 'Envió el formulario',  pts: 15 },
  { type: 'event', id: 'c6', label: 'Pidió valoración',     pts: 40 },
]

const TICK_MS = 2400

export function HeroPipeline() {
  const reduced = usePrefersReducedMotion()
  const [cards, setCards] = useState<DemoCard[]>(INITIAL)
  const [tick, setTick] = useState(-1) // índice del paso activo; -1 = aún sin eventos
  const [cycle, setCycle] = useState(0) // fuerza el re-stagger al reiniciar el guion

  useEffect(() => {
    if (reduced) return
    const interval = setInterval(() => {
      setTick(prev => {
        const next = prev + 1
        if (next >= SCRIPT.length) {
          // Fin del guion: tablero vuelve al estado inicial y el ciclo reinicia.
          setCards(INITIAL)
          setCycle(c => c + 1)
          return -1
        }
        const step = SCRIPT[next]
        setCards(current => {
          if (step.type === 'exit') {
            return [...current.filter(c => c.id !== step.id), step.spawn]
          }
          return current.map(c =>
            c.id === step.id ? { ...c, score: Math.min(100, c.score + step.pts) } : c,
          )
        })
        return next
      })
    }, TICK_MS)
    return () => clearInterval(interval)
  }, [reduced])

  const activeStep = tick >= 0 ? SCRIPT[tick] : null

  return (
    <div style={{ position: 'relative' }}>
      {/* Halo dorado detrás del tablero — misma atmósfera que el login */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: '-15% -10%',
          background:
            'radial-gradient(ellipse 70% 60% at 50% 40%, color-mix(in srgb, var(--accent-gold) 8%, transparent), transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'relative',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderTop: '1px solid var(--border-accent)',
          borderRadius: '16px',
          padding: '18px',
          boxShadow: 'var(--highlight-top), var(--shadow-lg)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px',
            paddingLeft: '2px',
            paddingRight: '2px',
          }}
        >
          <span
            style={{
              fontSize: '10px',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            Pipeline · scoring en vivo
          </span>
          <span
            aria-hidden
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent-green)',
              boxShadow: '0 0 8px color-mix(in srgb, var(--accent-green) 60%, transparent)',
            }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          {COLUMNS.map(col => {
            const inCol = cards.filter(c => bandFor(c.score) === col.key)
            return (
              <div
                key={col.key}
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderRadius: '10px',
                  padding: '8px',
                  minHeight: '196px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 2px 6px' }}>
                  <span
                    aria-hidden
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: col.color,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 500,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: 'var(--text-secondary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col.label}
                  </span>
                </div>

                <AnimatePresence mode="popLayout">
                  {inCol.map(card => {
                    const isActive =
                      activeStep !== null &&
                      (activeStep.type === 'event' ? activeStep.id === card.id : activeStep.spawn.id === card.id)
                    return (
                      <m.div
                        key={`${cycle}-${card.id}`}
                        layout
                        initial={{ opacity: 0, scale: 0.92, y: 6 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92 }}
                        transition={{ duration: 0.4, ease: EASE_OUT_PREMIUM }}
                        style={{
                          backgroundColor: 'var(--bg-overlay)',
                          border: `1px solid ${isActive ? 'var(--border-gold-hover)' : 'var(--border-subtle)'}`,
                          borderRadius: '8px',
                          padding: '8px',
                          transition: 'border-color 300ms',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 500,
                              color: 'var(--text-primary)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {card.name}
                          </span>
                          <span
                            className="mk-num"
                            style={{
                              fontSize: '10px',
                              fontWeight: 600,
                              color: col.color,
                              flexShrink: 0,
                            }}
                          >
                            {card.score}
                          </span>
                        </div>
                        {/* Barra de score */}
                        <div
                          aria-hidden
                          style={{
                            marginTop: '6px',
                            height: '3px',
                            borderRadius: '2px',
                            backgroundColor: 'var(--border-subtle)',
                            overflow: 'hidden',
                          }}
                        >
                          <m.div
                            animate={{ width: `${card.score}%` }}
                            transition={{ duration: 0.5, ease: EASE_OUT_PREMIUM }}
                            style={{ height: '100%', borderRadius: '2px', backgroundColor: col.color }}
                          />
                        </div>
                      </m.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            )
          })}
        </div>

        {/* Ticker del evento activo */}
        <div style={{ height: '30px', marginTop: '12px', position: 'relative' }}>
          <AnimatePresence mode="wait">
            {activeStep && (
              <m.div
                key={tick}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3, ease: EASE_OUT_PREMIUM }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  backgroundColor: 'color-mix(in srgb, var(--accent-gold) 8%, transparent)',
                  border: '1px solid var(--border-accent)',
                }}
              >
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {`${nameFor(activeStep.id)} — ${activeStep.label}`}
                </span>
                {activeStep.type === 'event' && (
                  <span className="mk-num" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-gold)' }}>
                    +{activeStep.pts}
                  </span>
                )}
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

function nameFor(id: string): string {
  const all = [...INITIAL, ...SCRIPT.filter(s => s.type === 'exit').map(s => s.spawn)]
  return all.find(c => c.id === id)?.name ?? ''
}
