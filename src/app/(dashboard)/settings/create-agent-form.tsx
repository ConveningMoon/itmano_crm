'use client'

import { useId, useState, useTransition } from 'react'
import { AlertCircle } from 'lucide-react'
import { DEFAULT_AGENT_ACCENT, LANGUAGE_CONFIG, SUPPORTED_LANGUAGE_CODES } from '@/lib/config'
import { InfoHint } from '@/components/ui/info-hint'
import { createAgent } from './actions'

const LANGUAGE_OPTIONS = SUPPORTED_LANGUAGE_CODES.map(code => ({ value: code, label: LANGUAGE_CONFIG[code].label }))

// ─── Create agent form ────────────────────────────────────────────────────────

export function CreateAgentForm({ tenantId, onDone }: { tenantId?: string; onDone: () => void }) {
  const uid = useId()
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [phone, setPhone]       = useState('')
  const [language, setLanguage] = useState('es')
  const [initials, setInitials] = useState('')
  const [color, setColor]       = useState(DEFAULT_AGENT_ACCENT)
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
    <div className="settings-panel settings-create">
      <div className="settings-form-grid">
        <div>
          <label className="settings-field-label" htmlFor={`${uid}-name`}>Nombre</label>
          <input id={`${uid}-name`} className="settings-input" value={name} onChange={e => setName(e.target.value)} placeholder="John Leonard" autoFocus />
        </div>
        <div>
          <label className="settings-field-label" htmlFor={`${uid}-initials`}>Iniciales del avatar</label>
          <input id={`${uid}-initials`} className="settings-input" value={initials} onChange={e => setInitials(e.target.value)} maxLength={2} placeholder="JL" />
        </div>
        <div>
          <label className="settings-field-label" htmlFor={`${uid}-email`}>Email</label>
          <input id={`${uid}-email`} className="settings-input" value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="agente@email.com" />
        </div>
        <div>
          <label className="settings-field-label" htmlFor={`${uid}-phone`}>Teléfono (opcional)</label>
          <input id={`${uid}-phone`} className="settings-input" value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
        <div>
          <label className="settings-field-label" htmlFor={`${uid}-language`}>Idioma principal</label>
          <select id={`${uid}-language`} className="settings-input" value={language} onChange={e => setLanguage(e.target.value)}>
            {LANGUAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="settings-field-label" htmlFor={`${uid}-color`}>Color de acento</label>
          <div className="settings-color-row">
            <input className="settings-color-input" type="color" aria-label="Elegir color de acento" value={color} onChange={e => setColor(e.target.value)} />
            <input id={`${uid}-color`} className="settings-input settings-input-mono" value={color} onChange={e => setColor(e.target.value)} maxLength={7} />
          </div>
        </div>
      </div>

      <p className="settings-note settings-inline settings-inline-nowrap">
        <span className="settings-note-text">Sobre el idioma principal y el acceso</span>
        <InfoHint label="Sobre el idioma principal y el acceso">
          El idioma principal es el idioma base del agente (puedes agregar más desde &quot;Idiomas&quot;). El acceso de login se otorga después con &quot;Invitar acceso&quot;.
        </InfoHint>
      </p>

      {error && <p className="settings-alert" role="alert"><AlertCircle size={13} aria-hidden="true" /> {error}</p>}

      <div className="settings-actions">
        <button type="button" className="btn btn-primary" onClick={handleCreate} disabled={pending}>
          {pending ? 'Creando…' : 'Crear agente'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>Cancelar</button>
      </div>
    </div>
  )
}
