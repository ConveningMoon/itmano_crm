import Link from 'next/link'
import { AlertTriangle, OctagonAlert } from 'lucide-react'
import type { Entitlement } from '@/lib/subscriptions/entitlements'

// Aviso del límite blando de leads del plan: ámbar desde el 80%, rojo al
// bloquearse el alta. Es un aviso, no un muro: la lista sigue visible. Server
// Component puro; el copy ya viene resuelto por getEntitlements.
export function LeadLimitBanner({ entitlement }: { entitlement: Entitlement | null }) {
  if (!entitlement || entitlement.state === 'ok' || !entitlement.message) return null

  const blocked = entitlement.state === 'blocked'
  const accent = blocked ? 'var(--alert)' : 'var(--gold-2)'
  const Icon = blocked ? OctagonAlert : AlertTriangle

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        marginBottom: '16px',
        borderRadius: '8px',
        background: `color-mix(in srgb, ${accent} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${accent} 25%, transparent)`,
      }}
    >
      <Icon size={16} strokeWidth={1.8} style={{ color: accent, flexShrink: 0 }} />
      <p style={{ flex: 1, margin: 0, fontSize: '13px', lineHeight: 1.5, color: 'var(--text-primary)' }}>
        {entitlement.message}
      </p>
      <Link
        href="/settings"
        style={{ flexShrink: 0, fontSize: '12px', fontWeight: 600, color: accent, textDecoration: 'none', whiteSpace: 'nowrap' }}
      >
        Cambiar de plan →
      </Link>
    </div>
  )
}
