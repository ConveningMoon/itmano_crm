'use client'

import { useRef, useState, useTransition } from 'react'
import { ImageUp, RotateCcw, Loader2 } from 'lucide-react'
import { MOCKUP_SLOTS, type MockupMap } from '@/lib/studio/mockups'
import { saveMockupAction, deleteMockupAction } from './actions'

// Los huecos de imagen que el diseño que se está escribiendo usa de verdad.
//
// La lista no se declara en ningún sitio: la calcula el editor leyendo su
// propio HTML, así que un mosaico enseña seis y un editorial tres, y la lista
// cambia sola mientras se escribe. Aquí sólo se pintan.
//
// Cada hueco enseña la imagen que se está usando y de dónde sale. Nunca hay un
// hueco vacío: sin nada subido se usa la del repo, porque una vista previa sin
// imagen haría parecer roto un diseño que no lo está.

export function MockupPanel({ claves, imagenes, propias, onCambio }: {
  /** Las claves de imagen que el HTML usa, en orden de catálogo. */
  claves:   string[]
  /** El juego ya resuelto: lo subido, o la de reserva. */
  imagenes: MockupMap
  /** Cuáles de ellas son propias (subidas) y no de reserva. */
  propias:  Set<string>
  onCambio: (key: string, url: string, esPropia: boolean) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})

  const slots = MOCKUP_SLOTS.filter(s => claves.includes(s.key))

  if (slots.length === 0) {
    return (
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5, marginTop: '14px' }}>
        Este diseño no usa ninguna imagen. En cuanto escribas un hueco como
        {' '}<code>{'{{hero}}'}</code>{' '}aparecerá aquí para poder cambiarla.
      </p>
    )
  }

  function subir(key: string, archivo: File) {
    setError(null)
    setTrabajando(key)
    const datos = new FormData()
    datos.set('key', key)
    datos.set('imagen', archivo)
    startTransition(async () => {
      const r = await saveMockupAction(datos)
      setTrabajando(null)
      if (r.ok) onCambio(r.data.key, r.data.url, true)
      else setError(r.error)
    })
  }

  function quitar(key: string) {
    setError(null)
    setTrabajando(key)
    startTransition(async () => {
      const r = await deleteMockupAction(key)
      setTrabajando(null)
      if (r.ok) onCambio(r.data.key, r.data.url, false)
      else setError(r.error)
    })
  }

  return (
    <div style={{ marginTop: '16px' }}>
      <style>{`.mk-card:hover { border-color: var(--accent-gold) !important; }`}</style>

      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '8px',
      }}>
        <span style={{
          fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase',
          letterSpacing: '0.06em', fontWeight: 500,
        }}>
          Imágenes de ejemplo
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {slots.length} {slots.length === 1 ? 'hueco' : 'huecos'} en este diseño
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
        {slots.map(slot => {
          const esPropia = propias.has(slot.key)
          const ocupado = trabajando === slot.key
          return (
            <div key={slot.key} className="mk-card" style={{
              border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '6px',
              background: 'var(--bg-surface)', transition: 'border-color var(--dur-fast)',
            }}>
              <span style={{ display: 'block', position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- reason: la fuente puede ser el bucket o /public; next/image no aporta en una tarjeta de 90px */}
                <img
                  src={imagenes[slot.key]}
                  alt={slot.label}
                  style={{
                    width: '100%', display: 'block', borderRadius: '6px',
                    aspectRatio: '1 / 1', objectFit: 'cover',
                    background: 'var(--bg-elevated)',
                    opacity: ocupado ? 0.4 : 1,
                  }}
                />
                {ocupado && (
                  <Loader2
                    size={16}
                    className="animate-spin"
                    style={{ position: 'absolute', top: '50%', left: '50%', marginTop: '-8px', marginLeft: '-8px', color: 'var(--text-muted)' }}
                  />
                )}
              </span>

              <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-primary)', marginTop: '6px' }}>
                {slot.label}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.3 }}>
                {esPropia ? 'Tuya' : slot.hint}
              </div>

              <div style={{ display: 'flex', gap: '6px', marginTop: '6px', alignItems: 'center' }}>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer',
                  fontSize: '10px', color: 'var(--accent-gold)',
                }}>
                  <ImageUp size={12} />
                  Cambiar
                  <input
                    ref={el => { inputs.current[slot.key] = el }}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const archivo = e.target.files?.[0]
                      // Se limpia el input para que elegir el MISMO archivo dos
                      // veces seguidas vuelva a disparar onChange.
                      e.target.value = ''
                      if (archivo) subir(slot.key, archivo)
                    }}
                  />
                </label>

                {esPropia && (
                  <button
                    type="button"
                    onClick={() => quitar(slot.key)}
                    aria-label={`Volver a la imagen de ejemplo de ${slot.label}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer',
                      background: 'none', border: 'none', padding: 0,
                      fontSize: '10px', color: 'var(--text-muted)',
                    }}
                  >
                    <RotateCcw size={12} />
                    Quitar
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {error && (
        <p style={{ fontSize: '11px', color: 'var(--status-lost, #c96b6b)', marginTop: '8px' }}>{error}</p>
      )}
      <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.4 }}>
        Sirven sólo para diseñar. Una pieza real usa las fotos de su propiedad y el
        logo del cliente.
      </p>
    </div>
  )
}
