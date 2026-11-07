'use client'

import { useState, useTransition } from 'react'
import { m } from 'motion/react'
import { LifeBuoy, CheckCircle2 } from 'lucide-react'
import { EASE_OUT_PREMIUM } from '@/components/motion/primitives'
import { submitSupportRequest, type SupportInput } from './actions'

const CATEGORY_OPTIONS: { value: SupportInput['category']; label: string }[] = [
  { value: 'problema', label: 'Problema técnico' },
  { value: 'pregunta', label: 'Pregunta sobre el uso' },
  { value: 'cambio',   label: 'Solicitud de cambio' },
  { value: 'otro',     label: 'Otro' },
]

export function SupportForm({ userEmail }: { userEmail: string }) {
  const [pending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pending) return
    setError(null)
    const data = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await submitSupportRequest({
        category: String(data.get('category') ?? 'problema') as SupportInput['category'],
        subject:  String(data.get('subject') ?? ''),
        message:  String(data.get('message') ?? ''),
        website:  String(data.get('website') ?? ''),
      })
      if (res.ok) setSent(true)
      else setError(res.error)
    })
  }

  if (sent) {
    return (
      <m.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE_OUT_PREMIUM }}
        className="settings-card form-card"
        role="status"
      >
        <div className="form-card-head">
          <span className="feed-icon" aria-hidden="true"><CheckCircle2 size={17} strokeWidth={1.8} /></span>
          <div>
            <div className="form-card-title">Solicitud enviada</div>
            <div className="form-card-sub">Te responderemos a <strong>{userEmail}</strong> lo antes posible.</div>
          </div>
        </div>
      </m.div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="settings-card form-card">
      <div className="form-card-head">
        <span className="feed-icon" aria-hidden="true"><LifeBuoy size={17} strokeWidth={1.6} /></span>
        <div>
          <div className="form-card-title">Contacta a soporte técnico</div>
          <div className="form-card-sub">Te respondemos a {userEmail}</div>
        </div>
      </div>

      <div>
        <label className="settings-field-label" htmlFor="sp-category">Categoría</label>
        <select id="sp-category" name="category" className="settings-input" defaultValue="problema">
          {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div>
        <label className="settings-field-label" htmlFor="sp-subject">Asunto</label>
        <input id="sp-subject" name="subject" className="settings-input" required minLength={3} maxLength={160} placeholder="Resume tu solicitud en una línea" />
      </div>

      <div>
        <label className="settings-field-label" htmlFor="sp-message">Mensaje</label>
        <textarea
          id="sp-message" name="message" className="settings-input"
          required minLength={10} maxLength={4000} rows={6}
          placeholder="Qué necesitas o qué está fallando. Si es un error, qué hacías cuando ocurrió."
        />
      </div>

      {/* Honeypot */}
      <div className="visually-hidden-field" aria-hidden="true">
        <label htmlFor="sp-website">Sitio web</label>
        <input id="sp-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {error && <p role="alert" className="form-error">{error}</p>}

      <div>
        <button type="submit" className="btn btn-primary" disabled={pending} aria-busy={pending}>
          {pending ? 'Enviando…' : 'Enviar solicitud'}
        </button>
      </div>
    </form>
  )
}
