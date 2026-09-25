'use client'

import { useLinkStatus } from 'next/link'

// Indicadores de carga compartidos. El spinner es la clase .loading-spinner de
// globals.css; aquí sólo vive la lógica que decide cuándo se ve.

/**
 * Spinner para poner DENTRO de un <Link>: se enciende mientras la navegación de
 * ese link está pendiente (useLinkStatus). Siempre montado y con opacidad 0, así
 * que aparecer no desplaza el texto del link.
 */
export function LinkPendingSpinner() {
  const { pending } = useLinkStatus()
  return <span aria-hidden className="loading-spinner nav-pending-hint" data-pending={pending} />
}

/**
 * Píldora flotante "Actualizando…" para una zona que vuelve a consultar la base
 * sin cambiar de ruta (filtros, orden, paginación). El contenedor necesita
 * `position: relative`.
 */
export function RefreshingPill({ show, label = 'Actualizando…' }: { show: boolean; label?: string }) {
  if (!show) return null
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: 5,
        display: 'inline-flex', alignItems: 'center', gap: '8px',
        padding: '6px 12px', borderRadius: '999px',
        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-md)',
        fontSize: '12px', color: 'var(--text-secondary)',
      }}
    >
      <span aria-hidden className="loading-spinner" />
      {label}
    </div>
  )
}
