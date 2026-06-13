'use client'

import { usePathname, useRouter } from 'next/navigation'
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
}

export function Topbar({
  role = 'agent_owner',
  unreadCount = 0,
  userEmail = '',
  avatarInitials = '',
}: {
  role?: TenantRole
  unreadCount?: number
  userEmail?: string
  avatarInitials?: string
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
        <MobileNav role={role} userEmail={userEmail} />
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
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '34px',
            height: '34px',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)',
            backgroundColor: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'background-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-elevated)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'
          }}
        >
          <Bell size={16} strokeWidth={2} />
          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '-5px',
                right: '-5px',
                minWidth: '17px',
                height: '17px',
                padding: '0 4px',
                borderRadius: '9px',
                backgroundColor: 'var(--accent-coral)',
                color: '#0B0C0E',
                fontSize: '10px',
                fontWeight: 700,
                lineHeight: '17px',
                textAlign: 'center',
              }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 14px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: 'var(--accent-gold)',
            color: '#0B0C0E',
            fontSize: '12px',
            fontWeight: '600',
            letterSpacing: '0.04em',
            cursor: 'pointer',
            transition: 'background-color 0.15s',
          }}
          onClick={() => router.push('/leads/new')}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--accent-gold-dim)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--accent-gold)' }}
          aria-label="Registrar Lead"
        >
          <Plus size={14} strokeWidth={2} />
          {/* Label collapses to an icon-only button on phones; full text at sm:+. */}
          <span className="hidden sm:inline">Registrar Lead</span>
        </button>

        {/* User avatar */}
        <div
          title={userEmail || 'Usuario'}
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
            cursor: 'default',
          }}
        >
          {avatarInitials || '??'}
        </div>
      </div>
    </header>
  )
}
