import Image from 'next/image'
import { LogOut } from 'lucide-react'
import { NavItem } from './nav-item'
import { signOut } from '@/lib/auth/sign-out'
import type { TenantRole } from '@/lib/auth/tenant-context'
import { navItemsForRole, ROLE_LABELS, initialsFromEmail } from './nav-items'

export function Sidebar({ role, userEmail }: { role: TenantRole; userEmail: string }) {
  // Admin console is super_admin-only — hidden from the nav for everyone else.
  const items = navItemsForRole(role)

  return (
    // Hidden on phones (drawer takes over <md); restored to the fixed flex column
    // at md: — the desktop (≥768px) render is byte-identical to before.
    <aside
      className="hidden md:flex"
      style={{
        width: '220px',
        minWidth: '220px',
        height: '100vh',
        backgroundColor: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-subtle)',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 40,
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: '18px 16px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
        }}
      >
        <Image
          src="/A&J_Logo_White.png"
          alt="ITMANO"
          width={120}
          height={44}
          priority
          style={{ objectFit: 'contain', display: 'block', marginBottom: '8px' }}
        />
        <div
          style={{
            fontSize: '10px',
            fontWeight: 300,
            color: 'var(--text-muted)',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}
        >
          CRM by ITMANO
        </div>
      </div>

      {/* Nav */}
      <nav
        style={{
          flex: 1,
          padding: '12px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          overflowY: 'auto',
        }}
      >
        {items.map(item => (
          <NavItem key={item.href} {...item} />
        ))}
      </nav>

      {/* Active user + sign out */}
      <style>{`.signout-btn:hover { background: var(--bg-elevated) !important; color: var(--text-secondary) !important; }`}</style>
      <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
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
            {initialsFromEmail(userEmail)}
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
              {userEmail}
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
          </div>
        </div>

        <form action={signOut} style={{ padding: '0 12px 12px' }}>
          <button
            type="submit"
            className="signout-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              padding: '7px 10px',
              fontSize: '12px',
              color: 'var(--text-muted)',
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <LogOut size={14} strokeWidth={1.6} />
            <span>Cerrar sesión</span>
          </button>
        </form>
      </div>
    </aside>
  )
}
