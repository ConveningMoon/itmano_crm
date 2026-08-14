'use client'

import { useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { templateFit } from '@/lib/studio/templates/registry'
import { Lightbox } from './lightbox'
import type { StudioTemplate } from '@/lib/studio/templates/types'

// Nadie elige un diseño de una lista de nombres. Tres tarjetas con su miniatura,
// y el aviso de encaje cruzando lo que el diseño necesita con lo que el agente
// tiene: se dice ANTES de generar, no después de ver el resultado.
//
// El aviso NO deshabilita la tarjeta. Si quiere el mosaico con dos fotos es su
// decisión; lo que no puede es enterarse al final.

export function TemplatePicker({ templates, value, onChange, photoCount, hasAgentPhoto, showFit }: {
  templates:     StudioTemplate[]
  value:         string
  onChange:      (key: string) => void
  photoCount:    number
  hasAgentPhoto: boolean
  /** false hasta que hay propiedad elegida: "tienes 0 fotos" antes de eso no es
   *  un aviso, es ruido — todavía no has elegido nada. */
  showFit:       boolean
}) {
  const [zoom, setZoom] = useState<StudioTemplate | null>(null)

  if (templates.length === 0) {
    return (
      <div style={{
        padding: '14px', marginBottom: '18px', borderRadius: '8px',
        border: '1px dashed var(--border-subtle)', fontSize: '12px',
        color: 'var(--text-muted)', lineHeight: 1.5,
      }}>
        Todavía no hay diseños para esta receta. Por ahora solo están los de
        &quot;Nueva disponible&quot;.
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '18px' }}>
      <style>{`.tpl-card:hover { border-color: var(--accent-gold) !important; }`}</style>
      <label style={{
        display: 'block', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase',
        letterSpacing: '0.06em', marginBottom: '6px', fontWeight: 500,
      }}>
        Diseño
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
        {templates.map(t => {
          const fit = templateFit(t, { photoCount, hasAgentPhoto })
          const active = t.key === value
          return (
            <button
              key={t.key}
              type="button"
              className={active ? undefined : 'tpl-card'}
              onClick={() => onChange(t.key)}
              style={{
                padding: '8px', textAlign: 'left', cursor: 'pointer',
                background: 'var(--bg-surface)', borderRadius: '12px',
                border: `${active ? 2 : 1}px solid ${active ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
                transition: 'border-color var(--dur-fast)',
              }}
            >
              <span style={{ display: 'block', position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- reason: asset estático del repo; next/image no aporta aquí */}
                <img
                  src={`/studio/templates/${t.key}.webp`}
                  alt={t.label}
                  style={{ width: '100%', display: 'block', borderRadius: '6px', aspectRatio: '4 / 5', objectFit: 'cover' }}
                />
                {/* Ver en grande sin elegir: una tarjeta de 130px no permite
                    juzgar un diseño de 1080×1350. */}
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Ver ${t.label} en grande`}
                  onClick={e => { e.stopPropagation(); setZoom(t) }}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setZoom(t) } }}
                  style={{
                    position: 'absolute', top: '6px', right: '6px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '26px', height: '26px', borderRadius: '6px', cursor: 'zoom-in',
                    background: 'rgba(0,0,0,0.55)', color: '#FFFFFF',
                  }}
                >
                  <Maximize2 size={13} />
                </span>
              </span>
              <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', marginTop: '8px' }}>
                {t.label}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                {t.hint}
              </div>
              {showFit && fit.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: '11px', color: 'var(--status-warm, #e07b3a)', marginTop: '6px', lineHeight: 1.3 }}>
                  {w}
                </div>
              ))}
            </button>
          )
        })}
      </div>

      {zoom && (
        <Lightbox
          src={`/studio/templates/${zoom.key}.webp`}
          alt={`Diseño ${zoom.label}`}
          onClose={() => setZoom(null)}
        />
      )}
    </div>
  )
}
