'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { LeadStatus } from '@/lib/types'
import { insertScoringEvents } from './actions'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScoringTestPanelProps {
  leadId: string
  currentStatus: LeadStatus
  currentScore: number | null
}

interface ScoringEvent {
  label: string
  type: string
  points: number
}

interface Category {
  label: string
  events: ScoringEvent[]
}

// ─── Data ─────────────────────────────────────────────────────────────────────

// Event types match the new scoring engine's engagement & manual rules
// (lead_score_rules.dimension). Fit is trait-based (leads.fit_profile), not an
// event, so it is not fired here. The score is derived by recompute_lead_score
// from the rules — the points shown below are informational.
const CATEGORIES: Category[] = [
  {
    label: 'Engagement',
    events: [
      { label: 'Formulario enviado',          type: 'form_baseline',        points: 10   },
      { label: '2º lead magnet',              type: 'second_lm',            points: 8    },
      { label: '3º+ lead magnet',             type: 'third_lm',             points: 12   },
      { label: 'Pregunta de contacto',        type: 'contact_us_question',  points: 20   },
      { label: 'Click en email',              type: 'email_clicked',        points: 10   },
      { label: 'Respuesta a email',           type: 'email_replied',        points: 20   },
    ],
  },
  {
    label: 'Engagement negativo',
    events: [
      { label: 'Hard bounce',                 type: 'email_hard_bounce',    points: -30  },
      { label: 'Desuscripción',               type: 'email_unsubscribed',   points: -40  },
      { label: 'Queja de spam',               type: 'email_spam_complaint', points: -100 },
    ],
  },
  {
    label: 'Manual',
    events: [
      { label: 'Cita agendada',               type: 'appointment_scheduled', points: 15  },
      { label: 'Visita atendida',             type: 'visit_attended',        points: 25  },
      { label: 'Propuesta enviada',           type: 'proposal_sent',         points: 20  },
      { label: 'No-show / sin respuesta',     type: 'no_show_no_answer',     points: -10 },
      { label: 'Descalificación manual',      type: 'manual_disqualify',     points: 0   },
    ],
  },
]

const FROZEN_STATUSES = ['process_started', 'process_completed', 'closed', 'lost'] as const

// ─── Component ────────────────────────────────────────────────────────────────

export function ScoringTestPanel({ leadId, currentStatus }: ScoringTestPanelProps) {
  const router = useRouter()
  const [checked, setChecked]     = useState<Set<string>>(new Set())
  const [error, setError]         = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const isFrozen = (FROZEN_STATUSES as readonly string[]).includes(currentStatus)

  function toggle(type: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  function handleSave() {
    if (checked.size === 0) return
    setError(null)

    const selectedEvents = CATEGORIES.flatMap(cat =>
      cat.events
        .filter(e => checked.has(e.type))
        .map(e => ({ type: e.type, description: e.label, points: e.points }))
    )

    startTransition(async () => {
      const res = await insertScoringEvents(leadId, selectedEvents)
      if (res.ok) {
        setChecked(new Set())
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div style={{
      background:    'var(--bg-surface)',
      border:        '1px solid var(--border-subtle)',
      borderRadius:  '12px',
      padding:       '20px 24px',
      marginTop:     '24px',
      marginBottom:  '24px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
          Panel de scoring
        </span>
        <span style={{
          fontSize:       '10px',
          fontWeight:     600,
          padding:        '2px 6px',
          borderRadius:   '4px',
          background:     'rgba(201,169,110,0.12)',
          color:          'var(--accent-gold)',
          letterSpacing:  '0.08em',
          textTransform:  'uppercase',
        }}>
          SCORING TEST
        </span>
      </div>

      {/* Frozen banner */}
      {isFrozen && (
        <div style={{
          marginBottom: '12px',
          padding:      '8px 12px',
          borderRadius: '6px',
          background:   'rgba(201,123,107,0.08)',
          border:       '1px solid rgba(201,123,107,0.2)',
          fontSize:     '12px',
          color:        'var(--text-muted)',
        }}>
          Score congelado — este lead está fuera del funnel activo.
        </div>
      )}

      {/* Table content */}
      <div style={{ opacity: isFrozen ? 0.5 : 1, pointerEvents: isFrozen ? 'none' : 'auto' }}>
        {CATEGORIES.map(cat => (
          <div key={cat.label}>
            {/* Category divider */}
            <div style={{
              fontSize:      '10px',
              fontWeight:    600,
              color:         'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              padding:       '10px 0 6px',
              borderTop:     '1px solid var(--border-subtle)',
              marginTop:     '4px',
            }}>
              {cat.label}
            </div>

            {cat.events.map(evt => (
              <label key={evt.type} style={{
                display:    'flex',
                alignItems: 'center',
                gap:        '10px',
                padding:    '6px 0',
                cursor:     'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={checked.has(evt.type)}
                  onChange={() => toggle(evt.type)}
                  style={{
                    accentColor: 'var(--accent-gold)',
                    width:       '15px',
                    height:      '15px',
                    flexShrink:  0,
                  }}
                />
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', flex: 1 }}>
                  {evt.label}
                </span>
                <span style={{
                  fontSize:    '11px',
                  fontWeight:  600,
                  padding:     '1px 8px',
                  borderRadius: '4px',
                  background:  evt.points > 0 ? 'rgba(107,163,104,0.12)' : 'rgba(201,123,107,0.12)',
                  color:       evt.points > 0 ? '#6BA368' : '#C97B6B',
                  minWidth:    '48px',
                  textAlign:   'center',
                }}>
                  {evt.points > 0 ? `+${evt.points}` : evt.points}
                </span>
              </label>
            ))}
          </div>
        ))}

        {/* Footer */}
        <div style={{
          marginTop:      '16px',
          display:        'flex',
          alignItems:     'center',
          gap:            '12px',
          justifyContent: 'flex-end',
        }}>
          {error && (
            <span style={{ fontSize: '12px', color: '#C97B6B', flex: 1 }}>
              {error}
            </span>
          )}
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {checked.size > 0
              ? `${checked.size} evento${checked.size > 1 ? 's' : ''} seleccionado${checked.size > 1 ? 's' : ''}`
              : 'Ningún evento seleccionado'}
          </span>
          <button
            onClick={handleSave}
            disabled={checked.size === 0 || isPending}
            style={{
              padding:      '7px 20px',
              fontSize:     '13px',
              fontWeight:   500,
              borderRadius: '8px',
              background:   checked.size > 0 && !isPending ? 'var(--accent-gold)' : 'var(--bg-overlay)',
              color:        checked.size > 0 && !isPending ? 'var(--bg-base)' : 'var(--text-muted)',
              border:       'none',
              cursor:       checked.size > 0 && !isPending ? 'pointer' : 'not-allowed',
            }}
          >
            {isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
