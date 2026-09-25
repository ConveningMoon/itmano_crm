'use client'

import { useRouter } from 'next/navigation'
import { Sparkles, Infinity as InfinityIcon } from 'lucide-react'
import type { AiLimitIndicator } from '@/lib/services/ai-limit'

// Indicador del límite mensual de IA del tenant. Solo muestra el PORCENTAJE
// consumido (los montos en USD son información interna de ITMANO y nunca
// llegan a esta UI). Discreto en estado normal; coral desde el 80%; "Límite
// alcanzado" al bloquearse. Click → Configuración.
//
// Vive en su propio archivo porque el layout lo monta desde un <Suspense>
// server-side: la lectura del límite llega por streaming y este componente
// sólo pinta lo que recibe.
export function AiLimitBadge({ status }: { status: AiLimitIndicator }) {
  const router = useRouter()
  const pct = Math.round(status.usedRatio * 100)
  const warn = !status.unlimited && status.usedRatio >= 0.8
  const accent = status.blocked || warn ? 'var(--accent-coral)' : 'var(--accent-gold)'

  const title = status.unlimited
    ? 'Generación con IA: acceso ilimitado'
    : status.blocked
      ? 'Límite mensual de generación con IA alcanzado. Se reinicia el día 1.'
      : `Generación con IA: ${pct}% del límite mensual utilizado`

  return (
    <button
      onClick={() => router.push('/settings')}
      title={title}
      aria-label={title}
      className="btn-icon"
      style={{
        display: 'flex', alignItems: 'center', gap: '7px',
        height: '34px', padding: '0 10px', borderRadius: '8px',
        border: `1px solid ${status.blocked ? 'rgba(201,123,107,0.4)' : 'var(--border-subtle)'}`,
        cursor: 'pointer', flexShrink: 0,
      }}
    >
      <Sparkles size={13} color={accent} />
      {status.unlimited ? (
        <InfinityIcon size={13} color="var(--accent-teal)" />
      ) : (
        <>
          {/* Barra de progreso — siempre visible, incluso en móvil */}
          <span style={{ width: '44px', height: '4px', borderRadius: '2px', background: 'var(--bg-elevated)', overflow: 'hidden', display: 'inline-block' }}>
            <span style={{ display: 'block', height: '100%', width: `${Math.max(4, pct)}%`, background: accent, borderRadius: '2px' }} />
          </span>
          <span className="hidden sm:inline" style={{ fontSize: '11px', color: status.blocked ? 'var(--accent-coral)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {status.blocked ? 'Límite alcanzado' : `${pct}%`}
          </span>
        </>
      )}
    </button>
  )
}
