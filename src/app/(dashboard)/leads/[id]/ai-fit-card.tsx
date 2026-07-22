'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, RefreshCw } from 'lucide-react'
import { analyzeLeadFit } from './actions'

// Tarjeta "Análisis de fit (IA)" del detalle del lead. Muestra el razonamiento
// del último análisis y permite re-analizar a demanda. El análisis también corre
// solo en cada acción del lead (formulario, respuesta de correo…).
export function AiFitCard({
  leadId, enabled, reasoning, at, model,
}: {
  leadId: string
  // El tenant tiene el análisis con IA activado.
  enabled: boolean
  reasoning: string | null
  at: string | null
  model: string | null
}) {
  const router = useRouter()
  const [result, setResult] = useState<string | null>(reasoning)
  const [when, setWhen]     = useState<string | null>(at)
  const [error, setError]   = useState<string | null>(null)
  const [pending, start]    = useTransition()

  function run() {
    setError(null)
    start(async () => {
      const res = await analyzeLeadFit(leadId)
      if (!res.ok) { setError(res.error); return }
      setResult(res.reasoning ?? result)
      setWhen(new Date().toISOString())
      router.refresh()
    })
  }

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      borderRadius: '12px', padding: '20px', marginBottom: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '12px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
          <Sparkles size={15} color="var(--accent-gold)" /> Análisis de fit (IA)
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
          <RefreshCw size={12} /> {pending ? 'Analizando…' : result ? 'Re-analizar' : 'Analizar ahora'}
        </button>
      </div>

      {!enabled && (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: result ? '12px' : 0 }}>
          El análisis con IA está desactivado para este equipo. ITMANO puede activarlo desde el centro de control;
          mientras tanto el fit se calcula solo con las respuestas mapeadas del formulario.
        </div>
      )}

      {result ? (
        <>
          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>{result}</p>
          {when && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>
              {new Date(when).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              {model ? ` · ${model}` : ''}
            </div>
          )}
        </>
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
