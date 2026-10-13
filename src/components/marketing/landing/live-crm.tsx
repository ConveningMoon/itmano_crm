'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { BarChart2, Bell, Building2, GitBranch, LayoutDashboard, Mail, Newspaper, Plus, Sparkles, UserPlus, Users } from 'lucide-react'
import { EASE_OUT_PREMIUM } from '@/components/motion/primitives'
import { usePrefersReducedMotion } from '@/components/motion/use-prefers-reduced-motion'
import { QUALITY_CONFIG, URGENCIES, URGENCY_CONFIG, qualityRank, type Stage } from '@/lib/scoring/priority'
import { FUNNEL_START, KANBAN_MOVES, KANBAN_START, LEADS, QUEUE_START, leadById, type AgentKey, type DemoLead } from './demo-data'
import { useLive, useTicker } from './crm-bits'
import { DashboardView, KanbanView, PropertiesView, type ActivityItem } from './crm-views'
import { LeadDrawer } from './lead-drawer'

// El hero: el CRM funcionando solo, con datos ficticios. Entran leads, la IA
// los califica y la cola del día se reordena; en Leads una agente mueve
// tarjetas por el embudo (la etapa la mueve una persona, como en el producto);
// en Propiedades la IA arma una ficha desde un PDF. El visitante puede tomar el
// control: el menú cambia de vista y cada lead de la cola abre su ficha.
//
// Todo el ritmo se detiene fuera de pantalla y con reduced motion. El estado
// inicial (el del HTML) ya es una pantalla completa y legible.

type View = 'dashboard' | 'leads' | 'propiedades'

const NAV: { key: string; label: string; icon: typeof Users; view?: View }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, view: 'dashboard' },
  { key: 'leads', label: 'Leads', icon: Users, view: 'leads' },
  { key: 'propiedades', label: 'Propiedades', icon: Building2, view: 'propiedades' },
  { key: 'newsletters', label: 'Newsletters', icon: Newspaper },
  { key: 'fuentes', label: 'Fuentes', icon: GitBranch },
  { key: 'emails', label: 'Emails', icon: Mail },
  { key: 'analytics', label: 'Analytics', icon: BarChart2 },
]

const TITLES: Record<View, string> = { dashboard: 'Dashboard', leads: 'Leads', propiedades: 'Propiedades' }

const ACTIVITY_START: ActivityItem[] = [
  { id: 's1', title: 'Respondió un correo de la secuencia', detail: 'Jorge Lira · hace 12 min' },
  { id: 's2', title: 'Pidió una valoración', detail: 'Valeria Pardo · hace 40 min' },
  { id: 's3', title: 'Confirmó el open house', detail: 'Tomás Herrera · hace 1 h' },
]

const ARRIVE_EVERY = 4400
// Filas de la cola que caben en la ventana sin recortar ninguna.
const QUEUE_ROWS = 4
const MOVE_EVERY = 3200

// Mismo orden que la cola del producto: calidad primero, urgencia después.
const priority = (l: DemoLead) => qualityRank(l.quality) * 10 + URGENCIES.indexOf(l.urgency)
const sortIds = (ids: string[]) => [...new Set(ids)].map(leadById).sort((a, b) => priority(a) - priority(b)).map(l => l.id)

interface Toast {
  key: number
  lead: DemoLead
  phase: 'nuevo' | 'calificado'
}

