'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSequence } from '../actions'

const INPUT: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-overlay)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  padding: '9px 12px',
  color: 'var(--text-primary)',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
}

const LABEL: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '6px',
  display: 'block',
}

interface Props {
  isSuperAdmin:    boolean
  tenants:         Array<{ id: string; name: string }>
  fixedTenantId?:  string
}

export function NewSequenceForm({ isSuperAdmin, tenants, fixedTenantId }: Props) {
  const router = useRouter()
  const [name,        setName]        = useState('')
  const [language,    setLanguage]    = useState<'es' | 'en' | 'pt'>('es')
  const [description, setDescription] = useState('')
  const [tenantId,    setTenantId]    = useState(fixedTenantId ?? tenants[0]?.id ?? '')
  const [error,       setError]       = useState<string | null>(null)
  const [pending,     start]          = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await createSequence({
        name,
        language,
        description: description.trim() || null,
        tenantId: isSuperAdmin ? tenantId : undefined,
      })
      if (!res.ok) { setError(res.error); return }
      router.push(`/emails/${res.id}`)
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <style>{`
        .seq-input:focus { border-color: var(--border-accent) !important; }
        .seq-select:focus { border-color: var(--border-accent) !important; }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>

        {isSuperAdmin && (
          <div>
            <label style={LABEL}>Tenant</label>
            <select
              value={tenantId}
              onChange={e => setTenantId(e.target.value)}
              className="seq-select"
              required
              style={{ ...INPUT, appearance: 'none', cursor: 'pointer' }}
            >
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label style={LABEL}>Nombre <span style={{ color: 'var(--accent-coral)' }}>*</span></label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="ej. Secuencia Guía Familias Hispanas"
            maxLength={100}
            required
            className="seq-input"
            style={INPUT}
            autoFocus
          />
        </div>

        <div>
          <label style={LABEL}>Idioma <span style={{ color: 'var(--accent-coral)' }}>*</span></label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {([
              { v: 'es', label: 'Español' },
              { v: 'en', label: 'English' },
              { v: 'pt', label: 'Português' },
            ] as const).map(opt => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setLanguage(opt.v)}
                style={{
                  padding: '7px 16px', fontSize: '12px', fontWeight: 500, borderRadius: '8px', cursor: 'pointer',
                  transition: 'all 0.15s',
                  background: language === opt.v ? 'rgba(201,169,110,0.15)' : 'var(--bg-elevated)',
                  color: language === opt.v ? 'var(--accent-gold)' : 'var(--text-muted)',
                  border: language === opt.v ? '1px solid rgba(201,169,110,0.3)' : '1px solid var(--border-subtle)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={LABEL}>Descripción <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opcional)</span></label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Notas internas sobre el propósito de esta secuencia"
            maxLength={500}
            rows={3}
            className="seq-input"
            style={{ ...INPUT, resize: 'vertical', lineHeight: 1.5 }}
          />
        </div>
      </div>

      {error && (
        <div style={{ fontSize: '12px', color: '#E04040', marginBottom: '16px', padding: '8px 12px', background: 'rgba(224,64,64,0.08)', borderRadius: '6px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          type="button"
          onClick={() => window.history.back()}
          style={{ padding: '9px 18px', fontSize: '13px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!name.trim() || pending || (isSuperAdmin && !tenantId)}
          style={{
            padding: '9px 24px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
            background: 'var(--accent-gold)', color: 'var(--bg-base)',
            border: 'none',
            cursor: (!name.trim() || pending || (isSuperAdmin && !tenantId)) ? 'not-allowed' : 'pointer',
            opacity: (!name.trim() || pending || (isSuperAdmin && !tenantId)) ? 0.7 : 1,
          }}
        >
          {pending ? 'Creando...' : 'Crear secuencia'}
        </button>
      </div>
    </form>
  )
}
