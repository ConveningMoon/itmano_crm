'use client'

import { usePathname, useRouter } from 'next/navigation'
import { m } from 'motion/react'
import { Plus, Bell } from 'lucide-react'
import { MobileNav } from './mobile-nav'
import type { TenantRole } from '@/lib/auth/tenant-context'

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
}: {
  role?: TenantRole
  unreadCount?: number
  userEmail?: string
  hubMode?: boolean
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
        <MobileNav role={role} userEmail={userEmail} hubMode={hubMode} />
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

      </div>
    </header>
  )
}
