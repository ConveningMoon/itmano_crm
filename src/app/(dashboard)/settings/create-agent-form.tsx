'use client'

import { useState, useTransition } from 'react'
import { createAgent } from './actions'
import { INPUT, LABEL, BTN_PRIMARY, BTN_GHOST, LANGUAGE_OPTIONS } from './settings-styles'

// ─── Create agent form ────────────────────────────────────────────────────────

export function CreateAgentForm({ tenantId, onDone }: { tenantId?: string; onDone: () => void }) {
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [phone, setPhone]       = useState('')
  const [language, setLanguage] = useState('es')
  const [initials, setInitials] = useState('')
  const [color, setColor]       = useState('#5B8EC9')
  const [error, setError]       = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleCreate() {
    setError(null)
    startTransition(async () => {
      const res = await createAgent({
        name, email, phone, language,
        avatarInitials: initials || name.trim().slice(0, 2).toUpperCase(),
        accentColor: color, tenantId,
      })
      if (!res.ok) { setError(res.error); return }
      onDone()
    })
  }

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '20px', background: 'var(--bg-elevated)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        <div>
          <label style={LABEL}>Nombre</label>
          <input value={name} onChange={e => setName(e.target.value)} style={INPUT} placeholder="John Leonard" />
        </div>
        <div>
          <label style={LABEL}>Iniciales del avatar</label>
          <input value={initials} onChange={e => setInitials(e.target.value)} style={INPUT} maxLength={2} placeholder="JL" />
        </div>
        <div>
          <label style={LABEL}>Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} style={INPUT} type="email" placeholder="agente@email.com" />
        </div>
        <div>
          <label style={LABEL}>Teléfono (opcional)</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} style={INPUT} />
        </div>
        <div>
          <label style={LABEL}>Idioma principal</label>
          <select value={language} onChange={e => setLanguage(e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
            {LANGUAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label style={LABEL}>Color de acento</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              style={{ width: '40px', height: '36px', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', cursor: 'pointer' }} />
            <input value={color} onChange={e => setColor(e.target.value)} style={{ ...INPUT, flex: 1, fontFamily: 'monospace' }} maxLength={7} />
          </div>
        </div>
      </div>

      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>
        El idioma principal es el idioma base del agente (puedes agregar más desde &quot;Idiomas&quot;). El acceso de login se otorga después con &quot;Invitar acceso&quot;.
      </div>

      {error && <div style={{ fontSize: '12px', color: '#E04040', padding: '6px 10px', background: 'rgba(224,64,64,0.08)', borderRadius: '6px', marginTop: '10px' }}>{error}</div>}

      <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
        <button onClick={handleCreate} disabled={pending} style={{ ...BTN_PRIMARY, opacity: pending ? 0.6 : 1 }}>
          {pending ? 'Creando…' : 'Crear agente'}
        </button>
        <button onClick={onDone} style={BTN_GHOST}>Cancelar</button>
      </div>
    </div>
  )
}
