'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { LeadStatus } from '@/lib/types'
import { applyManualAction } from './actions'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ManualActionItem {
  dimension:    string   // lead_score_rules.dimension (the lead_event type)
  label:        string
  points:       number
  isDisqualify: boolean  // side_effect = force_perdido → score 0 / Perdido, needs confirmation
}

interface ManualActionsPanelProps {
  leadId:        string
  currentStatus: LeadStatus
  actions:       ManualActionItem[]
}

const FROZEN_STATUSES = ['process_started', 'process_completed', 'closed', 'lost'] as const

// ─── Component ────────────────────────────────────────────────────────────────

export function ManualActionsPanel({ leadId, currentStatus, actions }: ManualActionsPanelProps) {
  const router = useRouter()
  const [error, setError]       = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null) // dimension awaiting confirm
  const [isPending, startTransition] = useTransition()

  const isFrozen = (FROZEN_STATUSES as readonly string[]).includes(currentStatus)

  const positive = actions.filter(a => !a.isDisqualify)
  const disqualify = actions.find(a => a.isDisqualify)

  function run(dimension: string, label: string) {
    setError(null); setFeedback(null); setConfirming(null)
    startTransition(async () => {
      const res = await applyManualAction(leadId, dimension)
      if (!res.ok) { setError(res.error); return }
      setFeedback(`${label} registrado · score ${res.score}`)
      router.refresh()
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
          Acciones del agente
        </span>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Registra una interacción de seguimiento. Cada acción ajusta el score del lead.
      </p>

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
          Este lead está fuera del funnel activo — las acciones manuales no aplican.
        </div>
      )}

      <div style={{ opacity: isFrozen ? 0.5 : 1, pointerEvents: isFrozen ? 'none' : 'auto' }}>
        {/* Positive / neutral actions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {positive.map(a => (
            <button
              key={a.dimension}
              onClick={() => run(a.dimension, a.label)}
              disabled={isPending}
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                gap:          '8px',
                padding:      '8px 14px',
                fontSize:     '13px',
                fontWeight:   500,
                borderRadius: '8px',
                border:       '1px solid var(--border-subtle)',
                background:   'var(--bg-elevated)',
                color:        'var(--text-primary)',
                cursor:       isPending ? 'wait' : 'pointer',
              }}
            >
              {a.label}
              <span style={{
                fontSize:     '11px',
                fontWeight:   600,
                padding:      '1px 7px',
                borderRadius: '4px',
                background:   a.points >= 0 ? 'rgba(107,163,104,0.14)' : 'rgba(201,123,107,0.14)',
                color:        a.points >= 0 ? 'var(--accent-green)' : 'var(--accent-coral)',
              }}>
                {a.points >= 0 ? `+${a.points}` : a.points}
              </span>
            </button>
          ))}
        </div>

        {/* Disqualify — destructive, with confirmation */}
        {disqualify && (
          <div style={{ marginTop: '14px', borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
            {confirming === disqualify.dimension ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Esto marca el lead como <strong>Perdido</strong> y congela el score. ¿Confirmar?
                </span>
                <button
                  onClick={() => run(disqualify.dimension, disqualify.label)}
                  disabled={isPending}
                  style={{
                    padding: '7px 14px', fontSize: '12px', fontWeight: 500, borderRadius: '8px',
                    border: 'none', background: 'var(--accent-coral)', color: 'var(--bg-base)',
                    cursor: isPending ? 'wait' : 'pointer',
                  }}
                >
                  {isPending ? 'Descalificando…' : 'Sí, descalificar'}
                </button>
                <button
                  onClick={() => setConfirming(null)}
                  disabled={isPending}
                  style={{
                    padding: '7px 14px', fontSize: '12px', borderRadius: '8px',
                    border: '1px solid var(--border-subtle)', background: 'transparent',
                    color: 'var(--text-muted)', cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setError(null); setFeedback(null); setConfirming(disqualify.dimension) }}
                disabled={isPending}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '8px 14px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
                  border: '1px solid rgba(201,123,107,0.35)', background: 'transparent',
                  color: 'var(--accent-coral)', cursor: 'pointer',
                }}
              >
                {disqualify.label}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Feedback */}
      {(error || feedback) && (
        <p style={{
          fontSize: '12px',
          marginTop: '14px',
          marginBottom: 0,
          color: error ? 'var(--accent-coral)' : 'var(--accent-green)',
        }}>
          {error ?? feedback}
        </p>
      )}
    </div>
  )
}
