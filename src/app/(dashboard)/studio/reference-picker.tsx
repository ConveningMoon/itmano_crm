'use client'

import { Upload, X } from 'lucide-react'
import { MAX_REFERENCES } from '@/lib/studio/recipes'
import { FIELD_LABEL } from './field-inputs'

// Las imágenes de referencia, con la misma mecánica que la galería de una
// propiedad: botón visible, miniatura de lo elegido y una X para quitarla.
//
// El `<input type="file">` crudo que había antes no decía qué archivo se había
// tomado ni permitía quitarlo, así que la única forma de corregirse era volver a
// abrir el diálogo y esperar que el navegador mostrara el nombre.

/** El archivo con su URL de previsualización, creada una sola vez al elegirlo. */
export interface ReferenceItem { file: File; url: string }

/** Libera las URLs de una lista que deja de mostrarse (al enviar el formulario).
 *  Se hace a mano y no en un efecto porque una limpieza por cambio de lista
 *  revocaría las de los archivos que siguen en pantalla. */
export function revokeReferences(items: ReferenceItem[]) {
  items.forEach(i => URL.revokeObjectURL(i.url))
}

export function ReferencePicker({ files, onChange }: {
  files:    ReferenceItem[]
  onChange: (files: ReferenceItem[]) => void
}) {
  const full = files.length >= MAX_REFERENCES

  function add(list: FileList | null) {
    if (!list) return
    const room = MAX_REFERENCES - files.length
    const picked = Array.from(list).slice(0, room)
      .map(file => ({ file, url: URL.createObjectURL(file) }))
    onChange([...files, ...picked])
  }

  function remove(index: number) {
    URL.revokeObjectURL(files[index].url)
    onChange(files.filter((_, j) => j !== index))
  }

  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={FIELD_LABEL}>Imágenes de referencia</label>

      {files.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
          {files.map((item, i) => (
            <div key={item.url} style={{ position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- reason: blob local del navegador, no hay host que optimizar */}
              <img
                src={item.url}
                alt={item.file.name}
                title={item.file.name}
                style={{
                  width: '82px', height: '82px', objectFit: 'cover', borderRadius: '8px',
                  border: '1px solid var(--border-subtle)', display: 'block', background: 'var(--bg-base)',
                }}
              />
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Quitar ${item.file.name}`}
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
          ))}
        </div>
      )}

      <label style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        padding: '7px 14px', fontSize: '12px', fontWeight: 500,
        background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
        border: '1px solid var(--border-subtle)', borderRadius: '8px',
        cursor: full ? 'default' : 'pointer', opacity: full ? 0.5 : 1,
      }}>
        <Upload size={13} />
        {files.length === 0 ? 'Elegir imágenes' : 'Agregar otra'}
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={full}
          onChange={e => { add(e.target.files); e.target.value = '' }}
          style={{ display: 'none' }}
        />
      </label>

      <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.4 }}>
        Opcional · hasta {MAX_REFERENCES}. Di en el prompt qué hacer con cada una.
      </span>
    </div>
  )
}
