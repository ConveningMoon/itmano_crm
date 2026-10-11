'use client'

import { useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, Clock, Mail, Sparkles } from 'lucide-react'
import { URGENCY_CONFIG } from '@/lib/scoring/priority'
import { AGENTS, leadById } from './demo-data'
import { Avatar, StageChip, qualityDot, stageDot, urgencyDot, useLive, useTicker } from './crm-bits'

// "La IA de cerca": la ficha de un lead como se ve en el CRM, anotada. Cada
// nota explica una zona de la interfaz y la ilumina; sin interacción, las
// notas se recorren solas mientras la sección está en pantalla.

const NOTES = [
  {
    title: 'Su lugar en tu cartera',
    body: 'Calidad y urgencia calculadas con las reglas de tu mercado. Sabes si es para hoy o puede esperar a la semana.',
  },
  {
    title: 'Lo que suma y lo que resta',
    body: 'A favor y en contra, en palabras. Nada de puntajes que haya que descifrar.',
  },
  {
    title: 'Qué hacer y qué decirle',
    body: 'Un próximo paso con su premura, los puntos para la conversación y la objeción que conviene anticipar.',
  },
  {
    title: 'Tu equipo también enseña',
    body: 'Una visita atendida o una propuesta enviada mueven su lugar en la cola en el momento.',
  },
] as const

const ACTIONS = [
  { label: 'Visita atendida', delta: '+25' },
  { label: 'Propuesta enviada', delta: '+20' },
  { label: 'Cita agendada', delta: '+15' },
  { label: 'No-show / sin respuesta', delta: '−10', negative: true },
]

const lead = leadById('mariana')

export function LeadFile() {
  const ref = useRef<HTMLDivElement>(null)
  const live = useLive(ref)
  const [focus, setFocus] = useState(0)
  const [held, setHeld] = useState(false)
  useTicker(live && !held, 3800, () => setFocus(f => (f + 1) % NOTES.length))
  const when = URGENCY_CONFIG[lead.urgency]

  const zone = (i: number) => ({ 'data-zone': i + 1, 'data-focus': focus === i || undefined })
  const marker = (i: number) => (
    <span className="lf-marker" aria-hidden>
      {i + 1}
    </span>
  )

  return (
    <div ref={ref} className="lf">
      <div className="lf-file">
        <div className="lf-head">
          <Avatar name={lead.name} tone={lead.tone} size={44} />
          <div>
            <p className="lf-name">
              {lead.name} <StageChip stage={lead.stage} />
            </p>
            <p className="crm-who-sub">
              {lead.email} · Español · {AGENTS[lead.agent].name}
            </p>
          </div>
          <span className="lf-mail">
            <Mail size={13} aria-hidden /> Enviar correo
          </span>
        </div>

        <section className="crm-card lf-zone" {...zone(0)}>
          {marker(0)}
          <div className="crm-priority-top">
            <div>
              <span className="crm-label">Prioridad</span>
              <p className="crm-priority-rank">#1 de 31 activos</p>
            </div>
            <div className="crm-priority-chips">
              {stageDot(lead.stage)}
              {qualityDot(lead.quality)}
              {urgencyDot(lead.urgency)}
            </div>
          </div>
          <dl className="crm-priority-why lf-zone-inner" {...zone(1)}>
            {marker(1)}
            <dt>A favor</dt>
            <dd>{lead.pro}</dd>
            <dt>En contra</dt>
            <dd className="crm-con">{lead.con}</dd>
          </dl>
        </section>

        <section className="crm-card crm-brief lf-zone" {...zone(2)}>
          {marker(2)}
          <p className="crm-brief-title">
            <Sparkles size={14} strokeWidth={1.75} aria-hidden /> Briefing del lead (IA)
          </p>
          <p className="crm-brief-read">{lead.briefing.read}</p>
          <div className="crm-brief-rest">
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
            <p className="crm-watch">
              <AlertTriangle size={14} aria-hidden />
              <span>
                <strong>A tener en cuenta:</strong> {lead.briefing.watchOut}
              </span>
            </p>
          </div>
        </section>

        <section className="crm-card lf-zone" {...zone(3)}>
          {marker(3)}
          <p className="crm-card-title">Acciones del agente</p>
          <p className="crm-card-sub">Cada acción ajusta su lugar en la cola.</p>
          <div className="lf-actions">
            {ACTIONS.map(a => (
              <span key={a.label} className="lf-action">
                {a.label} <b data-negative={a.negative || undefined}>{a.delta}</b>
              </span>
            ))}
          </div>
        </section>
      </div>

      <ol className="lf-notes" onMouseLeave={() => setHeld(false)}>
        {NOTES.map((n, i) => (
          <li key={n.title}>
            <button
              type="button"
              className="lf-note"
              aria-pressed={focus === i}
              onMouseEnter={() => {
                setHeld(true)
                setFocus(i)
              }}
              onFocus={() => {
                setHeld(true)
                setFocus(i)
              }}
              onClick={() => {
                setHeld(true)
                setFocus(i)
              }}
            >
              <span className="lf-note-n">{i + 1}</span>
              <span>
                <span className="lf-note-title">{n.title}</span>
                <span className="lf-note-body">{n.body}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
