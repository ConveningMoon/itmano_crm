'use client'

import { usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { Plus, Bell } from 'lucide-react'
import { MobileNav } from './mobile-nav'
import type { TenantRole } from '@/lib/auth/tenant-context'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':     'Dashboard',
  '/leads':         'Leads',
  '/analytics':     'Analytics',
  '/activity':      'Actividad',
  '/notifications': 'Notificaciones',
  '/settings':      'Configuración',
  '/admin':         'Centro de control',
}

// Lo que depende de la base (contador de no leídas, límite de IA, switcher de
// tenant, logo y plan) llega como ReactNode desde el layout, cada uno dentro
// de su <Suspense>: así la barra se pinta en cuanto se conoce el rol y esas
// piezas se rellenan por streaming sin mover nada.
export function Topbar({
  role = 'agent_owner',
  userEmail = '',
  hubMode = false,
  brand = null,
  planLabel = null,
  aiLimitSlot = null,
  tenantSwitcherSlot = null,
  unreadBadgeSlot = null,
}: {
  role?: TenantRole
  userEmail?: string
  hubMode?: boolean
  // Branding del tenant activo — solo lo consume el drawer móvil.
  brand?: ReactNode
  // Nombre del plan del tenant — lo consume el drawer móvil.
  planLabel?: ReactNode
  // Límite mensual de IA del tenant activo (vacío en modo hub).
  aiLimitSlot?: ReactNode
  // Solo definido para super_admin — el switcher de tenant.
  tenantSwitcherSlot?: ReactNode
  // Contador sobre la campana.
  unreadBadgeSlot?: ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const title = PAGE_TITLES[pathname] ?? 'ITMANO CRM'

  return (
    <header
      className="app-shell-topbar"
      style={{
        height: '56px',
        backgroundColor: 'var(--bg-base)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
        {/* Drawer trigger — phones only (md:hidden inside MobileNav). */}
        <MobileNav role={role} userEmail={userEmail} hubMode={hubMode} brand={brand} planLabel={planLabel} />
        <h1
          style={{
            fontSize: '15px',
            fontWeight: '500',
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </h1>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Uso de IA del mes — visible dentro del CRM de un tenant */}
        {aiLimitSlot}

        {/* Switcher de tenant — solo super_admin */}
        {tenantSwitcherSlot}

        {/* Notification bell */}
        <button
          aria-label="Notificaciones"
          onClick={() => router.push('/notifications')}
          className="btn-icon"
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '34px',
            height: '34px',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)',
            cursor: 'pointer',
          }}
        >
          <Bell size={16} strokeWidth={2} />
          {unreadBadgeSlot}
        </button>

        {/* Registrar Lead — oculto en modo hub (sin tenant seleccionado no hay
            destino para el lead; /leads/new redirigiría al centro de control). */}
        {!hubMode && (
          <button
            className="btn-cta"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: 'var(--accent-gold)',
              color: 'var(--bg-base)',
              fontSize: '12px',
              fontWeight: '600',
              letterSpacing: '0.04em',
              cursor: 'pointer',
            }}
            onClick={() => router.push('/leads/new')}
            aria-label="Registrar Lead"
          >
            <Plus size={14} strokeWidth={2} />
            {/* Label collapses to an icon-only button on phones; full text at sm:+. */}
            <span className="hidden sm:inline">Registrar Lead</span>
          </button>
        )}

      </div>
    </header>
  )
}
