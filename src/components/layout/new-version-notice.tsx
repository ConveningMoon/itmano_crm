'use client'

import { useEffect, useRef, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { esNavegacionInterna, esVersionDistinta, marcarVersionNueva } from '@/lib/app-version'

// Cada cuánto se pregunta si hay deploy nuevo mientras la pestaña está a la
// vista, y el mínimo entre dos preguntas al volver a ella. Una petición cada
// 5 minutos por pestaña abierta es despreciable en invocaciones.
const INTERVALO_MS = 5 * 60_000
const MINIMO_AL_VOLVER_MS = 60_000

/**
 * Aviso de versión nueva del CRM (ver src/lib/app-version.ts).
 *
 * `version` es el deploy que renderizó esta pestaña: el layout lo lee en el
 * servidor y, con Skew Protection, las navegaciones en cliente siguen yendo a
 * ese mismo deploy, así que no cambia hasta una carga completa.
 *
 * Al detectar otro deploy hace dos cosas:
 * 1. Muestra el aviso con "Actualizar". El usuario elige el momento; si lo
 *    cierra, el aviso no vuelve en esta pestaña.
 * 2. Convierte el siguiente clic en un enlace interno en carga completa, para
 *    que la versión nueva entre sola aunque nadie pulse el aviso.
 */
export function NewVersionNotice({ version }: { version: string }) {
  const [disponible, setDisponible] = useState(false)
  const [cerrado, setCerrado] = useState(false)
  const [actualizando, setActualizando] = useState(false)
  const ultimaConsulta = useRef(0)

  // Sondeo: cada INTERVALO_MS con la pestaña visible y al volver a ella.
  useEffect(() => {
    if (disponible) return
    let cancelado = false

    async function consultar() {
      if (document.visibilityState !== 'visible') return
      ultimaConsulta.current = Date.now()
      try {
        // Sin cookies a propósito: así Skew Protection no puede fijar esta
        // petición al deploy de la pestaña y responde el deploy actual.
        const res = await fetch('/api/version', { cache: 'no-store', credentials: 'omit' })
        if (!res.ok) return
        const { version: actual } = (await res.json()) as { version?: unknown }
        if (!cancelado && esVersionDistinta(version, actual)) {
          marcarVersionNueva()
          setDisponible(true)
        }
      } catch {
        // Sin red o respuesta rota: se reintenta en el siguiente ciclo.
      }
    }

    function alVolver() {
      if (Date.now() - ultimaConsulta.current >= MINIMO_AL_VOLVER_MS) void consultar()
    }

    const intervalo = window.setInterval(consultar, INTERVALO_MS)
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      cancelado = true
      window.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [version, disponible])

  // Con versión nueva, los enlaces internos dejan de navegar en cliente. Va en
  // fase de captura sobre `document` para correr antes que el onClick de
  // next/link, que respeta el preventDefault y no navega.
  useEffect(() => {
    if (!disponible) return
    function alHacerClic(ev: MouseEvent) {
      const enlace = (ev.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!enlace) return
      const datos = { href: enlace.href, target: enlace.target, download: enlace.hasAttribute('download') }
      if (!esNavegacionInterna(ev, datos, window.location.href)) return
      ev.preventDefault()
      window.location.assign(enlace.href)
    }
    document.addEventListener('click', alHacerClic, true)
    return () => document.removeEventListener('click', alHacerClic, true)
  }, [disponible])

  if (!disponible || cerrado) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        // Centrado con márgenes automáticos y no con left:50% + translate: con
        // ese truco el ancho disponible es media pantalla y en móvil el texto
        // se partía en cuatro líneas.
        position: 'fixed', bottom: '16px', left: 0, right: 0, marginInline: 'auto', zIndex: 150,
        width: 'fit-content', maxWidth: 'calc(100vw - 32px)',
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '8px 8px 8px 14px', borderRadius: '999px',
        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <RefreshCw size={14} strokeWidth={1.8} aria-hidden style={{ color: 'var(--accent-gold)', flexShrink: 0 }} />
      <span style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.4 }}>
        Hay una versión nueva del CRM
      </span>
      <button
        type="button"
        disabled={actualizando}
        onClick={() => {
          setActualizando(true)
          window.location.reload()
        }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0,
          padding: '5px 12px', borderRadius: '999px', border: 'none',
          background: 'var(--accent-gold)', color: 'var(--bg-base)',
          fontSize: '12px', fontWeight: 600, cursor: actualizando ? 'default' : 'pointer',
          opacity: actualizando ? 0.7 : 1,
        }}
      >
        {actualizando && <span aria-hidden className="loading-spinner" />}
        {actualizando ? 'Actualizando…' : 'Actualizar'}
      </button>
      <button
        type="button"
        aria-label="Cerrar aviso"
        onClick={() => setCerrado(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          width: '24px', height: '24px', borderRadius: '50%', border: 'none',
          background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
        }}
      >
        <X size={14} strokeWidth={1.8} />
      </button>
    </div>
  )
}
