'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { LANGUAGE_CONFIG } from '@/lib/config'
import type { Lead, Agent, LeadSource } from '@/lib/types'
import { updateLead } from './actions'

// ─── Props ────────────────────────────────────────────────────────────────────

interface EditLeadModalProps {
  lead: Lead
  agents: Agent[]
  sources: LeadSource[]
  isOpen: boolean
  onClose: () => void
}

// ─── Style constants ──────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export function EditLeadModal({ lead, agents, sources, isOpen, onClose }: EditLeadModalProps) {
  const router = useRouter()

  const [form, setForm] = useState({
    firstName: lead.firstName,
    lastName:  lead.lastName,
    email:     lead.email,
    phone:     lead.phone    ?? '',
    language:  lead.language,
    agentId:   lead.agentId,
    sourceId:  lead.sourceId,
    lender:    lead.lender   ?? '',
    notes:     lead.notes    ?? '',
  })
  const [error, setError]            = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (!isOpen) return null

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await updateLead(lead.id, form)
      if (res.ok) {
        router.refresh()
        onClose()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <>
      <style>{`
        .edit-modal-input:focus { border-color: var(--border-accent) !important; outline: none; }
      `}</style>

      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          zIndex: 50,
        }}
        onClick={onClose}
      />

      {/* Modal box */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-accent)',
        borderRadius: '16px', padding: '24px',
        width: '480px', maxWidth: '90vw',
        zIndex: 51,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Editar lead
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '4px',
            }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
          {lead.firstName} {lead.lastName}
        </div>

        <form onSubmit={handleSubmit}>
          {/* Scrollable field area */}
          <div style={{
            maxHeight: '60vh', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: '14px',
            marginBottom: '20px', paddingRight: '4px',
          }}>

            {/* Nombre */}
            <div>
              <label style={LABEL_STYLE}>Nombre</label>
              <input
                type="text"
                value={form.firstName}
                onChange={set('firstName')}
                required
                className="edit-modal-input"
                style={INPUT_STYLE}
              />
            </div>

            {/* Apellido */}
            <div>
              <label style={LABEL_STYLE}>Apellido</label>
              <input
                type="text"
                value={form.lastName}
                onChange={set('lastName')}
                required
                className="edit-modal-input"
                style={INPUT_STYLE}
              />
            </div>

            {/* Email */}
            <div>
              <label style={LABEL_STYLE}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={set('email')}
                required
                className="edit-modal-input"
                style={INPUT_STYLE}
              />
            </div>

            {/* Teléfono */}
            <div>
              <label style={LABEL_STYLE}>Teléfono</label>
              <input
                type="text"
                value={form.phone}
                onChange={set('phone')}
                className="edit-modal-input"
                style={INPUT_STYLE}
              />
            </div>

            {/* Idioma */}
            <div>
              <label style={LABEL_STYLE}>Idioma</label>
              <select
                value={form.language}
                onChange={set('language')}
                required
                className="edit-modal-input"
                style={{ ...INPUT_STYLE, appearance: 'none', cursor: 'pointer' }}
              >
                {Object.entries(LANGUAGE_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key} style={{ background: '#16181C' }}>
                    {cfg.flag} {cfg.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Agente asignado */}
            <div>
              <label style={LABEL_STYLE}>Agente asignado</label>
              <select
                value={form.agentId}
                onChange={set('agentId')}
                required
                className="edit-modal-input"
                style={{ ...INPUT_STYLE, appearance: 'none', cursor: 'pointer' }}
              >
                {agents.map(agent => (
                  <option key={agent.id} value={agent.id} style={{ background: '#16181C' }}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Fuente */}
            <div>
              <label style={LABEL_STYLE}>Fuente</label>
              <select
                value={form.sourceId}
                onChange={set('sourceId')}
                required
                className="edit-modal-input"
                style={{ ...INPUT_STYLE, appearance: 'none', cursor: 'pointer' }}
              >
                {sources.map(source => (
                  <option key={source.id} value={source.id} style={{ background: '#16181C' }}>
                    {source.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Prestamista */}
            <div>
              <label style={LABEL_STYLE}>Prestamista</label>
              <input
                type="text"
                value={form.lender}
                onChange={set('lender')}
                className="edit-modal-input"
                style={INPUT_STYLE}
              />
            </div>

            {/* Notas */}
            <div>
              <label style={LABEL_STYLE}>Notas</label>
              <textarea
                value={form.notes}
                onChange={set('notes')}
                rows={4}
                className="edit-modal-input"
                style={{ ...INPUT_STYLE, resize: 'none', fontFamily: 'inherit', lineHeight: 1.5 }}
              />
            </div>
          </div>

          {/* Inline error */}
          {error && (
            <p style={{ fontSize: '12px', color: '#C97B6B', marginBottom: '12px' }}>
              {error}
            </p>
          )}

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
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
              disabled={isPending}
              style={{
                padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
                background: 'var(--accent-gold)', color: 'var(--bg-base)',
                border: 'none', cursor: isPending ? 'not-allowed' : 'pointer',
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
