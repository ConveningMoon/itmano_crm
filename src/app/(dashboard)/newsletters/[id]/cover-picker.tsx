'use client'

import { useRef, useState, useTransition } from 'react'
import { Upload, Image as ImageIcon, Sparkles, Loader2 } from 'lucide-react'
import type { StudioImage } from '@/lib/studio/types'
import type { NewsletterCoverSource } from '@/lib/data/newsletters'
import { uploadNewsletterMedia } from '../actions'

// Portada de la edición. Dos vías funcionales (subir archivo / biblioteca del
// Estudio) más un botón deshabilitado para "Generar con IA" — esa tercera vía
// llega en otro plan, no se implementa aquí.

interface Props {
  coverImageUrl: string
  coverSource:   NewsletterCoverSource
  studioImages:  StudioImage[]
  canEdit:       boolean
  onChange: (next: { coverImageUrl: string; coverSource: NewsletterCoverSource }) => void
}

type Tab = 'upload' | 'studio'

const SOURCE_LABEL: Record<NewsletterCoverSource, string> = {
  upload: 'Subida manualmente',
  studio: 'Del Estudio',
  ai:     'Generada con IA',
}

export function CoverPicker({ coverImageUrl, coverSource, studioImages, canEdit, onChange }: Props) {
  const [tab, setTab]           = useState<Tab>('upload')
  const [uploading, setUploading] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [, startTransition]     = useTransition()
  const fileInputRef            = useRef<HTMLInputElement>(null)

  function handleFile(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setError(null)
    setUploading(true)
    const fd = new FormData()
    fd.set('file', file)
    startTransition(async () => {
      const res = await uploadNewsletterMedia(fd)
      setUploading(false)
      if (!res.ok) { setError(res.error); return }
      onChange({ coverImageUrl: res.data.url, coverSource: 'upload' })
    })
  }

  return (
    <div>
      <style>{`
        .nl-cover-thumb:hover { border-color: var(--border-hover) !important; }
      `}</style>

      <label style={LABEL_STYLE}>Portada</label>

      <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
        {/* Preview */}
        <div style={{
          width: '120px', height: '90px', borderRadius: '10px', overflow: 'hidden',
          border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)',
          flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {coverImageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element -- reason: host variable (storage propio o del Estudio), preview interno del editor */
            <img src={coverImageUrl} alt="Portada" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <ImageIcon size={20} color="var(--text-muted)" />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {canEdit && (
            <div style={{ display: 'flex', gap: '4px', marginBottom: '10px', flexWrap: 'wrap' }}>
              {([
                { key: 'upload', label: 'Subir archivo' },
                { key: 'studio', label: 'Biblioteca del Estudio' },
              ] as const).map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  style={{
                    padding: '6px 12px', fontSize: '12px', fontWeight: 500, borderRadius: '8px', cursor: 'pointer',
                    background: tab === t.key ? 'rgba(201,169,110,0.12)' : 'transparent',
                    color: tab === t.key ? 'var(--accent-gold)' : 'var(--text-muted)',
                    border: `1px solid ${tab === t.key ? 'rgba(201,169,110,0.3)' : 'var(--border-subtle)'}`,
                  }}
                >
                  {t.label}
                </button>
              ))}
              <button
                type="button"
                disabled
                title="Disponible próximamente"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  padding: '6px 12px', fontSize: '12px', fontWeight: 500, borderRadius: '8px',
                  background: 'transparent', color: 'var(--text-muted)',
                  border: '1px solid var(--border-subtle)', cursor: 'not-allowed', opacity: 0.6,
                }}
              >
                <Sparkles size={12} />
                Generar con IA
              </button>
            </div>
          )}

          {canEdit && tab === 'upload' && (
            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '7px 14px', fontSize: '12px', fontWeight: 500,
                  background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)', borderRadius: '8px',
                  cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1,
                }}
              >
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {uploading ? 'Subiendo…' : 'Elegir imagen'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={e => { handleFile(e.target.files); e.target.value = '' }}
                style={{ display: 'none' }}
              />
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '6px 0 0' }}>
                PNG, JPG o WebP. Máximo 8 MB.
              </p>
            </div>
          )}

          {canEdit && tab === 'studio' && (
            studioImages.length === 0 ? (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                Todavía no hay imágenes listas en el Estudio.
              </p>
            ) : (
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                {studioImages.map(img => (
                  img.rendered_url && (
                    <button
                      key={img.id}
                      type="button"
                      className="nl-cover-thumb"
                      onClick={() => onChange({ coverImageUrl: img.rendered_url as string, coverSource: 'studio' })}
                      style={{
                        width: '72px', height: '72px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0,
                        border: coverImageUrl === img.rendered_url ? '2px solid var(--accent-gold)' : '1px solid var(--border-subtle)',
                        padding: 0, cursor: 'pointer', background: 'var(--bg-elevated)',
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- reason: bucket público del Estudio, host variable por entorno */}
                      <img src={img.rendered_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </button>
                  )
                ))}
              </div>
            )
          )}

          {error && <p style={{ fontSize: '12px', color: 'var(--accent-coral)', margin: '8px 0 0' }}>{error}</p>}

          {!canEdit && (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              {SOURCE_LABEL[coverSource]}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)',
  display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em',
}
