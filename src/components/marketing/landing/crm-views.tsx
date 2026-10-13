'use client'

import Image from 'next/image'
import { AnimatePresence, LayoutGroup, m } from 'motion/react'
import { CircleCheck, FileText, Flame, Globe, Inbox, Sparkles, Target, Users } from 'lucide-react'
import { EASE_OUT_PREMIUM } from '@/components/motion/primitives'
import { STAGES, STAGE_CONFIG, type Stage } from '@/lib/scoring/priority'
import { AGENTS, PROPERTIES, type AgentKey, type DemoCard, type DemoLead } from './demo-data'
import { Avatar, QualityChip, QualityText } from './crm-bits'

// Las tres vistas de la réplica. Presentacionales: el estado y el ritmo viven
// en LiveCRM, así que cambiar de vista no reinicia lo que ya pasó.

// ── Dashboard ────────────────────────────────────────────────────────────────

export interface ActivityItem {
  id: string
  title: string
  detail: string
}

interface DashboardProps {
  funnel: Record<Stage, number>
  queue: DemoLead[]
  fresh: string | null
  highQuality: number
  pulse: Stage | null
  activity: ActivityItem[]
  onOpen: (id: string) => void
}

export function DashboardView({ funnel, queue, fresh, highQuality, pulse, activity, onOpen }: DashboardProps) {
  const active = funnel.nuevo + funnel.nutricion + funnel.en_proceso
  const today = queue.filter(l => l.urgency === 'hoy').length
  const max = Math.max(...STAGES.map(s => funnel[s]))
  const kpis = [
    { icon: Users, label: 'Cartera activa', value: active, note: 'nuevos y en nutrición', tone: 'var(--accent-gold)' },
    { icon: Flame, label: 'Calidad alta', value: highQuality, note: 'lo mejor de tu cartera', tone: 'var(--status-hot)' },
    { icon: Target, label: 'Para hoy', value: today, note: 'necesitan acción hoy', tone: 'var(--accent-coral)' },
    { icon: CircleCheck, label: 'Cerrados', value: funnel.cerrado, note: 'este mes', tone: 'var(--status-closed)' },
  ]

  return (
    <div className="crm-dash">
      <div className="crm-kpis">
        {kpis.map(k => (
          <div key={k.label} className="crm-card crm-kpi">
            <span className="crm-kpi-label">
              <span className="crm-kpi-icon" style={{ color: k.tone, backgroundColor: `color-mix(in srgb, ${k.tone} 14%, transparent)` }}>
                <k.icon size={13} strokeWidth={1.75} aria-hidden />
              </span>
              {k.label}
            </span>
            <AnimatePresence mode="popLayout" initial={false}>
              <m.span
                key={k.value}
                className="crm-kpi-value"
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -12, opacity: 0 }}
                transition={{ duration: 0.35, ease: EASE_OUT_PREMIUM }}
              >
                {k.value}
              </m.span>
            </AnimatePresence>
            <span className="crm-kpi-note">{k.note}</span>
          </div>
        ))}
      </div>

      <section className="crm-card crm-funnel">
        <div className="crm-card-head">
          <div>
            <p className="crm-card-title">Embudo</p>
            <p className="crm-card-sub">Cuántos leads llegaron a cada etapa</p>
          </div>
        </div>
        <div className="crm-funnel-bars">
          {STAGES.map(s => (
            <div key={s} className="crm-funnel-col" data-lost={s === 'perdido' || undefined} data-pulse={pulse === s || undefined}>
              <span className="crm-funnel-n" style={{ color: STAGE_CONFIG[s].color }}>
                {funnel[s]}
              </span>
              <m.span
                className="crm-funnel-bar"
                style={{ backgroundColor: STAGE_CONFIG[s].color, transformOrigin: 'bottom' }}
                initial={false}
                animate={{ scaleY: Math.max(0.12, funnel[s] / max) }}
                transition={{ duration: 0.6, ease: EASE_OUT_PREMIUM }}
              />
              <span className="crm-funnel-label">{STAGE_CONFIG[s].label}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="crm-dash-cols">
        <section className="crm-card crm-queue">
          <div className="crm-card-head">
            <p className="crm-card-title">
              Tu cola de hoy <span className="crm-count">{queue.length}</span>
            </p>
            <span className="crm-link">Ver todos</span>
          </div>
          <ol className="crm-queue-rows">
            <AnimatePresence initial={false} mode="popLayout">
              {queue.map(lead => (
                <m.li
                  key={lead.id}
                  layout
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.18 } }}
                  transition={{ duration: 0.45, ease: EASE_OUT_PREMIUM }}
                >
                  <button
                    type="button"
                    className="crm-queue-row"
                    data-fresh={fresh === lead.id || undefined}
                    onClick={() => onOpen(lead.id)}
                    aria-label={`Abrir la ficha de ejemplo de ${lead.name}`}
                  >
                    <Avatar name={lead.name} tone={lead.tone} />
                    <span className="crm-who">
                      <span className="crm-who-name">{lead.name}</span>
                      <span className="crm-who-sub">
                        {AGENTS[lead.agent].name} · {lead.source}
                      </span>
                    </span>
                    <QualityChip band={lead.quality} />
                  </button>
                </m.li>
              ))}
            </AnimatePresence>
          </ol>
        </section>

        <section className="crm-card crm-activity">
          <div className="crm-card-head">
            <p className="crm-card-title">Actividad reciente</p>
          </div>
          <ol className="crm-activity-rows">
            <AnimatePresence initial={false} mode="popLayout">
              {activity.map(a => (
                <m.li
                  key={a.id}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: EASE_OUT_PREMIUM }}
                  className="crm-activity-row"
                >
                  <span className="crm-activity-icon" aria-hidden>
                    <Inbox size={12} strokeWidth={1.75} />
                  </span>
                  <span className="crm-who">
                    <span className="crm-who-name">{a.title}</span>
                    <span className="crm-who-sub">{a.detail}</span>
                  </span>
                </m.li>
              ))}
            </AnimatePresence>
          </ol>
        </section>
      </div>
    </div>
  )
}

