'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { resetTenantScoring } from '../admin/scoring-actions'

// Quita la calibración del tenant y vuelve al orden global. Pide confirmación en
// el propio botón: cambia los puntos de todos sus leads.
export function ResetScoringButton({ tenantId }: { tenantId: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (!confirming) {
    return (
      <button type="button" className="btn btn-ghost" onClick={() => setConfirming(true)}>
        Volver al modelo global
      </button>
    )
  }

  return (
    <span className="settings-inline settings-inline-tight">
      {error && <span className="settings-footer-msg-error" role="alert">{error}</span>}
      <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={pending}>Cancelar</button>
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        onClick={() => start(async () => {
          const res = await resetTenantScoring(tenantId)
          if (!res.ok) { setError(res.error); return }
          setConfirming(false)
          router.refresh()
        })}
      >
        {pending ? 'Recalculando…' : 'Sí, volver al global'}
      </button>
    </span>
  )
}
