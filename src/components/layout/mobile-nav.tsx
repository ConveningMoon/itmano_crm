'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Menu, X, LogOut } from 'lucide-react'
import { NavItem } from './nav-item'
import { BrandLogo } from './brand-logo'
import { signOut } from '@/lib/auth/sign-out'
import type { TenantRole } from '@/lib/auth/tenant-context'
import { navItemsForRole, ROLE_LABELS, initialsFromEmail } from './nav-items'

// Mobile navigation: a hamburger trigger (phones only) + a left-sliding drawer that
// mirrors the desktop sidebar (logo · nav · user/sign-out). Closes on overlay tap and
// on navigation. Entirely additive — the trigger is `md:hidden`, so ≥768px is unaffected.
export function MobileNav({ role, userEmail, hubMode = false, logoUrl = null, tenantName = null, planLabel = null }: {
  role: TenantRole
  userEmail: string
  hubMode?: boolean
  logoUrl?: string | null
  tenantName?: string | null
  planLabel?: string | null
}) {
  const [open, setOpen] = useState(false)
  const items = navItemsForRole(role, { hubMode })

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  return (
    <>
      {/* Trigger — phones only. `flex` here + `md:hidden` controls display via CSS class
          only — no inline display: so the md:hidden rule can override at ≥768px. */}
      <button
        type="button"
        aria-label="Abrir menú"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex md:hidden"
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          width: '40px',
          height: '40px',
          marginRight: '4px',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle)',
          background: 'transparent',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <Menu size={18} strokeWidth={2} />
      </button>

      {/* Overlay + sliding panel. AnimatePresence anima entrada y salida. */}
      <AnimatePresence>
        {open && (
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.15 } }}
        transition={{ duration: 0.2 }}
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 60,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <m.aside
          initial={{ x: '-100%' }}
          animate={{ x: 0 }}
          exit={{ x: '-100%', transition: { duration: 0.2, ease: 'easeIn' } }}
          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: '264px',
            maxWidth: '82vw',
            backgroundColor: 'var(--bg-surface)',
            borderRight: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header: logo + close */}
          <div
            style={{
              padding: '16px 14px 14px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <BrandLogo logoUrl={logoUrl} tenantName={tenantName} hubMode={hubMode} />
              <div style={{ fontSize: '10px', fontWeight: 300, color: 'var(--text-muted)', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                CRM by ITMANO
              </div>
            </div>
            <button
              type="button"
              aria-label="Cerrar menú"
              onClick={() => setOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '36px', height: '36px', borderRadius: '8px',
                border: '1px solid var(--border-subtle)', background: 'transparent',
                color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0,
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Nav — clicking any link closes the drawer (navigation happens on the Link). */}
          <nav
            onClick={() => setOpen(false)}
            style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' }}
          >
            {items.map(item => (
              <NavItem key={item.href} {...item} indicatorId="nav-indicator-mobile" hrefs={items.map(i => i.href)} />
            ))}
          </nav>

          {/* Footer: user + sign out */}
          <style>{`.mnav-signout:active { background: var(--bg-elevated) !important; }`}</style>
          <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ padding: '12px 16px 8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  backgroundColor: 'rgba(91,142,201,0.15)', border: '1px solid rgba(91,142,201,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: 600, color: 'var(--accent-blue)', flexShrink: 0,
                }}
              >
                {initialsFromEmail(userEmail)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {userEmail}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {ROLE_LABELS[role]}
                </div>
                {planLabel && (
                  <div style={{ fontSize: '10px', color: 'var(--accent-gold)', letterSpacing: '0.04em', marginTop: '2px' }}>
                    {planLabel}
                  </div>
                )}
              </div>
            </div>
            <form action={signOut} style={{ padding: '0 12px 14px' }}>
              <button
                type="submit"
                className="mnav-signout"
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                  padding: '10px 12px', fontSize: '13px', color: 'var(--text-muted)',
                  background: 'transparent', border: '1px solid var(--border-subtle)',
                  borderRadius: '8px', cursor: 'pointer',
                }}
              >
                <LogOut size={15} strokeWidth={1.6} />
                <span>Cerrar sesión</span>
              </button>
            </form>
          </div>
        </m.aside>
      </m.div>
        )}
      </AnimatePresence>
    </>
  )
}
