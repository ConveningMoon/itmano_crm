'use client'

import { useEffect } from 'react'
import { X, Download } from 'lucide-react'

// Visor a pantalla completa. Lo usan los tres sitios donde hace falta ver una
// imagen de verdad y no una miniatura: el selector de diseños, la
// previsualización y la biblioteca.
//
// Una pieza de 1080×1350 en una tarjeta de 130px no se puede juzgar, y descargar
// para mirar no es una forma razonable de decidir.

export function Lightbox({ src, alt, downloadName, onClose }: {
  src:           string
  alt:           string
  /** Con nombre se ofrece descarga; sin él, el visor es solo para mirar. */
  downloadName?: string
  onClose:       () => void
}) {
  // Escape cierra. Sin esto, en un overlay a pantalla completa el usuario se
  // siente atrapado y busca el botón con el ratón.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // Congelar el scroll del fondo mientras el visor está abierto.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.86)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '32px',
      }}
    >
      {/* El clic en la imagen no cierra: solo el fondo. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- reason: la fuente puede ser un data URI o el bucket público; next/image no aplica */}
      <img
        src={src}
        alt={alt}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
          borderRadius: '8px', boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
        }}
      />

      <div style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', gap: '8px' }}>
        {downloadName && (
          <a
            href={src}
            download={downloadName}
            onClick={e => e.stopPropagation()}
            aria-label="Descargar"
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 12px', borderRadius: '8px', fontSize: '12px',
              background: 'rgba(255,255,255,0.12)', color: '#FFFFFF', textDecoration: 'none',
            }}
          >
            <Download size={14} /> Descargar
          </a>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '34px', height: '34px', borderRadius: '8px', cursor: 'pointer',
            background: 'rgba(255,255,255,0.12)', border: 'none', color: '#FFFFFF',
          }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
