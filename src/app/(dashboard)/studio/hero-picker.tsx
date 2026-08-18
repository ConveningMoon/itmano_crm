'use client'

import { Upload, X } from 'lucide-react'
import { FIELD_LABEL } from './field-inputs'
import type { ReferenceItem } from './reference-picker'

// La imagen principal, subida a mano.
//
// Es la tercera forma de llenar ese hueco, junto a las fotos de la propiedad y
// la escena generada, y la más barata de las tres: un agente que YA tiene la
// foto no debería pagar por que un modelo se la invente, ni dar de alta una
// propiedad solo para publicar un evento.

export function HeroPicker({ file, onChange }: {
  file:     ReferenceItem | null
  onChange: (file: ReferenceItem | null) => void
}) {
  function pick(list: FileList | null) {
    const chosen = list?.[0]
    if (!chosen) return
    if (file) URL.revokeObjectURL(file.url)
    onChange({ file: chosen, url: URL.createObjectURL(chosen) })
  }

  function clear() {
    if (file) URL.revokeObjectURL(file.url)
    onChange(null)
  }

  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={FIELD_LABEL}>Imagen principal</label>

      {file ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <div style={{ position: 'relative' }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- reason: blob local del navegador */}
            <img
              src={file.url}
              alt={file.file.name}
              style={{
                width: '96px', height: '120px', objectFit: 'cover', borderRadius: '8px',
                border: '1px solid var(--border-subtle)', display: 'block', background: 'var(--bg-base)',
              }}
            />
            <button
              type="button"
              onClick={clear}
              aria-label="Quitar la imagen principal"
              style={{
                position: 'absolute', top: '-6px', right: '-6px',
                width: '18px', height: '18px', borderRadius: '50%', border: 'none', cursor: 'pointer',
                background: 'var(--accent-coral)', color: '#fff', padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={11} />
            </button>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            {file.file.name}
            <br />
            No consume generación con IA.
          </span>
        </div>
      ) : (
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '7px 14px', fontSize: '12px', fontWeight: 500,
          background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
          border: '1px solid var(--border-subtle)', borderRadius: '8px', cursor: 'pointer',
        }}>
          <Upload size={13} />
          Subir una imagen
          <input
            type="file"
            accept="image/*"
            onChange={e => { pick(e.target.files); e.target.value = '' }}
            style={{ display: 'none' }}
          />
        </label>
      )}
    </div>
  )
}
