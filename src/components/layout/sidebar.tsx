import type { ReactNode } from 'react'
import { LogOut } from 'lucide-react'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { signOut } from '@/lib/auth/sign-out'

// Marco del sidebar de escritorio. Es estático: sale en el shell prerenderizado
// del dashboard. Lo que depende de la sesión o de la base (logo, ítems según el
// rol, usuario y plan) llega como ReactNode desde el layout, cada pieza dentro
// de su <Suspense> con un fallback del mismo tamaño (ver shell-slots.tsx).
export function Sidebar({ brand, nav, user }: {
  brand: ReactNode
  // Ítems del nav (los <NavItem>); el <nav> que los contiene es de aquí.
  nav: ReactNode
  // Bloque del usuario activo (SidebarUser) — sin el botón de cerrar sesión.
  user: ReactNode
}) {
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
        {brand}
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
        {nav}
      </nav>

      {/* Active user + sign out */}
      <style>{`.signout-btn:hover { background: var(--bg-elevated) !important; color: var(--text-secondary) !important; }`}</style>
      <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
        {user}

        <form action={signOut} style={{ padding: '0 12px 12px' }}>
          <PendingSubmitButton
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
              transition: 'background-color var(--dur-fast), color var(--dur-fast)',
            }}
          >
            <LogOut size={14} strokeWidth={1.6} />
            <span>Cerrar sesión</span>
          </PendingSubmitButton>
        </form>
      </div>
    </aside>
  )
}
