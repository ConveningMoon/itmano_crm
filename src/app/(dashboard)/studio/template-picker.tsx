'use client'

import { templateFit } from '@/lib/studio/templates/registry'
import type { StudioTemplate } from '@/lib/studio/templates/types'

// Nadie elige un diseño de una lista de nombres. Tres tarjetas con su miniatura,
// y el aviso de encaje cruzando lo que el diseño necesita con lo que el agente
// tiene: se dice ANTES de generar, no después de ver el resultado.
//
// El aviso NO deshabilita la tarjeta. Si quiere el mosaico con dos fotos es su
// decisión; lo que no puede es enterarse al final.

export function TemplatePicker({ templates, value, onChange, photoCount, hasAgentPhoto }: {
  templates:     StudioTemplate[]
  value:         string
  onChange:      (key: string) => void
  photoCount:    number
  hasAgentPhoto: boolean
}) {
  if (templates.length === 0) return null

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
              {/* eslint-disable-next-line @next/next/no-img-element -- reason: asset estático del repo; next/image no aporta aquí */}
              <img
                src={`/studio/templates/${t.key}.webp`}
                alt={t.label}
                style={{ width: '100%', display: 'block', borderRadius: '6px', aspectRatio: '4 / 5', objectFit: 'cover' }}
              />
              <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', marginTop: '8px' }}>
                {t.label}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                {t.hint}
              </div>
              {fit.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: '11px', color: 'var(--status-warm, #e07b3a)', marginTop: '6px', lineHeight: 1.3 }}>
                  {w}
                </div>
              ))}
            </button>
          )
        })}
      </div>
    </div>
  )
}
