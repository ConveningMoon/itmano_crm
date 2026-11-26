'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { startCheckout } from '@/app/(dashboard)/settings/billing-actions'
import type { SubscriptionPlan, BillingCycle } from '@/lib/subscriptions'

// Crea la transacción en el servidor y lleva al checkout inline de /pago, que
// la abre con `?_ptxn=` y vuelve a Configuración al completar el pago
// (`desde=crm`). La API key de Paddle NUNCA llega al navegador (vive solo en
// src/lib/paddle/env.ts, server-only).

interface Props {
  plan:  SubscriptionPlan
  cycle: BillingCycle
  label: string
}

export function PaddleCheckoutButton({ plan, cycle, label }: Props) {
  const router              = useRouter()
  const [error, setError]   = useState<string | null>(null)
  const [pending, startTx]  = useTransition()

  function onClick() {
    setError(null)
    startTx(async () => {
      const result = await startCheckout(plan, cycle)
      if (!result.ok) { setError(result.error); return }

      // Dentro de la transición: el botón sigue pendiente hasta que /pago carga.
      const params = new URLSearchParams({ _ptxn: result.data.transactionId, desde: 'crm' })
      router.push(`/pago?${params}`)
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="btn btn-primary"
      >
        {pending && <span className="loading-spinner" aria-hidden="true" />}
        {pending ? 'Preparando…' : label}
      </button>
      {error && (
        <p role="alert" className="form-error admin-msg">{error}</p>
      )}
    </div>
  )
}
