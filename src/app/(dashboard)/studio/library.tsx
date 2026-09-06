'use client'

import { useState, useTransition } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { deleteStudioImage, recomposeImage, regenerateStudioImage } from './actions'
import { Lightbox } from './lightbox'
import type { StudioImage } from '@/lib/studio/types'

const RECIPE_LABELS: Record<string, string> = {
  open_house:  'Casa abierta',
  new_listing: 'Nueva disponible',
  sold:        'Vendida',
  event:       'Evento',
  open_prompt: 'Mi Imagen',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

const actionStyle: React.CSSProperties = {
  fontSize: '11px', color: 'var(--text-muted)', background: 'transparent',
  border: 'none', padding: 0, cursor: 'pointer',
}

export function Library({ images, emptyHint, onCreated, onUpdated, onDeleted }: {
  images:    StudioImage[]
  /** Qué hacer para llenarla. Cambia por pestaña: no se crean igual un post y
   *  una imagen libre. */
  emptyHint: string
  onCreated: (image: StudioImage) => void
  onUpdated: (image: StudioImage) => void
  onDeleted: (id: string) => void
}) {
  const [pending, startTransition] = useTransition()
  const [zoom, setZoom] = useState<StudioImage | null>(null)
  // Qué pieza se está borrando. Es por id y no un booleano global: borrar tarda
  // (van tres archivos del bucket y la fila), y sin señal la tarjeta se quedaba
  // igual el tiempo suficiente para que se volviera a hacer clic.
  const [deleting, setDeleting] = useState<string | null>(null)

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
          {emptyHint}
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
              onClick={() => setZoom(img)}
              style={{ width: '100%', display: 'block', aspectRatio: img.aspect.replace(':', '/'), objectFit: 'cover', cursor: 'zoom-in' }}
            />
          ) : (
            <div style={{ padding: '32px 12px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
              {img.status === 'failed' ? (img.error_message ?? 'Falló') : 'Generando…'}
            </div>
          )}

          <div style={{ padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-primary)', marginBottom: '2px' }}>
              {RECIPE_LABELS[img.recipe] ?? img.recipe}
              {/* Qué piezas costaron dinero. El costo es la única marca honesta
                  de que hubo IA: una compuesta con sharp vale exactamente 0. */}
              {img.cost_usd > 0 && (
                <span title="Generada con IA" style={{ display: 'flex', color: 'var(--accent-gold)' }}>
                  <Sparkles size={12} />
                </span>
              )}
            </div>
            {/* El estilo ya no se elige, así que dejó de ser información: lo que
                distingue a una pieza de otra es su formato y cuándo se hizo. */}
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              {img.aspect} · {formatDate(img.created_at)}
              {img.cost_usd > 0 && ` · $${img.cost_usd.toFixed(3)}`}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {img.rendered_url && (
                <button type="button" onClick={() => setZoom(img)} style={{ ...actionStyle, color: 'var(--accent-gold)' }}>
                  Ver
                </button>
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
              {/* Recomponer: vuelve a dibujar el texto sobre la misma base sin
                  gastar IA otra vez. Eso protege dos casos distintos: el fondo
                  generado por IA que sí costó dinero (`background_path`), y una
                  pieza con diseño (`form_json.template`) — ésa siempre es
                  gratis de recomponer, con o sin fondo propio, porque vuelve a
                  bajar las fotos de la propiedad si hace falta. Sin la segunda
                  mitad, el botón no aparecía nunca en las piezas hechas con
                  fotos del CRM, que son la mayoría. */}
              {Boolean(img.background_path || img.form_json.template) && (
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
                disabled={pending || deleting === img.id}
                onClick={() => {
                  setDeleting(img.id)
                  startTransition(async () => {
                    const r = await deleteStudioImage(img.id)
                    if (r.ok) onDeleted(img.id)
                    // Si falló, la tarjeta sigue ahí: hay que poder reintentar.
                    setDeleting(null)
                  })
                }}
                style={{ ...actionStyle, display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                {deleting === img.id
                  ? <><Loader2 size={11} className="animate-spin" /> Eliminando…</>
                  : 'Borrar'}
              </button>
            </div>
          </div>
        </div>
      ))}

      {zoom?.rendered_url && (
        <Lightbox
          src={zoom.rendered_url}
          alt={RECIPE_LABELS[zoom.recipe] ?? zoom.recipe}
          downloadName={`${zoom.recipe}-${zoom.id.slice(0, 8)}.png`}
          onClose={() => setZoom(null)}
        />
      )}
    </div>
  )
}
