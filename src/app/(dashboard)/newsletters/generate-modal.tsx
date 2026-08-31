'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Sparkles, Loader2, Globe } from 'lucide-react'
import { ModalShell } from '@/components/motion/modal-shell'
import { SUPPORTED_LANGUAGE_CODES, LANGUAGE_CONFIG } from '@/lib/config'
import { generateEditionWithAi } from './actions'

// Modal de "Generar con IA": mismo ModalShell y mismos estilos de campo que
// el resto de modales del módulo, con dos cosas propias: la allowlist a la
// vista (el argumento de venta entero de esta feature: el cliente ve de dónde
// va a salir su contenido ANTES de pedirlo) y un aviso de que tarda, porque
// generateEditionWithAi hace dos llamadas al modelo con búsqueda web por
// medio — decenas de segundos, no el instante de guardar un formulario.
//
// No pide serie ni categoría: con una sola newsletter por tenant no hay serie
// que elegir, y la categoría la decide después quien edite (nace en
// 'informativo' y se cambia en el editor, ver actions.ts).
//
// La allowlist ya NO es un requisito que el usuario tenga que cumplir antes:
// se genera sola en la primera generación, a partir de las zonas de "Tu
// negocio" (ver lib/newsletters/ai/source-catalog.ts). Por eso aquí se ENSEÑA,
// que sigue siendo el argumento, pero no se BLOQUEA: pedirle al cliente que
// escriba hostnames era el paso que sobraba.

interface Props {
  open:          boolean
  onClose:       () => void
  /** Las fuentes ya preparadas de este tenant. Vacío = todavía no ha generado
   *  nunca, y se prepararán en esta misma generación. */
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

export function GenerateModal({ open, onClose, sourceDomains }: Props) {
  const router = useRouter()
  const [topic, setTopic]         = useState('')
  const [language, setLanguage]   = useState('es')
  const [stage, setStage]         = useState<Stage>('idle')
  const [error, setError]         = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const busy = stage !== 'idle'

  useEffect(() => () => { if (draftTimer.current) clearTimeout(draftTimer.current) }, [])

  // Se limpia al CERRAR, no al abrir: así la próxima apertura ya arranca en
  // limpio, sin poner un setState dentro de un efecto disparado por el cambio
  // de `open`.
  function handleClose() {
    if (busy) return // ya se pagó la investigación/redacción — no se cierra a medias.
    setTopic('')
    setLanguage('es')
    setError(null)
    onClose()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    setStage('researching')
    draftTimer.current = setTimeout(() => setStage('drafting'), DRAFTING_AFTER_MS)

    startTransition(async () => {
      const res = await generateEditionWithAi({
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

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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

          {/* Las fuentes a la vista — el punto entero de esta pantalla: el
              cliente tiene que ver de dónde va a salir su contenido antes de
              pedirlo. Ya no es una tarea suya: si aún no las tiene, se
              preparan en esta misma generación a partir de sus zonas. */}
          <div style={{
            padding: '12px 14px', borderRadius: '8px',
            border: '1px solid var(--border-subtle)', background: 'var(--bg-overlay)',
          }}>
            {sourceDomains.length > 0 ? (
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
                <Globe size={14} color="var(--accent-gold)" style={{ flexShrink: 0, marginTop: '1px' }} />
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                  En esta primera generación se preparan las fuentes de tu mercado
                  a partir de las zonas de <strong style={{ color: 'var(--text-primary)' }}>Tu negocio</strong>:
                  estadística oficial, portales inmobiliarios, hipotecas y prensa
                  de tu zona. A partir de ahí la IA sólo podrá citar esas fuentes,
                  y las verás aquí en las siguientes ediciones.
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
              disabled={busy || isPending}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
                background: 'var(--accent-gold)', color: 'var(--bg-base)', border: 'none',
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy
                ? <><Loader2 size={13} className="animate-spin" /> Generando…</>
                : <><Sparkles size={13} /> Generar con IA</>}
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  )
}
