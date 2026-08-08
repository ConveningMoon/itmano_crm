'use client'

import { useTransition } from 'react'
import { deleteStudioImage, recomposeImage, regenerateStudioImage } from './actions'
import { styleLabel } from '@/lib/studio/styles'
import type { StudioImage } from '@/lib/studio/types'

const RECIPE_LABELS: Record<string, string> = {
  open_house:  'Casa abierta',
  new_listing: 'Nueva disponible',
  sold:        'Vendida',
  event:       'Evento',
  open_prompt: 'Prompt abierto',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

const actionStyle: React.CSSProperties = {
  fontSize: '11px', color: 'var(--text-muted)', background: 'transparent',
  border: 'none', padding: 0, cursor: 'pointer',
}

export function Library({ images, onCreated, onUpdated, onDeleted }: {
  images:    StudioImage[]
  onCreated: (image: StudioImage) => void
  onUpdated: (image: StudioImage) => void
  onDeleted: (id: string) => void
}) {
  const [pending, startTransition] = useTransition()

  if (images.length === 0) {
    return (
      <div style={{
        padding: '48px 24px', textAlign: 'center',
        border: '1px dashed var(--border-subtle)', borderRadius: '12px',
      }}>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>
          Todavía no hay imágenes
        </p>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
          Elige una receta a la izquierda y genera la primera.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
      {images.map(img => (
        <div key={img.id} style={{
          border: '1px solid var(--border-subtle)', borderRadius: '12px',
          overflow: 'hidden', background: 'var(--bg-surface)',
        }}>
          {img.rendered_url ? (
            /* eslint-disable-next-line @next/next/no-img-element -- reason: bucket público de Supabase, host variable por entorno; next/image exigiría registrarlo en images.remotePatterns */
            <img
              src={img.rendered_url}
              alt={RECIPE_LABELS[img.recipe] ?? img.recipe}
              style={{ width: '100%', display: 'block', aspectRatio: img.aspect.replace(':', '/'), objectFit: 'cover' }}
            />
          ) : (
            <div style={{ padding: '32px 12px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
              {img.status === 'failed' ? (img.error_message ?? 'Falló') : 'Generando…'}
            </div>
          )}

          <div style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginBottom: '2px' }}>
              {RECIPE_LABELS[img.recipe] ?? img.recipe}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              {styleLabel(img.style)} · {img.aspect} · {formatDate(img.created_at)}
              {img.cost_usd > 0 && ` · $${img.cost_usd.toFixed(3)}`}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {img.rendered_url && (
                <a href={img.rendered_url} download style={{ fontSize: '11px', color: 'var(--accent-gold)', textDecoration: 'none' }}>
                  Descargar
                </a>
              )}
              {/* Variante: crea una fila nueva, no pisa esta. */}
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(async () => {
                  const r = await regenerateStudioImage(img.id)
                  if (r.ok) onCreated(r.data)
                })}
                style={actionStyle}
              >
                Variante
              </button>
              {/* Recomponer: reusa el fondo ya pagado. El arreglo barato cuando
                  el precio o la fecha salieron mal. */}
              {img.background_path && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => startTransition(async () => {
                    const r = await recomposeImage(img.id, img.form_json)
                    if (r.ok) onUpdated(r.data)
                  })}
                  style={actionStyle}
                >
                  Recomponer
                </button>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(async () => {
                  const r = await deleteStudioImage(img.id)
                  if (r.ok) onDeleted(img.id)
                })}
                style={actionStyle}
              >
                Borrar
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
