'use client'

import { m } from 'motion/react'
import { AlertTriangle, ArrowRight, Clock, Sparkles, X } from 'lucide-react'
import { EASE_OUT_PREMIUM } from '@/components/motion/primitives'
import { URGENCY_CONFIG } from '@/lib/scoring/priority'
import { AGENTS, type DemoLead } from './demo-data'
import { Avatar, StageChip, qualityDot, stageDot, urgencyDot, useTyped } from './crm-bits'

// La ficha del lead dentro de la réplica: tarjeta de prioridad y briefing de IA
// con la misma estructura que src/app/(dashboard)/leads/[id] (ai-fit-card.tsx):
// lectura, próximo paso con su premura, qué mencionar y a tener en cuenta.

interface LeadDrawerProps {
  lead: DemoLead
  rank: number
  active: number
  typing: boolean
  onClose: () => void
}

export function LeadDrawer({ lead, rank, active, typing, onClose }: LeadDrawerProps) {
  const read = useTyped(lead.briefing.read, typing)
  const done = read.length === lead.briefing.read.length
  const agent = AGENTS[lead.agent]
  const when = URGENCY_CONFIG[lead.urgency]

  return (
    <m.aside
      className="crm-drawer"
      role="dialog"
      aria-label={`Ficha de ejemplo: ${lead.name}`}
      initial={{ x: '104%' }}
      animate={{ x: 0 }}
      exit={{ x: '104%', transition: { duration: 0.22 } }}
      transition={{ duration: 0.45, ease: EASE_OUT_PREMIUM }}
    >
      <div className="crm-drawer-head">
        <Avatar name={lead.name} tone={lead.tone} size={40} />
        <div style={{ minWidth: 0 }}>
          <p className="crm-drawer-name">
            {lead.name} <StageChip stage={lead.stage} />
          </p>
          <p className="crm-drawer-meta">
            {lead.email} · {lead.language} · {agent.name}
          </p>
        </div>
        <button type="button" className="crm-icon-btn" onClick={onClose} aria-label="Cerrar la ficha">
          <X size={15} strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      <div className="crm-drawer-body">
        <section className="crm-card crm-priority">
          <div className="crm-priority-top">
            <div>
              <span className="crm-label">Prioridad</span>
              <p className="crm-priority-rank">
                #{rank} de {active} activos
              </p>
            </div>
            <div className="crm-priority-chips">
              {stageDot(lead.stage)}
              {qualityDot(lead.quality)}
              {urgencyDot(lead.urgency)}
            </div>
          </div>
          <dl className="crm-priority-why">
            <dt>A favor</dt>
            <dd>{lead.pro}</dd>
            {lead.con && (
              <>
                <dt>En contra</dt>
                <dd className="crm-con">{lead.con}</dd>
              </>
            )}
          </dl>
        </section>

        <section className="crm-card crm-brief">
          <p className="crm-brief-title">
            <Sparkles size={14} strokeWidth={1.75} aria-hidden /> Briefing del lead (IA)
          </p>
          <p className="crm-brief-read">
            {read}
            {!done && <span className="crm-caret" aria-hidden />}
          </p>
          <m.div
            className="crm-brief-rest"
            initial={false}
            animate={{ opacity: done ? 1 : 0, y: done ? 0 : 6 }}
            transition={{ duration: 0.4, ease: EASE_OUT_PREMIUM }}
          >
            <div className="crm-next">
              <div className="crm-next-top">
                <span className="crm-next-label">
                  <ArrowRight size={13} aria-hidden /> Próximo paso
                </span>
                <span className="crm-next-when" style={{ color: when.color, backgroundColor: `color-mix(in srgb, ${when.color} 14%, transparent)` }}>
                  <Clock size={11} aria-hidden /> {when.label}
                </span>
              </div>
              <p>{lead.briefing.nextAction}</p>
            </div>
            <div>
              <span className="crm-label">Qué mencionar</span>
              <ul className="crm-points">
                {lead.briefing.talkingPoints.map(t => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            {lead.briefing.watchOut && (
              <p className="crm-watch">
                <AlertTriangle size={14} aria-hidden />
                <span>
                  <strong>A tener en cuenta:</strong> {lead.briefing.watchOut}
                </span>
              </p>
            )}
          </m.div>
        </section>
      </div>
    </m.aside>
  )
}
