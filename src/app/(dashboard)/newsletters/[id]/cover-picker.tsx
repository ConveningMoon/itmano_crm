'use client'

import { useRef, useState } from 'react'
import { Upload, Image as ImageIcon, Sparkles, Loader2 } from 'lucide-react'
import type { StudioImage } from '@/lib/studio/types'
import type { NewsletterCoverSource } from '@/lib/data/newsletters'
import { generateCoverForEdition } from '../actions'

// Portada de la edición. Tres vías: subir archivo, biblioteca del Estudio, o
// generar con IA (src/lib/newsletters/ai/cover.ts). Las tres terminan igual
// (onChange con la URL nueva); la que difiere es "Generar con IA", que primero
// necesita el titular y la bajada YA GUARDADOS — por eso pide al padre que
// guarde el formulario antes de llamar a la server action, con el mismo
// `onBeforeGenerate` que usa "Publicar" para guardar antes de publicar.

interface Props {
  /** Sólo existe una vez creada la edición — ver NewEditionForm, que arma la
   *  portada ANTES de tener id y por eso omite estas dos props: "Generar con
   *  IA" ahí no tendría qué edición actualizar. */
  editionId?:    string
  coverImageUrl: string
  coverSource:   NewsletterCoverSource
  studioImages:  StudioImage[]
  canEdit:       boolean
  onChange: (next: { coverImageUrl: string; coverSource: NewsletterCoverSource }) => void
  /** Guarda el formulario tal como está antes de generar. La escena tiene que
   *  reflejar el titular real, no uno que el usuario todavía no guardó. */
  onBeforeGenerate?: () => Promise<{ ok: true } | { ok: false; error: string }>
}

type Tab = 'upload' | 'studio'

const SOURCE_LABEL: Record<NewsletterCoverSource, string> = {
  upload: 'Subida manualmente',
  studio: 'Del Estudio',
  ai:     'Generada con IA',
}

// Mensaje genérico para cuando `res.json()` truena: mismo patrón que
// uploadCoverFile/uploadBlockImage de este mismo archivo.
const GENERATE_FALLBACK_ERROR = 'No se pudo generar la portada. Verifica tu conexión e intenta de nuevo.'

// Route Handler, no Server Action — ver src/app/api/newsletters/media/route.ts:
// una Server Action POSTea a la ruta de la página, que src/proxy.ts intercepta
// y corrompe el File binario. /api/* queda fuera de ese guard.
async function uploadCoverFile(file: File): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const fd = new FormData()
  fd.set('file', file)
  const res = await fetch('/api/newsletters/media', { method: 'POST', body: fd })
  try {
    return await res.json()
  } catch {
    return { ok: false, error: 'No se pudo subir el archivo. Verifica tu conexión e intenta de nuevo.' }
  }
}

export function CoverPicker({
  editionId, coverImageUrl, coverSource, studioImages, canEdit, onChange, onBeforeGenerate,
}: Props) {
  const [tab, setTab]           = useState<Tab>('upload')
  const [uploading, setUploading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const fileInputRef            = useRef<HTMLInputElement>(null)

  async function handleFile(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setError(null)
    setUploading(true)
    const res = await uploadCoverFile(file)
    setUploading(false)
    if (!res.ok) { setError(res.error); return }
    onChange({ coverImageUrl: res.url, coverSource: 'upload' })
  }

  async function handleGenerate() {
    if (!editionId || !onBeforeGenerate) return
    setError(null)
    setGenerating(true)
    const saved = await onBeforeGenerate()
    if (!saved.ok) { setGenerating(false); setError(saved.error); return }
    try {
      const res = await generateCoverForEdition(editionId)
      setGenerating(false)
      if (!res.ok) { setError(res.error); return }
      onChange({ coverImageUrl: res.data.url, coverSource: 'ai' })
    } catch {
      setGenerating(false)
      setError(GENERATE_FALLBACK_ERROR)
    }
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
              {editionId && onBeforeGenerate && (
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating || uploading}
                  title="Genera una portada con IA a partir del titular y la bajada guardados"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    padding: '6px 12px', fontSize: '12px', fontWeight: 500, borderRadius: '8px',
                    background: 'transparent', color: 'var(--text-muted)',
                    border: '1px solid var(--border-subtle)',
                    cursor: (generating || uploading) ? 'default' : 'pointer',
                    opacity: (generating || uploading) ? 0.6 : 1,
                  }}
                >
                  {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {generating ? 'Generando…' : 'Generar con IA'}
                </button>
              )}
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
