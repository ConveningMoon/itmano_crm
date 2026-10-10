'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Bell, Check, CornerDownLeft, Tag } from 'lucide-react'
import { EASE_OUT_PREMIUM } from '@/components/motion/primitives'
import { ACTION_LABEL, initials } from './demo-data'

// Las cuatro escenas del recorrido de un lead. Cada una tiene dos modos:
// `run` (el panel fijo de escritorio, que la monta al activarse el paso y la
// deja reproducirse) y estático (móvil, reduced motion), que muestra el estado
// final. Así el estado final es siempre el que viene en el HTML.

/**
 * Avanza por una línea de tiempo (ms desde el montaje). Devuelve cuántas
 * marcas ya pasaron; sin `run` devuelve el final directamente.
 */
function useStage(run: boolean, marks: readonly number[]) {
  const [stage, setStage] = useState(run ? 0 : marks.length)
  useEffect(() => {
    if (!run) return
    const timers = marks.map((ms, i) => window.setTimeout(() => setStage(i + 1), ms))
    return () => timers.forEach(t => window.clearTimeout(t))
  }, [run, marks])
  return run ? stage : marks.length
}

const enter = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: EASE_OUT_PREMIUM },
}

// ── 1. Llega ─────────────────────────────────────────────────────────────────

const FORM_MARKS = [700, 1500, 2200] as const

