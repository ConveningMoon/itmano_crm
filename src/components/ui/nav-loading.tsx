'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

// Feedback inmediato al navegar a una vista de detalle (card de fuente,
// propiedad o lead). El push se envuelve en una transición: mientras la ruta
// destino carga (y su loading.tsx aparece), mostramos un overlay con spinner
// para que el clic se sienta instantáneo aunque el servidor tarde.
export function useCardNavigation() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const navigate = (href: string) => startTransition(() => router.push(href))
  return { navigate, pending }
}

export function NavLoadingOverlay({ show, label = 'Abriendo…' }: { show: boolean; label?: string }) {
  if (!show) return null
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px',
        background: 'color-mix(in srgb, var(--bg-base) 62%, transparent)',
        backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
      }}
      role="status"
      aria-live="polite"
    >
      <style>{`@keyframes itm-nav-spin { to { transform: rotate(360deg) } }`}</style>
      <div
        style={{
          width: '34px', height: '34px', borderRadius: '50%',
          border: '3px solid var(--border-subtle)', borderTopColor: 'var(--accent-gold)',
          animation: 'itm-nav-spin 0.7s linear infinite',
        }}
      />
      <span style={{ fontSize: '12px', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>{label}</span>
    </div>
  )
}
