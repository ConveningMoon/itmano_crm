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

const CARD: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
  borderRadius: '12px', padding: '24px', maxWidth: '620px',
}
const INPUT: React.CSSProperties = {
  width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
  borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: 'var(--text-primary)',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-sans)',
}
const LABEL: React.CSSProperties = {
  display: 'block', fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500,
}

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
        style={{ ...CARD, borderTop: '1px solid var(--border-accent)', display: 'flex', gap: '14px' }}
      >
        <CheckCircle2 size={22} strokeWidth={1.6} style={{ color: 'var(--accent-green)', flexShrink: 0, marginTop: '2px' }} />
        <div>
          <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>Solicitud enviada</div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.55 }}>
            Nuestro equipo de soporte te responderá a <strong>{userEmail}</strong> lo antes posible.
            Gracias por escribirnos.
          </p>
        </div>
      </m.div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
          background: 'color-mix(in srgb, var(--accent-gold) 12%, transparent)', color: 'var(--accent-gold)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <LifeBuoy size={17} strokeWidth={1.6} />
        </div>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Contacta a soporte técnico</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Te respondemos a {userEmail}</div>
        </div>
      </div>

      <div>
        <label style={LABEL} htmlFor="sp-category">Categoría</label>
        <select id="sp-category" name="category" style={{ ...INPUT, cursor: 'pointer' }} defaultValue="problema">
          {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div>
        <label style={LABEL} htmlFor="sp-subject">Asunto</label>
        <input id="sp-subject" name="subject" style={INPUT} required minLength={3} maxLength={160} placeholder="Resume tu solicitud en una línea" />
      </div>

      <div>
        <label style={LABEL} htmlFor="sp-message">Mensaje</label>
        <textarea
          id="sp-message" name="message" style={{ ...INPUT, resize: 'vertical' }}
          required minLength={10} maxLength={4000} rows={6}
          placeholder="Describe con detalle qué necesitas o qué está fallando. Si es un error, cuéntanos qué hacías cuando ocurrió."
        />
      </div>

      {/* Honeypot */}
      <div style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }} aria-hidden="true">
        <label htmlFor="sp-website">Sitio web</label>
        <input id="sp-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {error && <p role="alert" style={{ fontSize: '12px', color: 'var(--accent-coral)', margin: 0 }}>{error}</p>}

      <div>
        <button
          type="submit"
          className={pending ? undefined : 'btn-cta'}
          disabled={pending}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '10px 20px', borderRadius: '8px', border: 'none',
            background: pending ? 'var(--accent-gold-dim)' : 'var(--accent-gold)', color: 'var(--bg-base)',
            fontSize: '13px', fontWeight: 600, letterSpacing: '0.04em',
            cursor: pending ? 'wait' : 'pointer',
          }}
        >
          {pending ? 'Enviando…' : 'Enviar solicitud'}
        </button>
      </div>
    </form>
  )
}

