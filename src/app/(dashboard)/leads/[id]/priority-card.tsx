'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  STAGE_CONFIG, QUALITY_CONFIG, URGENCY_CONFIG, formatPosition,
  type Stage, type QualityBand, type Urgency,
} from '@/lib/scoring/priority'
import type { ScoreBreakdown } from '@/lib/scoring/score-breakdown'
import type { LeadOpportunity } from '@/lib/scoring/opportunities'
import { formatMoney, type Currency } from '@/lib/business/profile'

// Reemplaza "Desglose del score" y "Temperatura del lead".
//
// El agente no necesita saber qué es fit, engagement o manual: necesita saber a
// quién llamar y por qué. Lo que se muestra son los tres ejes con nombre humano
// y los hechos que los sustentan. El desglose numérico sigue disponible, pero
// plegado — es para auditar, no para trabajar.
//
// El "próximo paso" y "a tener en cuenta" NO viven aquí: ya los da la tarjeta de
// análisis con IA, que es donde tienen contexto. Duplicarlos sería ruido.

export interface LeadPriority {
  stage:       Stage
  qualityBand: QualityBand
  urgency:     Urgency | null
  rank:        number
  total:       number
}

/** Lo que deja la operación si cierra. `commission` es null sin perfil de negocio. */
export interface LeadPotentialValue {
  amount:     number
  commission: number | null
  currency:   Currency | null
}

const CARD: React.CSSProperties = {
  background:   'var(--bg-surface)',
  border:       '1px solid var(--border-subtle)',
  borderRadius: '12px',
  padding:      '20px',
  marginBottom: '16px',
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      fontSize: '11px', fontWeight: 500, padding: '4px 10px', borderRadius: '999px',
      color, background: `color-mix(in srgb, ${color} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color }} />
      {label}
    </span>
  )
}

function FactRow({ label, items, negative = false }: {
  label: string; items: string[]; negative?: boolean
}) {
  if (items.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'baseline', marginTop: '10px' }}>
      <span style={{
        fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em',
        color: 'var(--text-muted)', minWidth: '74px', flexShrink: 0,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: '13px', lineHeight: 1.55,
        color: negative ? 'var(--accent-coral)' : 'var(--text-secondary)',
      }}>
        {items.join(' · ')}
      </span>
    </div>
  )
}

export function PriorityCard({ priority, breakdown, opportunities, potentialValue }: {
  priority:       LeadPriority | null
  breakdown:      ScoreBreakdown
  opportunities:  LeadOpportunity[]
  potentialValue: LeadPotentialValue | null
}) {
  const [open, setOpen] = useState(false)

  // Hechos declarados por el lead que empujan (o frenan) su calidad. Salen del
  // fit, que es lo único verificable — no de una interpretación.
  const aFavor   = breakdown.fit.lines.filter(l => l.points > 0).map(l => l.label)
  const enContra = breakdown.fit.lines.filter(l => l.points < 0).map(l => l.label)

  const position = priority && priority.total > 0
    ? formatPosition(priority.rank, priority.total)
    : null

  return (
    <div style={CARD}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '12px', flexWrap: 'wrap', marginBottom: '4px',
      }}>
        <div>
          <div style={{
            fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em',
            color: 'var(--text-muted)', marginBottom: '4px',
          }}>
            Prioridad
          </div>
          {position ? (
            <div style={{
              fontSize: '18px', fontWeight: 600,
              color: position.top ? 'var(--accent-gold)' : 'var(--text-primary)',
            }}>
              {position.text}
            </div>
          ) : (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {priority ? 'Fuera de la cola de hoy' : 'Sin datos suficientes'}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {priority && (
            <Chip
              label={STAGE_CONFIG[priority.stage].label}
              color={STAGE_CONFIG[priority.stage].color}
            />
          )}
          {priority && (
            <Chip
              label={`Calidad ${QUALITY_CONFIG[priority.qualityBand].label.toLowerCase()}`}
              color={QUALITY_CONFIG[priority.qualityBand].color}
            />
          )}
          {priority?.urgency && (
            <Chip
              label={URGENCY_CONFIG[priority.urgency].label}
              color={URGENCY_CONFIG[priority.urgency].color}
            />
          )}
        </div>
      </div>

      {breakdown.hasFitProfile ? (
        <>
          <FactRow label="A favor"   items={aFavor} />
          <FactRow label="En contra" items={enContra} negative />
          {/* Una oportunidad NO es un punto a favor: no hace mejor a este lead,
              abre otra operación. Por eso va aparte y no suma al score. */}
          {opportunities.map(o => (
            <div key={o.key} style={{
              marginTop: '12px', padding: '10px 12px', borderRadius: '8px',
              background: 'color-mix(in srgb, var(--accent-green) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-green) 22%, transparent)',
            }}>
              <div style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--accent-green)' }}>
                {o.label}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px', lineHeight: 1.5 }}>
                {o.hint}
              </div>
            </div>
          ))}
        </>
      ) : (
        <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '10px', fontStyle: 'italic' }}>
          Todavía no hay respuestas de formulario para calificar a este lead.
        </div>
      )}

      {/* Valor potencial. Va aparte de los ejes a propósito: no es una medida de
          qué tan bueno es el lead, es cuánto deja SI cierra. Mezclarlo con la
          calidad haría que un mal lead con presupuesto alto pareciera bueno. */}
      {potentialValue && (
        <div style={{
          marginTop: '14px', paddingTop: '12px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap',
        }}>
          <span style={{
            fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em',
            color: 'var(--text-muted)', minWidth: '74px', flexShrink: 0,
          }}>
            Si cierra
          </span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            Operación de{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {formatMoney(potentialValue.amount, potentialValue.currency)}
            </strong>
            {potentialValue.commission !== null ? (
              <> · deja{' '}
                <strong style={{ color: 'var(--accent-green)' }}>
                  {formatMoney(potentialValue.commission, potentialValue.currency)}
                </strong>
              </>
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>
                {' '}· configura tu comisión en Ajustes para ver cuánto deja
              </span>
            )}
          </span>
        </div>
      )}

      {/* Desglose numérico — plegado. Es para auditar el motor, no para trabajar. */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '14px',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          fontSize: '11.5px', color: 'var(--text-muted)',
        }}
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        Ver desglose numérico
      </button>

      {open && (
        <div style={{
          marginTop: '10px', paddingTop: '10px',
          borderTop: '1px solid var(--border-subtle)', fontSize: '12px',
        }}>
          {[
            ['Perfil (fit)',  breakdown.fit.total],
            ['Actividad',     breakdown.engagement.total],
            ['Acciones del agente', breakdown.manual.total],
          ].map(([label, pts]) => (
            <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span style={{ color: 'var(--text-muted)' }}>{label}</span>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{pts as number}</span>
            </div>
          ))}
          <div style={{
            display: 'flex', justifyContent: 'space-between', paddingTop: '8px', marginTop: '4px',
            borderTop: '1px solid var(--border-subtle)',
          }}>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Score interno</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{breakdown.total}/100</span>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.5 }}>
            La actividad pierde valor con el tiempo en este score; la calidad de arriba no.
            Un lead que se queda callado no empeora — solo deja de ser urgente.
          </p>
        </div>
      )}
    </div>
  )
}
