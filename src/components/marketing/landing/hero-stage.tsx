'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { EASE_OUT_PREMIUM } from '@/components/motion/primitives'
import { usePrefersReducedMotion } from '@/components/motion/use-prefers-reduced-motion'
import { CityLights, type Rect } from './city-lights'
import { ACTION_LABEL, HERO_LEADS, initials, type DemoLead } from './demo-data'

// La pieza que reemplaza al video: el mercado de noche (CityLights) y la lista
// del día en la misma escena. Cada pocos segundos una luz califica, vuela a la
// fila que le toca y la lista se reordena. El titular llega como children —
// sigue siendo HTML del servidor— y esta isla sólo aporta la escena.
//
// Sin JS o con prefers-reduced-motion se ve la lista completa y la ciudad
// quieta: nada del contenido depende de la animación.

const VISIBLE = 5
const ROW_H = 60
const EVERY_MS = 2800
// Cada lead nuevo enfría un poco a los que ya estaban: la lista se mueve como
// se mueve una de verdad, en vez de crecer para siempre.
const COOL = 5

interface Row extends DemoLead {
  key: string
  fresh: boolean
}

const toRow = (lead: DemoLead, key = lead.id): Row => ({ ...lead, key, fresh: false })
const byScore = (a: Row, b: Row) => b.score - a.score

const INITIAL: Row[] = HERO_LEADS.slice(0, 3).map(l => toRow(l)).sort(byScore)
const COMPLETE: Row[] = HERO_LEADS.slice(0, VISIBLE).map(l => toRow(l)).sort(byScore)

function cooled(rows: Row[]) {
  return rows.map(r => ({ ...r, score: Math.max(40, r.score - COOL), fresh: false }))
}

function slotFor(rows: Row[], score: number) {
  const idx = cooled(rows).findIndex(r => r.score < score)
  return idx === -1 ? rows.length : idx
}

export function HeroStage({ children }: { children: React.ReactNode }) {
  const reduced = usePrefersReducedMotion()
  const [rows, setRows] = useState<Row[]>(INITIAL)
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const copyRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const engineRef = useRef<CityLights | null>(null)
  const rowsRef = useRef(rows)
  const runningRef = useRef(false)

  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  // Escena: tamaño, zonas a evitar, parallax y pausa fuera de pantalla.
  useEffect(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    if (!stage || !canvas) return

    let engine: CityLights
    try {
      engine = new CityLights(canvas)
    } catch {
      return
    }
    engineRef.current = engine

    let inView = true
    const sync = () => {
      runningRef.current = inView && !document.hidden && !reduced
      if (runningRef.current) engine.play()
      else engine.pause()
    }

    const measure = () => {
      const box = stage.getBoundingClientRect()
      engine.setSize(box.width, box.height)
      const relative = (el: HTMLElement | null): Rect | null => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: r.left - box.left - 24, y: r.top - box.top - 24, w: r.width + 48, h: r.height + 48 }
      }
      engine.setAvoid([relative(copyRef.current), relative(panelRef.current)].filter((r): r is Rect => r !== null))
    }

    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(stage)

    const visibility = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting
      sync()
    })
    visibility.observe(stage)
    document.addEventListener('visibilitychange', sync)

    const onPointer = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect()
      engine.setPointer(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1)
    }
    stage.addEventListener('pointermove', onPointer)
    sync()

    return () => {
      resize.disconnect()
      visibility.disconnect()
      document.removeEventListener('visibilitychange', sync)
      stage.removeEventListener('pointermove', onPointer)
      engine.destroy()
      engineRef.current = null
      runningRef.current = false
    }
  }, [reduced])

  // Ritmo: una luz califica cada EVERY_MS mientras la escena está visible.
  useEffect(() => {
    if (reduced) return
    let cursor = INITIAL.length
    let serial = 0

    const id = window.setInterval(() => {
      const engine = engineRef.current
      const stage = stageRef.current
      const list = listRef.current
      if (!engine || !stage || !list || !runningRef.current) return

      const current = rowsRef.current
      let lead: DemoLead | undefined
      for (let i = 0; i < HERO_LEADS.length && !lead; i++) {
        const candidate = HERO_LEADS[cursor % HERO_LEADS.length]
        cursor++
        if (!current.some(r => r.id === candidate.id)) lead = candidate
      }
      if (!lead) return

      const slot = Math.min(slotFor(current, lead.score), VISIBLE - 1)
      const box = stage.getBoundingClientRect()
      const at = list.getBoundingClientRect()
      const x = at.left - box.left + 34
      const y = at.top - box.top + slot * ROW_H + ROW_H / 2
      const arriving = lead
      const key = `${arriving.id}-${serial++}`

      engine.launch(x, y, () => {
        setRows(prev => [...cooled(prev), { ...toRow(arriving, key), fresh: true }].sort(byScore).slice(0, VISIBLE))
      })
    }, EVERY_MS)

    return () => window.clearInterval(id)
  }, [reduced])

  const shown = reduced ? COMPLETE : rows

  return (
    <div ref={stageRef} className="mk-hero-stage">
      <canvas ref={canvasRef} className="mk-hero-canvas" aria-hidden />
      <div className="mk-hero-veil" aria-hidden />

      <div className="mk-container mk-hero-grid">
        <div ref={copyRef} className="mk-hero-copy">
          {children}
        </div>

        <div className="mk-hero-panel">
          <div
            ref={panelRef}
            className="mk-daylist"
            role="figure"
            aria-label="Ejemplo de la lista del día: los leads se ordenan solos, de más cerca a más lejos de firmar."
          >
            <div className="mk-daylist-head">
              <div>
                <p className="mk-daylist-title">Tu lista de hoy</p>
                <p className="mk-daylist-sub">Ordenada sola: arriba, quien está más cerca de firmar</p>
              </div>
              <span className="mk-daylist-count mk-num">{shown.length}</span>
            </div>

            <ol ref={listRef} className="mk-daylist-rows" style={{ height: VISIBLE * ROW_H }}>
              <AnimatePresence mode="popLayout" initial={false}>
                {shown.map(row => (
                  <m.li
                    key={row.key}
                    layout
                    className="mk-daylist-row"
                    data-fresh={row.fresh || undefined}
                    style={{ height: ROW_H }}
                    initial={{ opacity: 0, x: -14 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 14, transition: { duration: 0.2 } }}
                    transition={{ duration: 0.45, ease: EASE_OUT_PREMIUM }}
                  >
                    <span className="mk-avatar" style={{ ['--tone' as string]: `var(--accent-${row.tone})` }} aria-hidden>
                      {initials(row.name)}
                    </span>
                    <span className="mk-daylist-who">
                      <span className="mk-daylist-name">{row.name}</span>
                      <span className="mk-daylist-source">{row.source}</span>
                    </span>
                    <span className={`mk-chip mk-chip-${row.action}`}>{ACTION_LABEL[row.action]}</span>
                  </m.li>
                ))}
              </AnimatePresence>
            </ol>
          </div>
          <p className="mk-demo-note">Ejemplo con datos ficticios</p>
        </div>
      </div>
    </div>
  )
}
