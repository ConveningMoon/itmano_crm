'use client'

import { useEffect } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { EASE_OUT_PREMIUM } from './primitives'

interface ModalShellProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  maxWidth?: number
}

// Cáscara compartida para los modales hechos a mano del repo: overlay con fade,
// panel con scale + y, exit animado, Escape y click-fuera cierran. El contenido
// interno de cada modal no cambia — solo se reemplaza su boilerplate de overlay.
export function ModalShell({ open, onClose, children, maxWidth = 480 }: ModalShellProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            background: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <m.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8, transition: { duration: 0.15 } }}
            transition={{ duration: 0.25, ease: EASE_OUT_PREMIUM }}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{
              width: '100%',
              maxWidth: `${maxWidth}px`,
              maxHeight: '90vh',
              overflowY: 'auto',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              boxShadow: 'var(--highlight-top), var(--shadow-lg)',
            }}
          >
            {children}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
