'use client'

import { usePathname, useRouter } from 'next/navigation'
import { m } from 'motion/react'
import { Plus, Bell, Sparkles, Infinity as InfinityIcon } from 'lucide-react'
import { MobileNav } from './mobile-nav'
import { TenantSwitcher } from './tenant-switcher'
import type { TenantRole } from '@/lib/auth/tenant-context'
import type { SwitcherTenant } from '@/lib/data/tenants'
import type { AiLimitIndicator } from '@/lib/services/ai-limit'

// Indicador del límite mensual de IA del tenant. Solo muestra el PORCENTAJE
// consumido (los montos en USD son información interna de ITMANO y nunca
// llegan a esta UI). Discreto en estado normal; coral desde el 80%; "Límite
// alcanzado" al bloquearse. Click → Configuración.
function AiLimitBadge({ status, onClick }: { status: AiLimitIndicator; onClick: () => void }) {
  const pct = Math.round(status.usedRatio * 100)
  const warn = !status.unlimited && status.usedRatio >= 0.8
  const accent = status.blocked || warn ? 'var(--accent-coral)' : 'var(--accent-gold)'

  const title = status.unlimited
    ? 'Generación con IA: acceso ilimitado'
    : status.blocked
      ? 'Límite mensual de generación con IA alcanzado. Se reinicia el día 1.'
      : `Generación con IA: ${pct}% del límite mensual utilizado`

  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="btn-icon"
      style={{
        display: 'flex', alignItems: 'center', gap: '7px',
        height: '34px', padding: '0 10px', borderRadius: '8px',
        border: `1px solid ${status.blocked ? 'rgba(201,123,107,0.4)' : 'var(--border-subtle)'}`,
        cursor: 'pointer', flexShrink: 0,
      }}
    >
      <Sparkles size={13} color={accent} />
      {status.unlimited ? (
        <InfinityIcon size={13} color="var(--accent-teal)" />
      ) : (
        <>
          {/* Barra de progreso — siempre visible, incluso en móvil */}
          <span style={{ width: '44px', height: '4px', borderRadius: '2px', background: 'var(--bg-elevated)', overflow: 'hidden', display: 'inline-block' }}>
            <span style={{ display: 'block', height: '100%', width: `${Math.max(4, pct)}%`, background: accent, borderRadius: '2px' }} />
          </span>
          <span className="hidden sm:inline" style={{ fontSize: '11px', color: status.blocked ? 'var(--accent-coral)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {status.blocked ? 'Límite alcanzado' : `${pct}%`}
          </span>
        </>
      )}
    </button>
  )
}

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':     'Dashboard',
  '/leads':         'Leads',
  '/lead-magnets':  'Lead Magnets',
  '/analytics':     'Analytics',
  '/activity':      'Actividad',
  '/notifications': 'Notificaciones',
  '/settings':      'Configuración',
  '/admin':         'Centro de control',
}

export function Topbar({
  role = 'agent_owner',
  unreadCount = 0,
  userEmail = '',
  hubMode = false,
  tenants,
  activeTenantId = null,
  logoUrl = null,
  tenantName = null,
  aiLimit = null,
}: {
  role?: TenantRole
  unreadCount?: number
  userEmail?: string
  hubMode?: boolean
  // Solo definido para super_admin — activa el switcher de tenant.
  tenants?: SwitcherTenant[]
  activeTenantId?: string | null
  // Branding del tenant activo — solo lo consume el drawer móvil.
  logoUrl?: string | null
  tenantName?: string | null
  // Límite mensual de IA del tenant activo (null en modo hub).
  aiLimit?: AiLimitIndicator | null
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
        <MobileNav role={role} userEmail={userEmail} hubMode={hubMode} logoUrl={logoUrl} tenantName={tenantName} />
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
        {aiLimit && <AiLimitBadge status={aiLimit} onClick={() => router.push('/settings')} />}

        {/* Switcher de tenant — solo super_admin */}
        {tenants && <TenantSwitcher tenants={tenants} activeTenantId={activeTenantId} />}

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
          {unreadCount > 0 && (
            <m.span
              key={unreadCount}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 26 }}
              style={{
                position: 'absolute',
                top: '-5px',
                right: '-5px',
                minWidth: '17px',
                height: '17px',
                padding: '0 4px',
                borderRadius: '9px',
                backgroundColor: 'var(--accent-coral)',
                color: 'var(--bg-base)',
                fontSize: '10px',
                fontWeight: 700,
                lineHeight: '17px',
                textAlign: 'center',
              }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </m.span>
          )}
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
