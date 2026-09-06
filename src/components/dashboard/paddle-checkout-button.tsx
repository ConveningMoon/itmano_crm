'use client'

import { useState, useTransition } from 'react'
import { initializePaddle, type Paddle } from '@paddle/paddle-js'
import { startCheckout } from '@/app/(dashboard)/settings/billing-actions'
import type { SubscriptionPlan, BillingCycle } from '@/lib/subscriptions'

// El client token es público a propósito: solo abre checkouts y previsualiza
// precios. La API key de Paddle NUNCA llega al navegador (vive solo en
// src/lib/paddle/env.ts, server-only).

interface Props {
  plan:  SubscriptionPlan
  cycle: BillingCycle
  label: string
}

export function PaddleCheckoutButton({ plan, cycle, label }: Props) {
  const [paddle, setPaddle] = useState<Paddle | null>(null)
  const [error, setError]   = useState<string | null>(null)
  const [pending, startTx]  = useTransition()

  async function ensurePaddle(): Promise<Paddle | null> {
    if (paddle) return paddle
    const instance = await initializePaddle({
      environment: process.env.NEXT_PUBLIC_PADDLE_ENV === 'production' ? 'production' : 'sandbox',
      token:       process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? '',
    })
    setPaddle(instance ?? null)
    return instance ?? null
  }

  function onClick() {
    setError(null)
    startTx(async () => {
      const result = await startCheckout(plan, cycle)
      if (!result.ok) { setError(result.error); return }

      const instance = await ensurePaddle()
      if (!instance) { setError('No se pudo cargar el proceso de inversión.'); return }

      instance.Checkout.open({
        transactionId: result.data.transactionId,
        settings: { theme: 'dark', displayMode: 'overlay' },
      })
    })
  }

  return (
    <div>
      <button
        onClick={onClick}
        disabled={pending}
        style={{
          background: 'var(--accent-gold)', color: 'var(--bg-base)',
          border: 'none', borderRadius: '8px', padding: '8px 18px',
          fontSize: '13px', fontWeight: 500, cursor: pending ? 'default' : 'pointer',
          opacity: pending ? 0.6 : 1, whiteSpace: 'nowrap',
        }}
      >
        {pending ? 'Preparando…' : label}
      </button>
      {error && (
        <p style={{ color: 'var(--accent-coral)', fontSize: '12px', marginTop: '6px', maxWidth: '260px' }}>{error}</p>
      )}
    </div>
  )
}