// ── Leads: kanban ────────────────────────────────────────────────────────────

interface KanbanProps {
  cards: DemoCard[]
  moving: { card: string; by: AgentKey } | null
}

export function KanbanView({ cards, moving }: KanbanProps) {
  return (
    <LayoutGroup id="crm-kanban">
      <div className="crm-kanban">
        {STAGES.map(stage => {
          const column = cards.filter(c => c.stage === stage)
          return (
            <section key={stage} className="crm-col" style={{ ['--col' as string]: STAGE_CONFIG[stage].color }}>
              <header className="crm-col-head">
                <span>
                  <i aria-hidden /> {STAGE_CONFIG[stage].label}
                </span>
                <span className="crm-count">{column.length}</span>
              </header>
              <div className="crm-col-cards">
                {column.map(card => {
                  const isMoving = moving?.card === card.id
                  return (
                    <m.article
                      key={card.id}
                      layoutId={card.id}
                      layout
                      className="crm-kcard"
                      data-moving={isMoving || undefined}
                      transition={{ layout: { duration: 0.7, ease: EASE_OUT_PREMIUM } }}
                    >
                      <div className="crm-kcard-top">
                        <Avatar name={card.name} tone={card.tone} size={22} />
                        <span className="crm-who-name">{card.name}</span>
                        <span className="crm-kcard-when">{card.when}</span>
                      </div>
                      <span className="crm-who-sub">{AGENTS[card.agent].name}</span>
                      <QualityText band={card.quality} />
                      <span className="crm-kcard-src">
                        {card.language} · {card.source}
                      </span>
                      <AnimatePresence>
                        {isMoving && moving && (
                          <m.span
                            className="crm-kcard-by"
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.25 }}
                          >
                            {AGENTS[moving.by].name.split(' ')[0]} la mueve
                          </m.span>
                        )}
                      </AnimatePresence>
                    </m.article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </LayoutGroup>
  )
}

// ── Propiedades ──────────────────────────────────────────────────────────────

const DRAFT = {
  address: 'Calle Sauce 27',
  area: 'Barrio Los Robles',
  price: '$398,500',
  specs: '3 hab · 2 baños · 156 m²',
  photo: '/landing/sala.webp',
}

interface PropertiesProps {
  /** 0 en espera · 1 leyendo el PDF · 2 dirección y precio · 3 fotos y datos · 4 lista. */
  draft: number
  onCreate: () => void
}

export function PropertiesView({ draft, onCreate }: PropertiesProps) {
  return (
    <div className="crm-props">
      <div className="crm-props-head">
        <div>
          <p className="crm-page-title">Propiedades</p>
          <p className="crm-card-sub">{PROPERTIES.length + (draft >= 4 ? 1 : 0)} propiedades en el inventario</p>
        </div>
        <button type="button" className="crm-btn-ghost" onClick={onCreate} disabled={draft > 0 && draft < 4}>
          <Sparkles size={13} strokeWidth={1.75} aria-hidden /> {draft > 0 && draft < 4 ? 'Leyendo el PDF…' : 'Crear con IA'}
        </button>
      </div>

      <div className="crm-props-grid">
        {PROPERTIES.map(p => (
          <article key={p.id} className="crm-card crm-prop">
            <div className="crm-prop-photo">
              <Image src={p.photo} alt={p.photoAlt} fill sizes="(max-width: 760px) 80vw, 240px" />
            </div>
            <div className="crm-prop-body">
              <div className="crm-prop-top">
                <span className="crm-who-name">{p.address}</span>
                <span className="crm-prop-status" data-status={p.status}>
                  {p.status}
                </span>
              </div>
              <span className="crm-who-sub">{p.area}</span>
              <div className="crm-prop-tags">
                <span>{p.mls}</span>
                {p.web && (
                  <span className="crm-web">
                    <Globe size={10} aria-hidden /> Web
                  </span>
                )}
              </div>
              <span className="crm-prop-price">{p.price}</span>
              <span className="crm-who-sub">
                {p.beds} hab · {p.baths} baños · {p.size}
              </span>
            </div>
          </article>
        ))}

        <article className="crm-card crm-prop crm-prop-draft" data-stage={draft}>
          {draft === 0 ? (
            <button type="button" className="crm-draft-idle" onClick={onCreate}>
              <FileText size={22} strokeWidth={1.5} aria-hidden />
              <span>Sube el PDF del listado y la IA arma la ficha</span>
            </button>
          ) : (
            <>
              <div className="crm-prop-photo">
                {draft >= 3 ? (
                  <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} style={{ position: 'absolute', inset: 0 }}>
                    <Image src={DRAFT.photo} alt="Sala con sofá blanco y muro de madera" fill sizes="240px" />
                  </m.div>
                ) : (
                  <span className="crm-skel crm-skel-photo" />
                )}
                <span className="crm-draft-badge">
                  <Sparkles size={11} aria-hidden /> {draft >= 4 ? 'Lista para revisar' : 'Leyendo listado.pdf'}
                </span>
              </div>
              <div className="crm-prop-body">
                {draft >= 2 ? (
                  <m.div className="crm-prop-fill" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                    <span className="crm-who-name">{DRAFT.address}</span>
                    <span className="crm-who-sub">{DRAFT.area}</span>
                    <span className="crm-prop-price">{DRAFT.price}</span>
                  </m.div>
                ) : (
                  <>
                    <span className="crm-skel" style={{ width: '70%' }} />
                    <span className="crm-skel" style={{ width: '45%' }} />
                    <span className="crm-skel" style={{ width: '55%', height: 18 }} />
                  </>
                )}
                {draft >= 3 ? (
                  <span className="crm-who-sub">{DRAFT.specs}</span>
                ) : (
                  <span className="crm-skel" style={{ width: '60%' }} />
                )}
              </div>
            </>
          )}
        </article>
      </div>
    </div>
  )
}
