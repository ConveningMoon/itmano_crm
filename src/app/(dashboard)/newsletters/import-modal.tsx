'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Upload, Copy, Check, Loader2 } from 'lucide-react'
import { ModalShell } from '@/components/motion/modal-shell'
import { buildImportPrompt } from '@/lib/newsletters/import-prompt'
import type { NewsletterSeries } from '@/lib/data/newsletters'
import { createEditionFromJson } from './actions'

// "Importar de tu IA" — la alternativa gratuita a generar con la nuestra.
//
// Dos pestañas y en este orden a propósito. La primera vez nadie tiene un JSON
// que pegar: lo que necesita es el prompt. Pero a partir de la segunda, lo que
// quiere es pegar y listo. Se abre en "Pegar JSON" y el prompt queda a un clic,
// que es el reparto correcto cuando una de las dos se usa una sola vez.

interface Props {
  open:    boolean
  onClose: () => void
  series:  NewsletterSeries[]
}

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

type Tab = 'json' | 'prompt'

export function ImportModal({ open, onClose, series }: Props) {
  const router = useRouter()
  const [tab, setTab]             = useState<Tab>('json')
  const [channelId, setChannelId] = useState(series[0]?.id ?? '')
  const [json, setJson]           = useState('')
  const [error, setError]         = useState<string | null>(null)
  const [copied, setCopied]       = useState(false)
  const [pending, start]          = useTransition()

  const prompt = buildImportPrompt()

  function handleClose() {
    setError(null)
    setJson('')
    setTab('json')
    onClose()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await createEditionFromJson({ channelId, json })
      // Se va al editor, igual que al generar con IA: la edición nace en
      // borrador y sin portada, así que lo siguiente SIEMPRE es abrirla.
      if (res.ok) router.push(`/newsletters/${res.data.id}`)
      else setError(res.error)
    })
  }

  const tabStyle = (activa: boolean): React.CSSProperties => ({
    padding: '7px 14px', fontSize: '12.5px', fontWeight: 500,
    background: activa ? 'var(--bg-elevated)' : 'transparent',
    color: activa ? 'var(--text-primary)' : 'var(--text-muted)',
    border: '1px solid', borderColor: activa ? 'var(--border-subtle)' : 'transparent',
    borderRadius: '8px', cursor: 'pointer',
  })

  return (
    <ModalShell open={open} onClose={handleClose} maxWidth={640}>
      <style>{`
        .nl-import-input:focus { border-color: var(--border-accent) !important; outline: none; }
      `}</style>

      <div style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Importar de tu IA
          </div>
          <button
            onClick={handleClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '4px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 16px' }}>
          Si ya redactas con tu propia IA, escribe la edición ahí y trae el resultado.
          Añade el prompt de la segunda pestaña a lo que le pidas y te devolverá el
          contenido con la estructura que este sistema espera.
        </p>

        <div style={{ display: 'flex', gap: '6px', marginBottom: '18px' }}>
          <button type="button" style={tabStyle(tab === 'json')} onClick={() => setTab('json')}>
            Pegar JSON
          </button>
          <button type="button" style={tabStyle(tab === 'prompt')} onClick={() => setTab('prompt')}>
            Prompt para tu IA
          </button>
        </div>

        {tab === 'prompt' ? (
          <>
            <pre style={{
              margin: 0, padding: '14px', maxHeight: '44vh', overflow: 'auto',
              background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
              borderRadius: '8px', fontSize: '11.5px', lineHeight: 1.6,
              color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {prompt}
            </pre>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(prompt).then(
                    () => { setCopied(true); setTimeout(() => setCopied(false), 2000) },
                    () => setError('Tu navegador no dejó copiar. Selecciona el texto y cópialo a mano.'),
                  )
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '8px 18px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
                  background: 'var(--accent-gold)', color: 'var(--bg-base)',
                  border: 'none', cursor: 'pointer',
                }}
              >
                {copied ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar prompt</>}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={LABEL_STYLE}>Serie *</label>
              <select
                value={channelId}
                onChange={e => setChannelId(e.target.value)}
                required
                disabled={pending}
                className="nl-import-input"
                style={{ ...INPUT_STYLE, appearance: 'none', cursor: 'pointer' }}
              >
                {series.map(s => (
                  <option key={s.id} value={s.id} style={{ background: '#16181C' }}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={LABEL_STYLE}>JSON de la edición *</label>
              <textarea
                value={json}
                onChange={e => setJson(e.target.value)}
                placeholder={'{\n  "title": "…",\n  "blocks": [ … ]\n}'}
                rows={12}
                required
                disabled={pending}
                className="nl-import-input"
                style={{
                  ...INPUT_STYLE, resize: 'vertical', minHeight: '200px',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '11.5px',
                }}
              />
            </div>

            {error && (
              <p style={{
                fontSize: '12px', color: 'var(--accent-coral)', margin: 0,
                padding: '10px 12px', borderRadius: '8px', background: 'rgba(201,123,107,0.08)', lineHeight: 1.6,
              }}>
                {error}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '2px' }}>
              <button
                type="button"
                onClick={handleClose}
                disabled={pending}
                style={{
                  padding: '8px 16px', fontSize: '13px', borderRadius: '8px',
                  background: 'transparent', border: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pending || !json.trim() || !channelId}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
                  background: 'var(--accent-gold)', color: 'var(--bg-base)', border: 'none',
                  cursor: (pending || !json.trim() || !channelId) ? 'not-allowed' : 'pointer',
                  opacity: (pending || !json.trim() || !channelId) ? 0.6 : 1,
                }}
              >
                {pending
                  ? <><Loader2 size={14} className="animate-spin" /> Importando…</>
                  : <><Upload size={14} /> Importar edición</>}
              </button>
            </div>
          </form>
        )}
      </div>
    </ModalShell>
  )
}
