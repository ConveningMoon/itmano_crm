'use client'

import {
  UserPlus, Mail, MousePointer2, FileDown, Calendar, CheckCircle2,
  MessageCircle, Phone, XCircle, ArrowRightCircle, Activity, Circle,
  FileText, MailX, Send, Sparkles, ArrowUpRight,
} from 'lucide-react'
import type { LeadEvent } from '@/lib/types'

// Cada tipo de evento: icono + color + una acción legible ("Llenó un formulario",
// "Respondió un correo"…) y opcionalmente el tab del historial al que enlaza.
interface EventMeta { icon: React.ReactNode; color: string; action?: string; link?: 'formularios' | 'emails' }

const EVENT_META: Record<string, EventMeta> = {
  lead_created:          { icon: <UserPlus size={14} />,       color: '#5B8EC9', action: 'Lead creado' },
  form_baseline:         { icon: <FileText size={14} />,       color: '#5AAFA0', action: 'Llenó su primer formulario', link: 'formularios' },
  lead_resubmitted:      { icon: <FileText size={14} />,       color: '#5AAFA0', action: 'Reenvió un formulario', link: 'formularios' },
  second_lm:             { icon: <FileDown size={14} />,       color: '#5AAFA0', action: 'Descargó un 2º lead magnet', link: 'formularios' },
  third_lm:              { icon: <FileDown size={14} />,       color: '#5AAFA0', action: 'Descargó otro lead magnet', link: 'formularios' },
  event_submission:      { icon: <Calendar size={14} />,       color: '#9B72CF', action: 'Se registró a un evento', link: 'formularios' },
  contact_us_question:   { icon: <MessageCircle size={14} />,  color: '#5AAFA0', action: 'Envió una consulta de contacto', link: 'formularios' },
  lm_downloaded:         { icon: <FileDown size={14} />,       color: '#5AAFA0', action: 'Descargó material', link: 'formularios' },
  email_opened:          { icon: <Mail size={14} />,           color: '#C9A96E', action: 'Abrió un correo', link: 'emails' },
  email_clicked:         { icon: <MousePointer2 size={14} />,  color: '#C9A96E', action: 'Hizo clic en un correo', link: 'emails' },
  email_replied:         { icon: <MessageCircle size={14} />,  color: '#5AAFA0', action: 'Respondió un correo', link: 'emails' },
  manual_email_sent:     { icon: <Send size={14} />,           color: '#C9A96E', action: 'Se le envió un correo', link: 'emails' },
  email_hard_bounce:     { icon: <MailX size={14} />,          color: '#C97B6B', action: 'Su correo rebotó', link: 'emails' },
  email_unsubscribed:    { icon: <MailX size={14} />,          color: '#C97B6B', action: 'Canceló su suscripción', link: 'emails' },
  email_spam_complaint:  { icon: <MailX size={14} />,          color: '#C97B6B', action: 'Marcó un correo como spam', link: 'emails' },
  consultation_scheduled:{ icon: <Calendar size={14} />,       color: '#9B72CF', action: 'Agendó una consulta' },
  consultation_attended: { icon: <CheckCircle2 size={14} />,   color: '#6BA368', action: 'Asistió a una consulta' },
  reply_received:        { icon: <MessageCircle size={14} />,  color: '#5AAFA0', action: 'Respondió', link: 'emails' },
  phone_call:            { icon: <Phone size={14} />,          color: '#5B8EC9', action: 'Llamada telefónica' },
  ai_assessment:         { icon: <Sparkles size={14} />,       color: '#C9A96E', action: 'Análisis de fit con IA' },
  unsubscribed:          { icon: <XCircle size={14} />,        color: '#C97B6B' },
  status_changed:        { icon: <ArrowRightCircle size={14} />, color: '#9B72CF' },
  score_manual:          { icon: <Activity size={14} />,       color: '#C9A96E' },
}

const DEFAULT_META: EventMeta = { icon: <Circle size={14} />, color: '#C9A96E' }

const LINK_LABEL: Record<'formularios' | 'emails', string> = {
  formularios: 'Ver formulario',
  emails:      'Ver correo',
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('es-ES', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// Historial de actividad del lead — extraído de lead-detail-client para vivir
// como contenido del tab "Actividad".
export function ActivityTimeline({ events, onOpen }: { events: LeadEvent[]; onOpen?: (tab: 'formularios' | 'emails') => void }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Historial de actividad</span>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{events.length} eventos</span>
      </div>

      {events.length === 0 ? (
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Sin actividad registrada todavía.
        </p>
      ) : (
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: '13px', top: '14px', bottom: '14px', width: '2px', background: 'var(--border-subtle)' }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {events.map(event => {
              const meta = EVENT_META[event.type] ?? DEFAULT_META
              const { icon, color, action, link } = meta
              return (
                <div key={event.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', paddingBottom: '16px' }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%',
                    background: `${color}1F`, color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, position: 'relative', zIndex: 1,
                  }}>
                    {icon}
                  </div>
                  <div style={{ flex: 1, paddingTop: '3px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', justifyContent: 'space-between' }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        {action && (
                          <span style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.4 }}>{action}</span>
                        )}
                        <span style={{ display: 'block', fontSize: action ? '12px' : '13px', color: 'var(--text-muted)', lineHeight: 1.45, marginTop: action ? '1px' : 0 }}>
                          {event.description}
                        </span>
                        {link && onOpen && (
                          <button
                            onClick={() => onOpen(link)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '4px', padding: 0, background: 'none', border: 'none', cursor: 'pointer', fontSize: '11.5px', fontWeight: 600, color: 'var(--accent-gold)' }}
                          >
                            {LINK_LABEL[link]} <ArrowUpRight size={11} />
                          </button>
                        )}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        {event.points !== null && event.points !== 0 && (
                          <span style={{
                            fontSize: '11px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px',
                            background: event.points > 0 ? 'rgba(107,163,104,0.12)' : 'rgba(201,123,107,0.12)',
                            color: event.points > 0 ? 'var(--accent-green)' : 'var(--accent-coral)',
                          }}>
                            {event.points > 0 ? `+${event.points}` : event.points} pts
                          </span>
                        )}
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {event.author ? `${event.author} · ` : ''}{formatDateTime(event.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
