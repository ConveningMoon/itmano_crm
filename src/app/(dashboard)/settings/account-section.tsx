'use client'

import type { TenantRole } from '@/lib/auth/tenant-context'
import { LABEL, CARD, CARD_HEADER } from './settings-styles'

const ROLE_LABELS: Record<TenantRole, string> = {
  super_admin: 'Administrador ITMANO',
  agent_owner: 'Propietario',
  agent:       'Agente',
}

// ─── Account section ──────────────────────────────────────────────────────────

export function AccountSection({ userEmail, userRole, onGoToAgents, canManage }: {
  userEmail: string
  userRole: TenantRole
  onGoToAgents: () => void
  canManage: boolean
}) {
  return (
    <div style={CARD}>
      <div style={CARD_HEADER}>
        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Cuenta y acceso</span>
      </div>
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Auth method */}
        <div>
          <label style={LABEL}>Método de autenticación</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '10px', fontWeight: 500, color: 'var(--accent-green)', background: 'rgba(107,163,104,0.12)', padding: '2px 8px', borderRadius: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Magic Link
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Sin contraseña — acceso por enlace de un solo uso al email
            </span>
          </div>
        </div>

        {/* Login email — the real authenticated user */}
        <div>
          <label style={LABEL}>Email de acceso</label>
          <div style={{ fontSize: '14px', color: 'var(--text-primary)', padding: '9px 0' }}>
            {userEmail || '—'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            El enlace de acceso llega a este email. Para cambiarlo, contacta a soporte ITMANO.
          </div>
        </div>

        {/* Role */}
        <div>
          <label style={LABEL}>Rol</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '10px', fontWeight: 500, color: '#5B8EC9', background: 'rgba(91,142,201,0.12)', padding: '2px 8px', borderRadius: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {ROLE_LABELS[userRole]}
            </span>
          </div>
        </div>

        {/* Team access management pointer */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {canManage ? (
              <>El acceso de login de los miembros del equipo se gestiona en el tab{' '}
                <button onClick={onGoToAgents} style={{ background: 'none', border: 'none', color: 'var(--accent-gold)', cursor: 'pointer', padding: 0, fontSize: '12px' }}>Agentes</button>.</>
            ) : (
              <>El acceso de login de los miembros del equipo lo gestiona el propietario de la cuenta.</>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
