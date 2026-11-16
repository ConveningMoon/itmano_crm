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
  const state = status.blocked ? 'blocked' : warn ? 'warn' : undefined

  const title = status.unlimited
    ? 'Generación con IA: acceso ilimitado'
    : status.blocked
      ? 'Límite mensual de generación con IA alcanzado. Se reinicia el día 1.'
      : `Generación con IA: ${pct}% del límite mensual utilizado`

  return (
    <button
      type="button"
      onClick={() => router.push('/settings')}
      title={title}
      aria-label={title}
      className="topbar-btn"
      data-state={state}
    >
      <Sparkles size={13} className={state ? undefined : 'text-gold'} aria-hidden="true" />
      {status.unlimited ? (
        <InfinityIcon size={13} className="text-gold" aria-hidden="true" />
      ) : (
        <>
          {/* Barra de progreso — siempre visible, incluso en móvil */}
          <span className="ai-meter" aria-hidden="true">
            <i style={{ width: `${Math.max(4, Math.min(100, pct))}%` }} />
          </span>
          <span className="ai-meter-pct hidden sm:inline">
            {status.blocked ? 'Límite alcanzado' : `${pct}%`}
          </span>
        </>
      )}
    </button>
  )
}
