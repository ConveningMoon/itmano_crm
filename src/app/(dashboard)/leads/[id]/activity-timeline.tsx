'use client'

import {
  UserPlus, Mail, MousePointer2, FileDown, Calendar, CheckCircle2,
  MessageCircle, Phone, XCircle, ArrowRightCircle, Activity, Circle,
} from 'lucide-react'
import type { LeadEvent } from '@/lib/types'

const EVENT_ICON_MAP: Record<string, { icon: React.ReactNode; color: string }> = {
  lead_created:            { icon: <UserPlus size={14} />,          color: '#5B8EC9' },
  email_opened:            { icon: <Mail size={14} />,              color: '#C9A96E' },
  email_clicked:           { icon: <MousePointer2 size={14} />,     color: '#C9A96E' },
  lm_downloaded:           { icon: <FileDown size={14} />,          color: '#5AAFA0' },
  consultation_scheduled:  { icon: <Calendar size={14} />,          color: '#9B72CF' },
  consultation_attended:   { icon: <CheckCircle2 size={14} />,      color: '#6BA368' },
  reply_received:          { icon: <MessageCircle size={14} />,     color: '#5AAFA0' },
  phone_call:              { icon: <Phone size={14} />,             color: '#5B8EC9' },
  unsubscribed:            { icon: <XCircle size={14} />,           color: '#C97B6B' },
  status_changed:          { icon: <ArrowRightCircle size={14} />,  color: '#9B72CF' },
  score_manual:            { icon: <Activity size={14} />,          color: '#C9A96E' },
}

const DEFAULT_EVENT = { icon: <Circle size={14} />, color: '#C9A96E' }

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('es-ES', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// Historial de actividad del lead — extraído de lead-detail-client para vivir
// como contenido del tab "Actividad".
export function ActivityTimeline({ events }: { events: LeadEvent[] }) {
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
              const { icon, color } = EVENT_ICON_MAP[event.type] ?? DEFAULT_EVENT
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
                  <div style={{ flex: 1, paddingTop: '5px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.4, flex: 1 }}>
                        {event.description}
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
