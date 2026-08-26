'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { X, Sparkles, Loader2, AlertTriangle } from 'lucide-react'
import { ModalShell } from '@/components/motion/modal-shell'
import type { NewsletterSeries } from '@/lib/data/newsletters'
import { canGenerateWithAi } from '@/lib/newsletters/source-domains'
import { SUPPORTED_LANGUAGE_CODES, LANGUAGE_CONFIG } from '@/lib/config'
import { generateEditionWithAi } from './actions'

// Modal de "Generar con IA" — el hermano del de "Nueva serie" (mismo
// ModalShell, mismos estilos de campo), pero con dos cosas que ese no tiene:
// la allowlist a la vista (el argumento de venta entero de esta feature: el
// cliente ve de dónde va a salir su contenido ANTES de pedirlo) y un aviso de
// que tarda, porque generateEditionWithAi hace dos llamadas al modelo con
// búsqueda web por medio — decenas de segundos, no el instante de crear una
// serie.

interface Props {
  open:          boolean
  onClose:       () => void
  series:        NewsletterSeries[]
  sourceDomains: string[]
}

type Stage = 'idle' | 'researching' | 'drafting'

const LABEL_STYLE: React.CSSProperties = {
  fontSize: '12px', color: 'var(--text-muted)',
  display: 'block', marginBottom: '6px',
  textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500,
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', background: 'var(--bg-overlay)',
  border: '1px solid var(--border-subtle)', borderRadius: '8px',
  padding: '8px 12px', color: 'var(--text-primary)',
  fontSize: '13px', outline: 'none', boxSizing: 'border-box',
}

const HINT_STYLE: React.CSSProperties = {
  fontSize: '11px', color: 'var(--text-muted)', margin: '5px 0 0', lineHeight: 1.5,
}

// No hay señal real del servidor sobre en qué paso va la generación —
// generateEditionWithAi es UNA llamada opaca que resuelve las dos pasadas por
// el modelo de una vez. Igual que el generador de carruseles fija su texto de
// estado ANTES de llamar a la server action (carousels-client.tsx → generate()),
// aquí se avisa por tiempo transcurrido: la investigación con búsqueda web es
// la parte más lenta, así que a los 14s se asume que ya terminó y se anuncia la
// redacción. Es una estimación, no una lectura del servidor — sin eso, no hay
// forma barata de dar dos mensajes distintos con una sola llamada.
const DRAFTING_AFTER_MS = 14_000

function initialChannelId(series: NewsletterSeries[]): string {
  return series[0]?.id ?? ''
}