export function LiveCRM() {
  const ref = useRef<HTMLDivElement>(null)
  const live = useLive(ref)
  const reduced = usePrefersReducedMotion()

  const [view, setView] = useState<View>('dashboard')
  const [funnel, setFunnel] = useState<Record<Stage, number>>(FUNNEL_START)
  const [queueIds, setQueueIds] = useState<string[]>(() => sortIds([...QUEUE_START]))
  const [fresh, setFresh] = useState<string | null>(null)
  const [high, setHigh] = useState(8)
  const [pulse, setPulse] = useState<Stage | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [activity, setActivity] = useState<ActivityItem[]>(ACTIVITY_START)
  const [open, setOpen] = useState<{ id: string; typing: boolean } | null>(null)
  const [cards, setCards] = useState(KANBAN_START)
  const [moving, setMoving] = useState<{ card: string; by: AgentKey } | null>(null)
  const [draft, setDraft] = useState(0)

  const timers = useRef<number[]>([])
  const serial = useRef(0)
  const cursor = useRef(0)
  const moveIndex = useRef(0)
  // Desde que el visitante toca algo, la demo deja de abrir fichas por su cuenta.
  const touched = useRef(false)
  const autoOpened = useRef(false)
  const autoDraft = useRef(false)

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms))
  }
  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(t => window.clearTimeout(t))
  }, [])

  // ── Dashboard: llega un lead, la IA lo califica, entra a la cola ─────────────
  useTicker(live && view === 'dashboard' && !open, ARRIVE_EVERY, () => {
    const candidates = LEADS.filter(l => !queueIds.includes(l.id))
    if (candidates.length === 0) return
    const lead = candidates[cursor.current++ % candidates.length]
    const key = ++serial.current

    setToast({ key, lead, phase: 'nuevo' })
    setPulse('nuevo')
    setFunnel(f => (f.nuevo >= 26 ? FUNNEL_START : { ...f, nuevo: f.nuevo + 1 }))
    setActivity(a => [{ id: `a${key}`, title: `Nuevo lead · ${lead.name}`, detail: `${lead.source} · ahora` }, ...a].slice(0, 4))

    later(1500, () => {
      setQueueIds(q => sortIds([...q, lead.id]).slice(0, QUEUE_ROWS))
      setFresh(lead.id)
      setPulse(null)
      if (lead.quality === 'alta') setHigh(h => (h >= 14 ? 8 : h + 1))
      setToast(t => (t?.key === key ? { ...t, phase: 'calificado' } : t))

      // Una sola vez, la demo abre la ficha del primer lead de calidad alta. En
      // pantallas chicas no: la ficha ocupa toda la ventana y taparía la cola.
      const roomy = window.matchMedia('(min-width: 901px)').matches
      if (roomy && !autoOpened.current && !touched.current && lead.quality === 'alta') {
        autoOpened.current = true
        later(1700, () => {
          if (touched.current) return
          setOpen({ id: lead.id, typing: true })
          later(10_000, () => {
            if (!touched.current) setOpen(o => (o?.id === lead.id ? null : o))
          })
        })
      }
    })
    later(3800, () => setToast(t => (t?.key === key ? null : t)))
  })

  // ── Leads: una agente mueve una tarjeta a la etapa siguiente ────────────────
  useTicker(live && view === 'leads', MOVE_EVERY, () => {
    if (moveIndex.current >= KANBAN_MOVES.length) {
      moveIndex.current = 0
      setCards(KANBAN_START)
      return
    }
    const move = KANBAN_MOVES[moveIndex.current++]
    setMoving({ card: move.card, by: move.by })
    later(650, () => setCards(cs => cs.map(c => (c.id === move.card ? { ...c, stage: move.to } : c))))
    later(2300, () => setMoving(mv => (mv?.card === move.card ? null : mv)))
  })

  // ── Propiedades: la IA arma una ficha desde el PDF del listado ──────────────
  const startDraft = () => {
    setDraft(1)
    later(1300, () => setDraft(2))
    later(2500, () => setDraft(3))
    later(3700, () => setDraft(4))
  }
  useEffect(() => {
    if (view !== 'propiedades' || !live || autoDraft.current) return
    autoDraft.current = true
    const id = window.setTimeout(startDraft, 700)
    return () => window.clearTimeout(id)
    // startDraft sólo agenda timers; no depende de estado que cambie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, live])

  const go = (next: View) => {
    touched.current = true
    setOpen(null)
    setView(next)
  }
  const openLead = (id: string) => {
    touched.current = true
    setOpen({ id, typing: !reduced })
  }

  // Con reduced motion no entra nadie en vivo: la cola se muestra completa.
  const queue = (reduced ? sortIds(LEADS.map(l => l.id)).slice(0, QUEUE_ROWS) : queueIds).map(leadById)
  const activeCount = funnel.nuevo + funnel.nutricion + funnel.en_proceso
  const openedLead = open ? leadById(open.id) : null
  const openedRank = openedLead ? Math.max(1, queueIds.indexOf(openedLead.id) + 1) : 1

  return (
    <div ref={ref} className="crm-window" role="region" aria-label="Demostración interactiva del CRM con datos ficticios">
      <div className="crm-chrome" aria-hidden>
        <span className="crm-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="crm-url">app.itmano.com/{view}</span>
      </div>

      <div className="crm-app">
        <aside className="crm-side">
          <div className="crm-brand">
            <span className="crm-brand-mark" aria-hidden>TA</span>
            <span>
              <strong>Tu agencia</strong>
              <small>CRM by ITMANO</small>
            </span>
          </div>
          <nav className="crm-nav" aria-label="Menú de la demostración">
            {NAV.map(item =>
              item.view ? (
                <button
                  key={item.key}
                  type="button"
                  className="crm-nav-item"
                  aria-current={view === item.view ? 'page' : undefined}
                  onClick={() => go(item.view!)}
                >
                  <item.icon size={15} strokeWidth={1.75} aria-hidden /> {item.label}
                </button>
              ) : (
                <span key={item.key} className="crm-nav-item" data-static>
                  <item.icon size={15} strokeWidth={1.75} aria-hidden /> {item.label}
                </span>
              ),
            )}
          </nav>
          <div className="crm-side-user">
            <span className="crm-avatar" style={{ width: 28, height: 28, fontSize: 10, ['--tone' as string]: 'var(--accent-gold)' }} aria-hidden>
              LM
            </span>
            <span>
              <strong>Laura Méndez</strong>
              <small>Propietaria · Plan Growth</small>
            </span>
          </div>
        </aside>

        <div className="crm-main">
          <header className="crm-top">
            <p className="crm-top-title">{TITLES[view]}</p>
            <div className="crm-tabs" role="tablist" aria-label="Vistas de la demostración">
              {(Object.keys(TITLES) as View[]).map(v => (
                <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => go(v)}>
                  {TITLES[v]}
                </button>
              ))}
            </div>
            <div className="crm-top-actions" aria-hidden>
              <span className="crm-icon-btn">
                <Bell size={14} strokeWidth={1.75} />
                {toast && <i className="crm-bell-dot" />}
              </span>
              <span className="crm-btn-gold">
                <Plus size={13} strokeWidth={2} /> Registrar Lead
              </span>
            </div>
          </header>

          <div className="crm-body">
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={view}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                transition={{ duration: 0.35, ease: EASE_OUT_PREMIUM }}
                style={{ height: '100%' }}
              >
                {view === 'dashboard' && (
                  <DashboardView
                    funnel={funnel}
                    queue={queue}
                    fresh={fresh}
                    highQuality={high}
                    pulse={pulse}
                    activity={activity}
                    onOpen={openLead}
                  />
                )}
                {view === 'leads' && <KanbanView cards={cards} moving={moving} />}
                {view === 'propiedades' && <PropertiesView draft={draft} onCreate={() => { touched.current = true; if (draft === 0 || draft === 4) startDraft() }} />}
              </m.div>
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {toast && view === 'dashboard' && (
              <m.div
                key={toast.key}
                className="crm-toast"
                initial={{ opacity: 0, y: -12, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
                transition={{ duration: 0.45, ease: EASE_OUT_PREMIUM }}
                aria-live="polite"
              >
                <span className="crm-toast-icon" data-phase={toast.phase}>
                  {toast.phase === 'nuevo' ? <UserPlus size={14} strokeWidth={1.75} aria-hidden /> : <Sparkles size={14} strokeWidth={1.75} aria-hidden />}
                </span>
                <span className="crm-who">
                  <span className="crm-who-name">
                    {toast.phase === 'nuevo'
                      ? `Nuevo lead · ${toast.lead.name}`
                      : `Calidad ${QUALITY_CONFIG[toast.lead.quality].label.toLowerCase()} · ${URGENCY_CONFIG[toast.lead.urgency].label}`}
                  </span>
                  <span className="crm-who-sub">
                    {toast.phase === 'nuevo' ? toast.lead.source : `La IA leyó a ${toast.lead.name.split(' ')[0]} y la ubicó en tu cola`}
                  </span>
                </span>
              </m.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {openedLead && (
              <>
                <m.button
                  key="shade"
                  type="button"
                  className="crm-shade"
                  aria-label="Cerrar la ficha"
                  onClick={() => {
                    touched.current = true
                    setOpen(null)
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                />
                <LeadDrawer
                  key={openedLead.id}
                  lead={openedLead}
                  rank={openedRank}
                  active={activeCount}
                  typing={open?.typing ?? false}
                  onClose={() => {
                    touched.current = true
                    setOpen(null)
                  }}
                />
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
