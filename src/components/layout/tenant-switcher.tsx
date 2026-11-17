'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Check, ChevronsUpDown, ShieldCheck } from 'lucide-react'
import { enterTenant, exitToHub } from '@/app/(dashboard)/admin/actions'
import type { SwitcherTenant } from '@/lib/data/tenants'

// Switcher de tenant del topbar — solo lo ve el super_admin. Es a la vez el
// indicador de "actuando como": dot del color del tenant + nombre. Cambiar de
// tenant aterriza siempre en /dashboard (la entidad abierta no existe en el
// otro tenant).
export function TenantSwitcher({
  tenants,
  activeTenantId,
}: {
  tenants: SwitcherTenant[]
  activeTenantId: string | null
}) {
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()
  const rootRef = useRef<HTMLDivElement>(null)

  const active = tenants.find(t => t.id === activeTenantId) ?? null

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  function select(tenantId: string) {
    setOpen(false)
    if (tenantId === activeTenantId) return
    startTransition(() => enterTenant(tenantId))
  }

  function goToHub() {
    setOpen(false)
    startTransition(() => exitToHub())
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="topbar-btn topbar-switcher"
      >
        <span className="topbar-dot" style={active ? { '--tone': active.color } as React.CSSProperties : undefined} aria-hidden="true" />
        <span className="topbar-switcher-name hidden sm:inline" data-empty={active ? undefined : ''}>
          {active ? active.name : 'Elegir tenant'}
        </span>
        <ChevronsUpDown size={14} className="text-muted-icon" aria-hidden="true" />
      </button>

      <AnimatePresence>
        {open && (
          <m.div
            role="menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              zIndex: 55,
              minWidth: '220px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '10px',
              boxShadow: 'var(--highlight-top), var(--shadow-lg)',
              padding: '6px',
            }}
          >
            {tenants.map(t => (
              <button
                key={t.id}
                role="menuitem"
                onClick={() => select(t.id)}
                className="row-hover"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'transparent',
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: t.color }} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.name}
                </span>
                {t.id === activeTenantId && <Check size={14} style={{ color: 'var(--gold-2)', flexShrink: 0 }} />}
              </button>
            ))}

            <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '6px 4px' }} />

            <button
              role="menuitem"
              onClick={goToHub}
              className="row-hover"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                padding: '8px 10px',
                borderRadius: '6px',
                border: 'none',
                background: 'transparent',
                fontSize: '13px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <ShieldCheck size={14} style={{ color: 'var(--gold-2)', flexShrink: 0 }} />
              Centro de control
            </button>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
