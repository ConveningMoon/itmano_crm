import Image from 'next/image'
import { NavItem } from './nav-item'

const navItems = [
  { label: 'Dashboard',      href: '/dashboard',     icon: 'LayoutDashboard' },
  { label: 'Leads',          href: '/leads',         icon: 'Users' },
  { label: 'Fuentes',        href: '/sources',       icon: 'GitBranch' },
  { label: 'Emails',         href: '/emails',        icon: 'Mail' },
  { label: 'Analytics',      href: '/analytics',     icon: 'BarChart2' },
  { label: 'Configuración',  href: '/settings',      icon: 'Settings' },
]

export function Sidebar() {
  return (
    <aside
      style={{
        width: '220px',
        minWidth: '220px',
        height: '100vh',
        backgroundColor: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
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
          src="/Logo.PNG"
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
        {navItems.map(item => (
          <NavItem key={item.href} {...item} />
        ))}
      </nav>

      {/* Active user */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border-subtle)',
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
          AM
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
            Adriana Melendez
          </div>
          <div
            style={{
              fontSize: '10px',
              color: 'var(--text-muted)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            agent_owner
          </div>
        </div>
      </div>
    </aside>
  )
}
