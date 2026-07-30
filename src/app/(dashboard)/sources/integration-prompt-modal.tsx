'use client'

import { useState, useTransition } from 'react'
import { Check, Copy, RefreshCw, X } from 'lucide-react'

interface IntegrationPromptModalProps {
  title:              string
  prompt:             string
  onClose:            () => void
  onRegenerateSecret?: () => Promise<{ ok: true; prompt: string } | { ok: false; error: string }>
}

export function IntegrationPromptModal({ title, prompt, onClose, onRegenerateSecret }: IntegrationPromptModalProps) {
  const [currentPrompt, setCurrentPrompt] = useState(prompt)
  const [copied,  setCopied]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function copy() {
    navigator.clipboard.writeText(currentPrompt).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function regenerate() {
    if (!onRegenerateSecret) return
    setError(null)
    startTransition(async () => {
      const res = await onRegenerateSecret()
      if (res.ok === false) { setError(res.error); return }
      setCurrentPrompt(res.prompt)
    })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '640px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Copia todo este bloque y pégalo en tu asistente de IA de confianza (Claude, ChatGPT, etc.)
            junto con el pedido de construir o adaptar tu formulario. Tiene todo lo que el CRM necesita
            para reconocer cada respuesta.
          </div>

          <div style={{ position: 'relative' }}>
            <pre style={{
              background: 'var(--bg-overlay)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '14px',
              paddingTop: '44px',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              overflowX: 'auto',
              margin: 0,
              fontFamily: 'monospace',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '50vh',
              overflowY: 'auto',
            }}>
              {currentPrompt}
            </pre>
            <button
              onClick={copy}
              style={{
                position: 'absolute', top: '8px', right: '8px',
                background: copied ? 'var(--accent-green)' : 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)', borderRadius: '6px',
                padding: '5px 10px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '5px',
                fontSize: '12px', color: copied ? '#fff' : 'var(--text-muted)',
              }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copiado' : 'Copiar prompt'}
            </button>
          </div>

          {error && (
            <div style={{ fontSize: '12px', color: '#E04040', padding: '6px 10px', background: 'rgba(224,64,64,0.08)', borderRadius: '6px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px' }}>
            {onRegenerateSecret ? (
              <button
                onClick={regenerate}
                disabled={pending}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  fontSize: '12px', color: 'var(--accent-coral)',
                  background: 'transparent', border: '1px solid rgba(201,123,107,0.3)',
                  borderRadius: '6px', padding: '6px 12px', cursor: pending ? 'default' : 'pointer',
                  opacity: pending ? 0.6 : 1,
                }}
              >
                <RefreshCw size={12} />
                {pending ? 'Generando…' : 'Generar nuevo secret'}
              </button>
            ) : <span />}
            <button
              onClick={onClose}
              style={{
                padding: '9px 18px', fontSize: '13px', fontWeight: 500,
                color: 'var(--bg-base)', background: 'var(--accent-gold)',
                border: 'none', borderRadius: '8px', cursor: 'pointer',
              }}
            >
              Listo
            </button>
          </div>
          {onRegenerateSecret && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Generar un secret nuevo invalida cualquier integración que ya esté usando el anterior.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
