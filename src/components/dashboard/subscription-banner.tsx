import Link from 'next/link'
import { AlertTriangle, OctagonAlert } from 'lucide-react'
import type { TenantAccess } from '@/lib/subscriptions/access'

interface SubscriptionBannerProps {
  banner: TenantAccess['banner']
}

// Aviso de estado de suscripcion sobre el area principal del dashboard. Los
// textos ya vienen resueltos por getTenantAccess (access.ts) — este componente
// solo les da estructura, nunca reescribe el copy. Es un Server Component puro:
// sin hooks, sin 'use client', porque no hay estado ni interaccion propia mas
// alla del enlace a /settings.
//
// Tono calmado a proposito: `past_due` (ambar) es solo un fallo de tarjeta, no
// un impago — Paddle Retain hace el dunning antes de degradar nada (ver
// access.ts). El banner es un aviso, no un muro: no bloquea ni oscurece el
// resto de la vista.
export function SubscriptionBanner({ banner }: SubscriptionBannerProps) {
  if (!banner) return null

  const accent = banner.tone === 'amber' ? 'var(--accent-gold)' : 'var(--accent-coral)'
  const Icon = banner.tone === 'amber' ? AlertTriangle : OctagonAlert

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 24px',
        background: `color-mix(in srgb, ${accent} 8%, transparent)`,
        borderBottom: `1px solid color-mix(in srgb, ${accent} 25%, transparent)`,
      }}
    >
      <Icon size={16} strokeWidth={1.8} style={{ color: accent, flexShrink: 0 }} />
      <p style={{ flex: 1, margin: 0, fontSize: '13px', lineHeight: 1.5, color: 'var(--text-primary)' }}>
        {banner.message}
      </p>
      <Link
        href="/settings"
        style={{
          flexShrink: 0,
          fontSize: '12px',
          fontWeight: 600,
          color: accent,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {banner.cta} →
      </Link>
    </div>
  )
}
