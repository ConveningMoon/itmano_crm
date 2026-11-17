'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { acceptsManualActions, type Stage } from '@/lib/scoring/priority'
import { applyManualAction } from './actions'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ManualActionItem {
  dimension:    string   // lead_score_rules.dimension (the lead_event type)
  label:        string
  points:       number
  isDisqualify: boolean  // side_effect = force_perdido → score 0 / Perdido, needs confirmation
}

interface ManualActionsPanelProps {
  leadId:       string
  currentStage: Stage
  actions:      ManualActionItem[]
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ManualActionsPanel({ leadId, currentStage, actions }: ManualActionsPanelProps) {
  const router = useRouter()
  const [error, setError]       = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null) // dimension awaiting confirm
  const [isPending, startTransition] = useTransition()

  // Registrar una visita o una propuesta sobre un lead que ya cerró o se perdió
  // no describe nada: el panel se apaga en esas dos etapas. En proceso sí
  // admite acciones (ver MANUAL_ACTION_STAGES).
  const isOutOfFunnel = !acceptsManualActions(currentStage)
  // `disabled` real y no sólo pointer-events: con el teclado los botones se
  // seguían activando y el servidor respondía con un error.
  const locked = isOutOfFunnel || isPending

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
      {isOutOfFunnel && (
        <div style={{
          marginBottom: '12px',
          padding:      '8px 12px',
          borderRadius: '6px',
          background:   'color-mix(in srgb, var(--alert) 8%, transparent)',
          border:       '1px solid color-mix(in srgb, var(--alert) 20%, transparent)',
          fontSize:     '12px',
          color:        'var(--text-muted)',
        }}>
          Este lead está {currentStage === 'perdido' ? 'perdido' : 'cerrado'}: las acciones de seguimiento ya no aplican.
        </div>
      )}

      <div style={{ opacity: isOutOfFunnel ? 0.5 : 1 }} aria-disabled={isOutOfFunnel || undefined}>
        {/* Positive / neutral actions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {positive.map(a => (
            <button
              key={a.dimension}
              onClick={() => run(a.dimension, a.label)}
              disabled={locked}
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
                cursor:       isOutOfFunnel ? 'not-allowed' : isPending ? 'wait' : 'pointer',
              }}
            >
              {a.label}
              <span style={{
                fontSize:     '11px',
                fontWeight:   600,
                padding:      '1px 7px',
                borderRadius: '4px',
                background:   a.points >= 0 ? 'color-mix(in srgb, var(--gold-1) 14%, transparent)' : 'color-mix(in srgb, var(--alert) 14%, transparent)',
                color:        a.points >= 0 ? 'var(--gold-1)' : 'var(--alert)',
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
                <button className="btn btn-danger-solid"
                  onClick={() => run(disqualify.dimension, disqualify.label)}
                  disabled={isPending}
                >
                  {isPending ? 'Descalificando…' : 'Sí, descalificar'}
                </button>
                <button className="btn btn-ghost"
                  onClick={() => setConfirming(null)}
                  disabled={isPending}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setError(null); setFeedback(null); setConfirming(disqualify.dimension) }}
                disabled={locked}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '8px 14px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
                  border: '1px solid color-mix(in srgb, var(--alert) 35%, transparent)', background: 'transparent',
                  color: 'var(--alert)', cursor: isOutOfFunnel ? 'not-allowed' : 'pointer',
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
          color: error ? 'var(--alert)' : 'var(--gold-1)',
        }}>
          {error ?? feedback}
        </p>
      )}
    </div>
  )
}
