'use client'

import {
  UserPlus, Mail, MousePointer2, FileDown, Calendar, CheckCircle2,
  MessageCircle, Phone, XCircle, ArrowRightCircle, Activity, Circle,
  FileText, MailX, Send, Sparkles, ArrowUpRight,
} from 'lucide-react'
import type { LeadEvent } from '@/lib/types'
import { FechaLocal } from '@/components/ui/local-date'

// Cada tipo de evento: icono + tono de la rampa dorada (coral sólo para rebotes,
// bajas y spam, que son alertas) + una acción legible ("Llenó un formulario",
// "Respondió un correo"…) y opcionalmente el tab del historial al que enlaza.
interface EventMeta { icon: React.ReactNode; color: string; action?: string; link?: 'formularios' | 'emails' }

const EVENT_META: Record<string, EventMeta> = {
  lead_created:          { icon: <UserPlus size={14} />,       color: 'var(--gold-1)', action: 'Lead creado' },
  form_baseline:         { icon: <FileText size={14} />,       color: 'var(--gold-3)', action: 'Llenó su primer formulario', link: 'formularios' },
  lead_resubmitted:      { icon: <FileText size={14} />,       color: 'var(--gold-3)', action: 'Reenvió un formulario', link: 'formularios' },
  second_lm:             { icon: <FileDown size={14} />,       color: 'var(--gold-3)', action: 'Descargó un 2º lead magnet', link: 'formularios' },
  third_lm:              { icon: <FileDown size={14} />,       color: 'var(--gold-3)', action: 'Descargó otro lead magnet', link: 'formularios' },
  event_submission:      { icon: <Calendar size={14} />,       color: 'var(--gold-4)', action: 'Se registró a un evento', link: 'formularios' },
  contact_us_question:   { icon: <MessageCircle size={14} />,  color: 'var(--gold-3)', action: 'Envió una consulta de contacto', link: 'formularios' },
  lm_downloaded:         { icon: <FileDown size={14} />,       color: 'var(--gold-3)', action: 'Descargó material', link: 'formularios' },
  email_opened:          { icon: <Mail size={14} />,           color: 'var(--gold-2)', action: 'Abrió un correo', link: 'emails' },
  email_clicked:         { icon: <MousePointer2 size={14} />,  color: 'var(--gold-2)', action: 'Hizo clic en un correo', link: 'emails' },
  email_replied:         { icon: <MessageCircle size={14} />,  color: 'var(--gold-3)', action: 'Respondió un correo', link: 'emails' },
  manual_email_sent:     { icon: <Send size={14} />,           color: 'var(--gold-2)', action: 'Se le envió un correo', link: 'emails' },
  email_hard_bounce:     { icon: <MailX size={14} />,          color: 'var(--alert)', action: 'Su correo rebotó', link: 'emails' },
  email_unsubscribed:    { icon: <MailX size={14} />,          color: 'var(--alert)', action: 'Canceló su suscripción', link: 'emails' },
  email_spam_complaint:  { icon: <MailX size={14} />,          color: 'var(--alert)', action: 'Marcó un correo como spam', link: 'emails' },
  consultation_scheduled:{ icon: <Calendar size={14} />,       color: 'var(--gold-4)', action: 'Agendó una consulta' },
  consultation_attended: { icon: <CheckCircle2 size={14} />,   color: 'var(--gold-1)', action: 'Asistió a una consulta' },
  reply_received:        { icon: <MessageCircle size={14} />,  color: 'var(--gold-3)', action: 'Respondió', link: 'emails' },
  phone_call:            { icon: <Phone size={14} />,          color: 'var(--gold-1)', action: 'Llamada telefónica' },
  ai_assessment:         { icon: <Sparkles size={14} />,       color: 'var(--gold-2)', action: 'Análisis de fit con IA' },
  unsubscribed:          { icon: <XCircle size={14} />,        color: 'var(--alert)' },
  status_changed:        { icon: <ArrowRightCircle size={14} />, color: 'var(--gold-4)' },
  score_manual:          { icon: <Activity size={14} />,       color: 'var(--gold-2)' },
}

const DEFAULT_META: EventMeta = { icon: <Circle size={14} />, color: 'var(--gold-2)' }

const LINK_LABEL: Record<'formularios' | 'emails', string> = {
  formularios: 'Ver formulario',
  emails:      'Ver correo',
}

function formatDateTime(dateStr: string) {
  return (
    <FechaLocal fecha={dateStr} opciones={{
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }} />
  )
}

// Historial de actividad del lead — extraído de lead-detail-client para vivir
// como contenido del tab "Actividad".
export function ActivityTimeline({ events, onOpen }: { events: LeadEvent[]; onOpen?: (tab: 'formularios' | 'emails') => void }) {
  return (
    <section className="feed">
      <div className="feed-caption">
        <h2 className="settings-card-title">Historial de actividad</h2>
        <span className="toolbar-meta">{events.length} eventos</span>
      </div>

      {events.length === 0 ? (
        <p className="settings-empty">Sin actividad registrada todavía.</p>
      ) : (
        events.map(event => {
          const { icon, color, action, link } = EVENT_META[event.type] ?? DEFAULT_META
          return (
            <div key={event.id} className="feed-row">
              <span className="feed-icon" style={{ '--tone': color } as React.CSSProperties} aria-hidden="true">{icon}</span>
              <div className="feed-body">
                {action && <span className="feed-title">{action}</span>}
                <p className={action ? 'feed-meta' : 'feed-text'}>{event.description}</p>
                {link && onOpen && (
                  <button type="button" onClick={() => onOpen(link)} className="feed-link">
                    {LINK_LABEL[link]} <ArrowUpRight size={11} aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="feed-side">
                {event.points !== null && event.points !== 0 && (
                  <span className="pill pill-square" style={{ '--tone': event.points > 0 ? 'var(--gold-2)' : 'var(--alert)' } as React.CSSProperties}>
                    {event.points > 0 ? `+${event.points}` : event.points} pts
                  </span>
                )}
                <span className="cell-muted">
                  {event.author ? `${event.author} · ` : ''}{formatDateTime(event.createdAt)}
                </span>
              </div>
            </div>
          )
        })
      )}
    </section>
  )
}
