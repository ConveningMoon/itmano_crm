import type { ReactNode } from 'react'
import type { TenantRole } from '@/lib/auth/tenant-context'
import { ROLE_LABELS, initialsFromEmail } from './nav-items'

// Usuario activo al pie del sidebar: iniciales, email, rol y plan. Vive aparte
// del sidebar porque depende de la sesión y llega por streaming
// (SidebarUserSlot); el resto del sidebar sale en el shell prerenderizado.
export function SidebarUser({ email, role, planLabel = null }: {
  email: string
  role: TenantRole
  // Nombre de la suscripción del tenant (p. ej. "Plan Growth"); nada en hub.
  planLabel?: ReactNode
}) {
  return (
    <div
      style={{
        padding: '12px 16px 8px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}
    >
      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          backgroundColor: 'rgba(91,142,201,0.15)',
          border: '1px solid rgba(91,142,201,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11px',
          fontWeight: '600',
          color: 'var(--accent-blue)',
          flexShrink: 0,
        }}
      >
        {initialsFromEmail(email)}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: '12px',
            fontWeight: '500',
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {email}
        </div>
        <div
          style={{
            fontSize: '10px',
            color: 'var(--text-muted)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          {ROLE_LABELS[role]}
        </div>
        {planLabel}
      </div>
    </div>
  )
}