export function MockForm({ run }: { run: boolean }) {
  const stage = useStage(run, FORM_MARKS)
  return (
    <div className="mk-mock mk-mock-form">
      <p className="mk-mock-kicker">Página de captura · tuagencia.com/guia</p>
      <p className="mk-mock-title">Cómo vender tu casa este año</p>
      <p className="mk-mock-muted">Guía gratuita con precios reales de tu zona</p>

      <div className="mk-mock-fields">
        <div className="mk-mock-field">
          <span>Nombre</span>
          <strong>Mariana González</strong>
        </div>
        <div className="mk-mock-field">
          <span>Email</span>
          <strong>mariana@example.com</strong>
        </div>
        <div className="mk-mock-field">
          <span>¿Cuándo piensas vender?</span>
          <div className="mk-mock-options">
            {['Este trimestre', 'Este año', 'Sólo explorando'].map((o, i) => (
              <span key={o} className="mk-mock-option" data-on={(i === 0 && stage >= 1) || undefined}>
                {o}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mk-mock-submit" data-done={stage >= 3 || undefined}>
        <AnimatePresence mode="wait" initial={false}>
          {stage >= 3 ? (
            <m.span key="ok" {...enter} className="mk-mock-submit-label">
              <Check size={15} strokeWidth={2} aria-hidden /> Recibido
            </m.span>
          ) : (
            <m.span key="go" {...enter} className="mk-mock-submit-label">
              {stage >= 2 ? 'Enviando…' : 'Recibir la guía'}
            </m.span>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence initial={false}>
        {stage >= 3 && (
          <m.p {...enter} className="mk-mock-foot">
            <span className="mk-mock-dot" aria-hidden /> Entró a ITMANO · Fuente: Guía para vendedores
          </m.p>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── 2. La IA lo lee ──────────────────────────────────────────────────────────

const BRIEFING = [
  {
    label: 'La lectura',
    text: 'Vende para mudarse a una casa más grande antes de que empiece el colegio. Ya tiene la aprobación del banco; lo que la frena es no saber en cuánto se vende la suya.',
  },
  {
    label: 'Qué hacer ahora',
    text: 'Llamarla hoy y ofrecerle una valoración de su casa esta semana: es lo único que le falta para decidirse.',
  },
  {
    label: 'Qué mencionar',
    text: 'Dos casas comparables vendidas en su zona este mes. La valoración no la compromete a listar contigo.',
  },
  {
    label: 'Ojo con',
    text: 'Mencionó que un conocido suyo también es agente. Ten lista la razón para trabajar con tu equipo.',
  },
]
// Dónde empieza cada bloque dentro del texto corrido que se va escribiendo.
const BRIEFING_STARTS = BRIEFING.map((_, i) => BRIEFING.slice(0, i).reduce((n, b) => n + b.text.length, 0))
const BRIEFING_TOTAL = BRIEFING.reduce((n, b) => n + b.text.length, 0)

// Escritura progresiva, como se ve el análisis la primera vez que se genera.
function useTyped(run: boolean, total: number, charsPerTick = 4, tickMs = 22) {
  const [count, setCount] = useState(run ? 0 : total)
  useEffect(() => {
    if (!run) return
    let n = 0
    const id = window.setInterval(() => {
      n = Math.min(total, n + charsPerTick)
      setCount(n)
      if (n >= total) window.clearInterval(id)
    }, tickMs)
    return () => window.clearInterval(id)
  }, [run, total, charsPerTick, tickMs])
  return run ? count : total
}

export function MockBriefing({ run }: { run: boolean }) {
  const typed = useTyped(run, BRIEFING_TOTAL)
  return (
    <div className="mk-mock mk-mock-brief">
      <div className="mk-mock-brief-head">
        <span className="mk-avatar" style={{ ['--tone' as string]: 'var(--accent-gold)' }} aria-hidden>
          {initials('Mariana González')}
        </span>
        <span>
          <span className="mk-mock-title" style={{ fontSize: '15px' }}>Mariana González</span>
          <span className="mk-mock-muted" style={{ display: 'block' }}>Guía para vendedores · hace 2 min</span>
        </span>
        <span className="mk-chip mk-chip-hoy">{ACTION_LABEL.hoy}</span>
      </div>
      {BRIEFING.map((block, i) => {
        const visible = Math.max(0, Math.min(block.text.length, typed - BRIEFING_STARTS[i]))
        return (
          <div key={block.label} className="mk-mock-brief-block" data-pending={visible === 0 || undefined}>
            <span className="mk-mock-label">{block.label}</span>
            <p className="mk-mock-text">
              {block.text.slice(0, visible)}
              {visible > 0 && visible < block.text.length && <span className="mk-caret" aria-hidden />}
              {/* El resto ocupa su lugar invisible: la tarjeta no salta de alto mientras escribe. */}
              <span className="mk-mock-ghost" aria-hidden>{block.text.slice(visible)}</span>
            </p>
          </div>
        )
      })}
    </div>
  )
}

// ── 3. Se ordena solo ────────────────────────────────────────────────────────

const LIST_MARKS = [900, 2000] as const
const OTHERS = [
  { id: 'jorge', name: 'Jorge Lira', source: 'Respondió tu correo', tone: 'coral' },
  { id: 'diego', name: 'Diego Ramos', source: 'Open house del sábado', tone: 'green' },
] as const

export function MockList({ run }: { run: boolean }) {
  const stage = useStage(run, LIST_MARKS)
  const risen = stage >= 1
  const rows = [
    ...(risen ? [{ id: 'mariana', name: 'Mariana González', source: 'Pidió la valoración de su casa', tone: 'gold' }] : []),
    ...OTHERS,
    ...(risen ? [] : [{ id: 'mariana', name: 'Mariana González', source: 'Guía para vendedores', tone: 'gold' }]),
  ]
  return (
    <div className="mk-mock mk-mock-list">
      <AnimatePresence initial={false}>
        {stage >= 2 && (
          <m.div
            className="mk-mock-alert"
            initial={{ opacity: 0, y: -14, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.5, ease: EASE_OUT_PREMIUM }}
          >
            <Bell size={15} strokeWidth={1.75} aria-hidden />
            <span>
              <strong>Lead caliente</strong>
              <span>Mariana González volvió a ver la valoración de su casa.</span>
            </span>
          </m.div>
        )}
      </AnimatePresence>
      <p className="mk-mock-label" style={{ marginTop: stage >= 2 ? '16px' : 0 }}>Tu lista de hoy</p>
      <ol className="mk-mock-rows">
        {rows.map(row => (
          <m.li key={row.id} layout transition={{ duration: 0.55, ease: EASE_OUT_PREMIUM }} className="mk-mock-row" data-hot={(row.id === 'mariana' && risen) || undefined}>
            <span className="mk-avatar" style={{ ['--tone' as string]: `var(--accent-${row.tone})` }} aria-hidden>
              {initials(row.name)}
            </span>
            <span className="mk-daylist-who">
              <span className="mk-daylist-name">{row.name}</span>
              <span className="mk-daylist-source">{row.source}</span>
            </span>
            <span className={`mk-chip ${row.id === 'mariana' && !risen ? 'mk-chip-semana' : 'mk-chip-hoy'}`}>
              {row.id === 'mariana' && !risen ? ACTION_LABEL.semana : ACTION_LABEL.hoy}
            </span>
          </m.li>
        ))}
      </ol>
    </div>
  )
}

// ── 4. El seguimiento sale solo ──────────────────────────────────────────────

const SEQ_MARKS = [400, 1000, 1600, 2300] as const
const SEQUENCE = [
  { when: 'Hoy', subject: 'Tu guía para vender este año', state: 'Enviado' },
  { when: 'Día 2', subject: 'Cuánto vale tu casa hoy', state: 'Enviado' },
  { when: 'Día 3', subject: '“¿Podemos hablar el jueves?”', state: 'Respondió', reply: true },
] as const

export function MockSequence({ run }: { run: boolean }) {
  const stage = useStage(run, SEQ_MARKS)
  return (
    <div className="mk-mock mk-mock-seq">
      <div className="mk-mock-seq-from">
        <span className="mk-mock-label">Firma</span>
        <span>Laura Méndez · laura@mail.tuagencia.com</span>
      </div>
      <ol className="mk-mock-seq-steps">
        {SEQUENCE.map((s, i) => (
          <li key={s.when} className="mk-mock-seq-step" data-on={stage > i || undefined} data-reply={('reply' in s && s.reply) || undefined}>
            <span className="mk-mock-seq-when">{s.when}</span>
            <span className="mk-mock-seq-subject">
              {'reply' in s && s.reply && <CornerDownLeft size={13} strokeWidth={1.75} aria-hidden />}
              {s.subject}
            </span>
            <span className="mk-mock-seq-state">{s.state}</span>
          </li>
        ))}
      </ol>
      <div className="mk-mock-seq-tag" data-on={stage >= 4 || undefined}>
        <Tag size={14} strokeWidth={1.75} aria-hidden />
        <span>
          Etiqueta <strong>pre-aprobado</strong> → sale la secuencia “Siguientes pasos con tu banco”, en español
        </span>
      </div>
    </div>
  )
}

export const JOURNEY_MOCKS = [MockForm, MockBriefing, MockList, MockSequence] as const
