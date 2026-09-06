'use client'

import { useState, useTransition } from 'react'
import { m, AnimatePresence } from 'motion/react'
import { EASE_OUT_PREMIUM } from '@/components/motion/primitives'
import { submitContactForm } from '@/app/(marketing)/contact-actions'

export function ContactForm() {
  const [pending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pending) return
    setError(null)

    const form = e.currentTarget
    const data = new FormData(form)
    startTransition(async () => {
      const result = await submitContactForm({
        name:    String(data.get('name') ?? ''),
        email:   String(data.get('email') ?? ''),
        company: String(data.get('company') ?? ''),
        message: String(data.get('message') ?? ''),
        website: String(data.get('website') ?? ''),
      })
      if (result.ok) {
        setSent(true)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <AnimatePresence mode="wait">
      {sent ? (
        <m.div
          key="sent"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_OUT_PREMIUM }}
          className="mk-card"
          style={{
            borderTop: '1px solid var(--border-accent)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            padding: '32px',
          }}
        >
          <span className="mk-eyebrow">Mensaje recibido</span>
          <p style={{ fontSize: '17px', fontWeight: 400, color: 'var(--text-primary)', lineHeight: 1.5 }}>
            Gracias por escribirnos. Te contactaremos en menos de 24 horas hábiles
            para conocer tu operación y agendar una demostración.
          </p>
        </m.div>
      ) : (
        <m.form
          key="form"
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: EASE_OUT_PREMIUM }}
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <div className="mk-form-row">
            <div>
              <label className="mk-label" htmlFor="ct-name">Nombre</label>
              <input id="ct-name" name="name" className="mk-input" required minLength={2} maxLength={120} autoComplete="name" />
            </div>
            <div>
              <label className="mk-label" htmlFor="ct-email">Email</label>
              <input id="ct-email" name="email" type="email" className="mk-input" required maxLength={200} autoComplete="email" />
            </div>
          </div>

          <div>
            <label className="mk-label" htmlFor="ct-company">Agencia o empresa (opcional)</label>
            <input id="ct-company" name="company" className="mk-input" maxLength={160} autoComplete="organization" />
          </div>

          <div>
            <label className="mk-label" htmlFor="ct-message">¿Cómo opera tu equipo hoy?</label>
            <textarea
              id="ct-message"
              name="message"
              className="mk-input"
              required
              minLength={10}
              maxLength={4000}
              rows={5}
              style={{ resize: 'vertical' }}
              placeholder="Cuéntanos cuántos agentes son, de dónde llegan sus leads y qué se les escapa hoy."
            />
          </div>

          {/* Honeypot — invisible para humanos, los bots lo completan */}
          <div style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }} aria-hidden="true">
            <label htmlFor="ct-website">Sitio web</label>
            <input id="ct-website" name="website" tabIndex={-1} autoComplete="off" />
          </div>

          {error && (
            <p role="alert" style={{ fontSize: '12px', color: 'var(--accent-coral)' }}>{error}</p>
          )}

          <button type="submit" className="mk-btn-gold btn-cta" disabled={pending} style={pending ? { opacity: 0.7, cursor: 'wait' } : undefined}>
            {pending ? 'Enviando…' : 'Enviar mensaje'}
          </button>

          <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Al enviar este formulario aceptas nuestra{' '}
            <a href="/privacidad" style={{ color: 'var(--text-secondary)' }}>política de privacidad</a>.
            Sin listas de correo: solo te contactamos sobre tu solicitud.
          </p>
        </m.form>
      )}
    </AnimatePresence>
  )
}
