'use client'

import { useEffect, useRef } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { EASE_OUT_PREMIUM } from './primitives'

interface ModalShellProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  maxWidth?: number
  /** Nombre accesible del diálogo ("Enviar correo"). */
  ariaLabel?: string
}

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

// Cáscara compartida para los modales hechos a mano del repo: overlay con fade,
// panel con scale + y, exit animado, Escape y click-fuera cierran. El contenido
// interno de cada modal no cambia — solo se reemplaza su boilerplate de overlay.
//
// Foco (accesibilidad): al abrir, el foco entra al panel; Tab y Shift+Tab
// circulan dentro del diálogo; al cerrar, vuelve al control que lo abrió.
// Antes el foco se quedaba detrás del overlay y con el teclado se seguía
// navegando la página tapada.
export function ModalShell({ open, onClose, children, maxWidth = 480, ariaLabel }: ModalShellProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  // onClose suele ser una función nueva en cada render del padre: si fuera
  // dependencia del efecto, cada tecla escrita en el modal reiniciaría el foco.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // El panel se monta en este mismo commit; el foco va al panel (no al primer
    // botón, que suele ser la X de cerrar) para que el lector anuncie el diálogo.
    const raf = requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }))

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCloseRef.current(); return }
      if (e.key !== 'Tab' || !panelRef.current) return
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(el => el.offsetParent !== null)
      if (items.length === 0) { e.preventDefault(); return }
      const first = items[0]
      const last  = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault(); first.focus()
      } else if (!panelRef.current.contains(active)) {
        e.preventDefault(); first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true })
    }
  }, [open])

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
            background: 'color-mix(in srgb, var(--bg-base) 55%, transparent)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <m.div
            ref={panelRef}
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8, transition: { duration: 0.15 } }}
            transition={{ duration: 0.25, ease: EASE_OUT_PREMIUM }}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            tabIndex={-1}
            style={{
              width: '100%',
              maxWidth: `${maxWidth}px`,
              maxHeight: '90vh',
              overflowY: 'auto',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              boxShadow: 'var(--highlight-top), var(--shadow-lg)',
              outline: 'none',
            }}
          >
            {children}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
