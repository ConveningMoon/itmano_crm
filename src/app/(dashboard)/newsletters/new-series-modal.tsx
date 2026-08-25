'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { ModalShell } from '@/components/motion/modal-shell'
import type { EmailSequence } from '@/lib/data/email-sequences'
import { createSeries } from './actions'

// Modal de "Nueva serie" — nombre, secuencia de seguimiento (opcional) y
// agente responsable (opcional). createSeries nunca lanza: siempre { ok }.

interface AgentOption {
  id:   string
  name: string
}

interface Props {
  open:      boolean
  onClose:   () => void
  sequences: EmailSequence[]
  agents:    AgentOption[]
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

const EMPTY = { name: '', emailSequenceId: '', agentId: '' }

export function NewSeriesModal({ open, onClose, sequences, agents }: Props) {
  const router = useRouter()
  const [form, setForm]   = useState(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleClose() {
    setError(null)
    setForm(EMPTY)
    onClose()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await createSeries({
        name:            form.name,
        emailSequenceId: form.emailSequenceId || null,
        agentId:         form.agentId || null,
      })
      if (res.ok) {
        router.refresh()
        handleClose()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <ModalShell open={open} onClose={handleClose} maxWidth={440}>
      <style>{`
        .nl-series-input:focus { border-color: var(--border-accent) !important; outline: none; }
      `}</style>

      <div style={{ padding: '24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Nueva serie
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

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Nombre */}
          <div>
            <label style={LABEL_STYLE}>Nombre *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Mercado de Hampton Roads"
              required
              autoFocus
              className="nl-series-input"
              style={INPUT_STYLE}
            />
          </div>

          {/* Secuencia de seguimiento */}
          <div>
            <label style={LABEL_STYLE}>Secuencia de seguimiento</label>
            <select
              value={form.emailSequenceId}
              onChange={e => setForm(prev => ({ ...prev, emailSequenceId: e.target.value }))}
              className="nl-series-input"
              style={{ ...INPUT_STYLE, appearance: 'none', cursor: 'pointer' }}
            >
              <option value="" style={{ background: '#16181C' }}>Sin secuencia vinculada</option>
              {sequences.map(seq => (
                <option key={seq.id} value={seq.id} style={{ background: '#16181C' }}>
                  {seq.name}
                </option>
              ))}
            </select>
          </div>

          {/* Agente responsable */}
          <div>
            <label style={LABEL_STYLE}>Agente responsable</label>
            <select
              value={form.agentId}
              onChange={e => setForm(prev => ({ ...prev, agentId: e.target.value }))}
              className="nl-series-input"
              style={{ ...INPUT_STYLE, appearance: 'none', cursor: 'pointer' }}
            >
              <option value="" style={{ background: '#16181C' }}>Toda la agencia</option>
              {agents.map(a => (
                <option key={a.id} value={a.id} style={{ background: '#16181C' }}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Error */}
          {error && (
            <p style={{ fontSize: '12px', color: 'var(--accent-coral)', margin: 0 }}>
              {error}
            </p>
          )}

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
            <button
              type="button"
              onClick={handleClose}
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
              disabled={isPending || !form.name.trim()}
              style={{
                padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
                background: 'var(--accent-gold)', color: 'var(--bg-base)',
                border: 'none', cursor: (isPending || !form.name.trim()) ? 'not-allowed' : 'pointer',
                opacity: (isPending || !form.name.trim()) ? 0.7 : 1,
              }}
            >
              {isPending ? 'Creando…' : 'Crear serie'}
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  )
}
