'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { ModalShell } from '@/components/motion/modal-shell'
import type { EmailSequence } from '@/lib/data/email-sequences'
import type { NewsletterSeries } from '@/lib/data/newsletters'
import { createSeries, updateSeries } from './actions'

// Modal de serie — nombre, secuencia de seguimiento (opcional) y agente
// responsable (opcional). Crea o edita según venga `series`: los tres campos
// que se piden al crear son EXACTAMENTE los que se pueden cambiar después
// (SeriesInput en actions.ts es el mismo esquema para las dos acciones), así
// que un segundo formulario sólo serviría para que los dos se separen.
//
// El slug NO está aquí: no cambia al renombrar porque la URL pública ya se
// compartió (ver updateSeries).
//
// Ninguna de las dos actions lanza: siempre { ok }.

interface AgentOption {
  id:   string
  name: string
}

interface Props {
  open:      boolean
  onClose:   () => void
  sequences: EmailSequence[]
  agents:    AgentOption[]
  /** Presente = editar esa serie; ausente = crear una nueva. */
  series?:   NewsletterSeries | null
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

function initialFor(series: NewsletterSeries | null | undefined) {
  if (!series) return EMPTY
  return {
    name:            series.name,
    emailSequenceId: series.emailSequenceId ?? '',
    agentId:         series.agentId ?? '',
  }
}

export function SeriesModal({ open, onClose, sequences, agents, series }: Props) {
  const router = useRouter()
  const editing = Boolean(series)
  // `key` en el sitio de uso remonta el modal cuando cambia la serie, así que
  // el estado inicial basta: no hace falta un efecto que sincronice props con
  // estado (el patrón que se desincroniza en cuanto alguien añade un campo).
  const [form, setForm]   = useState(() => initialFor(series))
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleClose() {
    setError(null)
    setForm(initialFor(series))
    onClose()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const payload = {
        name:            form.name,
        emailSequenceId: form.emailSequenceId || null,
        agentId:         form.agentId || null,
      }
      const res = series
        ? await updateSeries(series.id, payload)
        : await createSeries(payload)
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
            {editing ? 'Editar serie' : 'Nueva serie'}
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
              {isPending
                ? (editing ? 'Guardando…' : 'Creando…')
                : (editing ? 'Guardar cambios' : 'Crear serie')}
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  )
}
