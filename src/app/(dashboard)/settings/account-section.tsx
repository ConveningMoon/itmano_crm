'use client'

import type { TenantRole } from '@/lib/auth/tenant-context'
import { SettingsCard, SettingsRow } from '@/components/ui/settings-row'

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
    <SettingsCard title="Acceso al CRM">
      <SettingsRow label="Método de autenticación">
        <div className="settings-inline">
          <span className="pill" data-tone="green">Magic Link</span>
          <span className="settings-note">Sin contraseña — acceso por enlace de un solo uso al email</span>
        </div>
      </SettingsRow>

      {/* Email con el que se inició sesión: el usuario autenticado real */}
      <SettingsRow label="Email de acceso" hint="El enlace de acceso llega a este email. Para cambiarlo, contacta a soporte ITMANO.">
        <span className="settings-value">{userEmail || '—'}</span>
      </SettingsRow>

      <SettingsRow label="Rol">
        <span className="pill" data-tone="blue">{ROLE_LABELS[userRole]}</span>
      </SettingsRow>

      {/* Dónde se gestiona el acceso de los demás miembros */}
      <SettingsRow label="Acceso del equipo">
        <p className="settings-note">
          {canManage ? (
            <>El acceso de login de los miembros del equipo se gestiona en la sección{' '}
              <button type="button" className="settings-link-btn settings-link-gold" onClick={onGoToAgents}>Agentes</button>.</>
          ) : (
            <>El acceso de login de los miembros del equipo lo gestiona el propietario de la cuenta.</>
          )}
        </p>
      </SettingsRow>
    </SettingsCard>
  )
}