export function GenerateModal({ open, onClose, series, sourceDomains }: Props) {
  const router = useRouter()
  const [channelId, setChannelId] = useState(() => initialChannelId(series))
  const [topic, setTopic]         = useState('')
  const [language, setLanguage]   = useState('es')
  const [stage, setStage]         = useState<Stage>('idle')
  const [error, setError]         = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const canGenerate = canGenerateWithAi(sourceDomains)
  const busy = stage !== 'idle'

  useEffect(() => () => { if (draftTimer.current) clearTimeout(draftTimer.current) }, [])

  // Se limpia al CERRAR, no al abrir — mismo criterio que new-series-modal:
  // así la próxima apertura ya arranca en limpio, sin poner un setState dentro
  // de un efecto disparado por el cambio de `open`.
  function handleClose() {
    if (busy) return // ya se pagó la investigación/redacción — no se cierra a medias.
    setChannelId(initialChannelId(series))
    setTopic('')
    setLanguage('es')
    setError(null)
    onClose()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!channelId) { setError('Elige una serie.'); return }
    if (!canGenerate) return

    setStage('researching')
    draftTimer.current = setTimeout(() => setStage('drafting'), DRAFTING_AFTER_MS)

    startTransition(async () => {
      const res = await generateEditionWithAi({
        channelId,
        topic: topic.trim() || null,
        language,
      })
      if (draftTimer.current) clearTimeout(draftTimer.current)
      if (!res.ok) { setStage('idle'); setError(res.error); return }
      // Se queda en estado ocupado a propósito: la navegación reemplaza este
      // modal en un instante y no hay nada que ganar volviendo a habilitar el
      // formulario justo antes de irse.
      router.push(`/newsletters/${res.data.id}`)
    })
  }

  return (
    <ModalShell open={open} onClose={handleClose} maxWidth={480}>
      <style>{`
        .nl-generate-input:focus { border-color: var(--border-accent) !important; outline: none; }
      `}</style>

      <div style={{ padding: '24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
            <Sparkles size={16} color="var(--accent-gold)" />
            Generar con IA
          </div>
          <button
            onClick={handleClose}
            disabled={busy}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', padding: '4px',
              cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {series.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
            Todavía no hay ninguna serie. Crea una primero — la edición generada
            necesita una serie donde colgarse.
          </p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Serie */}
            <div>
              <label style={LABEL_STYLE}>Serie *</label>
              <select
                value={channelId}
                onChange={e => setChannelId(e.target.value)}
                disabled={busy}
                className="nl-generate-input"
                style={{ ...INPUT_STYLE, cursor: busy ? 'not-allowed' : 'pointer' }}
              >
                {series.map(s => (
                  <option key={s.id} value={s.id} style={{ background: '#16181C' }}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Tema */}
            <div>
              <label style={LABEL_STYLE}>Tema</label>
              <input
                value={topic}
                onChange={e => setTopic(e.target.value)}
                disabled={busy}
                maxLength={200}
                placeholder="Qué está pasando con las tasas hipotecarias en tu mercado"
                className="nl-generate-input"
                style={INPUT_STYLE}
              />
              <p style={HINT_STYLE}>Déjalo vacío y la IA propone un tema sobre tu mercado.</p>
            </div>

            {/* Idioma */}
            <div>
              <label style={LABEL_STYLE}>Idioma</label>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value)}
                disabled={busy}
                className="nl-generate-input"
                style={{ ...INPUT_STYLE, cursor: busy ? 'not-allowed' : 'pointer' }}
              >
                {SUPPORTED_LANGUAGE_CODES.map(code => (
                  <option key={code} value={code} style={{ background: '#16181C' }}>{LANGUAGE_CONFIG[code].label}</option>
                ))}
              </select>
            </div>

            {/* La allowlist a la vista — el punto entero de esta pantalla: el
                cliente tiene que ver de dónde va a salir su contenido antes de
                pedirlo. Mismo criterio de lista que la vista de sólo lectura de
                newsletter-sources-section.tsx. */}
            <div style={{
              padding: '12px 14px', borderRadius: '8px',
              border: '1px solid var(--border-subtle)', background: 'var(--bg-overlay)',
            }}>
              {canGenerate ? (
                <>
                  <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
                    La IA solo podrá citar estas fuentes:
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {sourceDomains.map(d => (
                      <span
                        key={d}
                        style={{
                          fontSize: '11.5px', color: 'var(--text-secondary)',
                          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                          borderRadius: '6px', padding: '3px 8px',
                        }}
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <AlertTriangle size={14} color="var(--accent-gold)" style={{ flexShrink: 0, marginTop: '1px' }} />
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                    Tu equipo todavía no tiene fuentes declaradas, así que la IA no
                    puede generar contenido: sin allowlist significaría buscar en
                    toda la web, y eso es justo lo que este diseño evita.{' '}
                    <Link href="/settings?tab=negocio" style={{ color: 'var(--accent-gold)' }}>
                      Declara fuentes en Ajustes → Tu negocio
                    </Link>.
                  </p>
                </div>
              )}
            </div>

            {/* Progreso — mismo enfoque del generador de carruseles: un texto de
                estado que cambia mientras la generación está en curso. */}
            {busy && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                <Loader2 size={14} className="animate-spin" color="var(--accent-gold)" />
                <span>{stage === 'researching' ? 'Investigando en tus fuentes…' : 'Redactando…'}</span>
              </div>
            )}

            {error && <p style={{ fontSize: '12px', color: 'var(--accent-coral)', margin: 0 }}>{error}</p>}

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={handleClose}
                disabled={busy}
                style={{
                  padding: '8px 16px', fontSize: '13px', borderRadius: '8px',
                  background: 'transparent', border: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)', cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.6 : 1,
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy || isPending || !canGenerate || !channelId}
                title={!canGenerate ? 'Declara fuentes primero en Ajustes → Tu negocio' : undefined}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
                  background: 'var(--accent-gold)', color: 'var(--bg-base)', border: 'none',
                  cursor: (busy || !canGenerate || !channelId) ? 'not-allowed' : 'pointer',
                  opacity: (busy || !canGenerate || !channelId) ? 0.6 : 1,
                }}
              >
                {busy
                  ? <><Loader2 size={13} className="animate-spin" /> Generando…</>
                  : <><Sparkles size={13} /> Generar con IA</>}
              </button>
            </div>
          </form>
        )}
      </div>
    </ModalShell>
  )
}
