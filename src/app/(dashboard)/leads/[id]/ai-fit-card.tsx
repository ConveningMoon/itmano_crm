'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, RefreshCw, ArrowRight, AlertTriangle, Clock } from 'lucide-react'
import { analyzeLeadFit } from './actions'

// Briefing accionable del análisis de fit con IA (lo que el agente necesita
// antes de contactar): lectura del lead, próxima mejor acción con su premura,
// puntos de conversación y el riesgo a anticipar. El análisis corre solo en cada
// acción del lead y también a demanda.
export type NextActionWhen = 'hoy' | 'esta_semana' | 'sin_apuro'

export interface AiFitBriefing {
  read:          string
  nextAction:    string
  when:          NextActionWhen | null
  talkingPoints: string[]
  watchOut:      string
}

// Premura → etiqueta + color. NO es la temperatura del lead (esa mide qué tan
// buen prospecto es): mide qué tan pronto conviene actuar.
const WHEN_META: Record<NextActionWhen, { label: string; color: string; bg: string }> = {
  hoy:         { label: 'Hoy',          color: '#E07B3A', bg: 'rgba(224,123,58,0.14)' },
  esta_semana: { label: 'Esta semana',  color: '#5B8EC9', bg: 'rgba(91,142,201,0.14)' },
  sin_apuro:   { label: 'Sin apuro',    color: 'var(--text-muted)', bg: 'var(--bg-elevated)' },
}

export function AiFitCard({
  leadId, enabled, briefing, at,
}: {
  leadId: string
  // El tenant tiene el análisis con IA activado.
  enabled: boolean
  briefing: AiFitBriefing | null
  at: string | null
}) {
  const router = useRouter()
  const [data, setData]   = useState<AiFitBriefing | null>(briefing)
  const [when, setWhen]   = useState<string | null>(at)
  const [error, setError] = useState<string | null>(null)
  const [pending, start]  = useTransition()

  function run() {
    setError(null)
    start(async () => {
      const res = await analyzeLeadFit(leadId)
      if (!res.ok) { setError(res.error); return }
      if (res.briefing) setData(res.briefing)
      setWhen(new Date().toISOString())
      router.refresh()
    })
  }

  const whenMeta = data?.when ? WHEN_META[data.when] : null

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      borderRadius: '12px', padding: '20px', marginBottom: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '14px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
          <Sparkles size={15} color="var(--accent-gold)" /> Briefing del lead (IA)
        </span>
        <button
          onClick={run}
          disabled={pending}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px', fontSize: '12px', fontWeight: 500, borderRadius: '8px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)', cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.7 : 1,
          }}
        >
          <RefreshCw size={12} /> {pending ? 'Analizando…' : data ? 'Re-analizar' : 'Analizar ahora'}
        </button>
      </div>

      {!enabled && (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: data ? '14px' : 0 }}>
          El análisis con IA está desactivado para este equipo. ITMANO puede activarlo desde el centro de control;
          mientras tanto el fit se calcula solo con las respuestas mapeadas del formulario.
        </div>
      )}

      {data ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Lectura del lead */}
          {data.read && (
            <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{data.read}</p>
          )}

          {/* Próxima acción — destacada, con la premura */}
          {data.nextAction && (
            <div style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
              borderRadius: '10px', padding: '12px 14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent-gold)' }}>
                  <ArrowRight size={13} /> Próximo paso
                </span>
                {whenMeta && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    fontSize: '11px', fontWeight: 600, padding: '2px 9px', borderRadius: '10px',
                    color: whenMeta.color, background: whenMeta.bg,
                  }}>
                    <Clock size={11} /> {whenMeta.label}
                  </span>
                )}
              </div>
              <p style={{ fontSize: '13.5px', color: 'var(--text-primary)', lineHeight: 1.55, margin: 0 }}>{data.nextAction}</p>
            </div>
          )}

          {/* Puntos de conversación */}
          {data.talkingPoints.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Qué mencionar
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {data.talkingPoints.map((t, i) => (
                  <li key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{t}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Riesgo / objeción a anticipar */}
          {data.watchOut && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: '8px',
              fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5,
              padding: '10px 12px', borderRadius: '8px',
              background: 'rgba(201,123,107,0.08)', border: '1px solid rgba(201,123,107,0.22)',
            }}>
              <AlertTriangle size={14} color="var(--accent-coral)" style={{ flexShrink: 0, marginTop: '1px' }} />
              <span><strong style={{ color: 'var(--accent-coral)' }}>A tener en cuenta:</strong> {data.watchOut}</span>
            </div>
          )}

          {when && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Analizado el {new Date(when).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>
      ) : (
        !error && enabled && (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>
            Aún sin análisis. Se ejecuta automáticamente en cada acción del lead, o pulsa &quot;Analizar ahora&quot;.
          </p>
        )
      )}

      {error && (
        <div style={{ fontSize: '12px', color: 'var(--accent-coral)', marginTop: '10px', padding: '8px 12px', background: 'rgba(201,123,107,0.08)', borderRadius: '8px', lineHeight: 1.5 }}>
          {error}
        </div>
      )}
    </div>
  )
}
