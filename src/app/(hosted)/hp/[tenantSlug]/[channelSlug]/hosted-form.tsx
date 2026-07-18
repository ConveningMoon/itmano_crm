'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { HOSTED_UI_COPY, type HostedPageConfig } from '@/lib/hosted-page'
import { submitHostedContact } from './actions'

// Formulario de la página alojada. lead_magnet/event postean al intake público
// (/api/intake/<publicId>/submit — dedup + scoring + secuencia); contact_form
// usa la server action (misma lógica que el webhook de Webflow).

const INPUT: React.CSSProperties = {
  width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
  borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: 'var(--text-primary)',
  outline: 'none', boxSizing: 'border-box',
}

const LABEL: React.CSSProperties = {
  fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', display: 'block',
}

function visitorId(): string {
  try {
    const KEY = 'itmano_visitor_id'
    let id = localStorage.getItem(KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return 'anon'
  }
}

export function HostedForm({
  publicId, channelType, tenantSlug, channelSlug, config, accent,
}: {
  publicId: string
  channelType: 'lead_magnet' | 'event' | 'contact_form'
  tenantSlug: string
  channelSlug: string
  config: HostedPageConfig
  accent: string
}) {
  const copy = HOSTED_UI_COPY[config.language]

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [email, setEmail]         = useState('')
  const [phone, setPhone]         = useState('')
  const [message, setMessage]     = useState('') // solo contact_form
  const [answers, setAnswers]     = useState<Record<string, string>>({})
  const [website, setWebsite]     = useState('') // honeypot
  const [done, setDone]           = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [pending, start]          = useTransition()

  const vid = useMemo(() => (typeof window !== 'undefined' ? visitorId() : 'anon'), [])

  // Registro de visita (channel_page_views) — beacon best-effort al montar.
  useEffect(() => {
    try {
      fetch(`/api/intake/${publicId}/view`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          visitor_id: vid,
          url:        window.location.href,
          referrer:   document.referrer || null,
          user_agent: navigator.userAgent,
        }),
        keepalive: true,
      }).catch(() => {})
    } catch { /* nunca romper la página por el beacon */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicId])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!firstName.trim() || !email.trim()) { setError(copy.requiredHint); return }
    for (const q of config.questions) {
      if (channelType !== 'contact_form' && q.required && !(answers[q.key] ?? '').trim()) {
        setError(copy.requiredHint)
        return
      }
    }

    start(async () => {
      try {
        if (channelType === 'contact_form') {
          const res = await submitHostedContact({
            tenantSlug, channelSlug,
            first_name: firstName, last_name: lastName, email, phone,
            message, language: config.language, website,
          })
          if (!res.ok) { setError(res.error); return }
          setDone(config.success_message || copy.successDefault)
          return
        }

        const form_answers = config.questions
          .map(q => {
            const value = (answers[q.key] ?? '').trim()
            if (!value) return null
            const label = q.type === 'select' ? value : value
            return { key: q.key, question: q.label, value, label }
          })
          .filter((a): a is NonNullable<typeof a> => a !== null)

        const res = await fetch(`/api/intake/${publicId}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_name: firstName.trim(),
            last_name:  lastName.trim(),
            email:      email.trim(),
            phone:      phone.trim() || undefined,
            language:   config.language,
            visitor_id: vid,
            form_answers,
            source_url: window.location.href,
            website,
          }),
        })
        const body = await res.json().catch(() => null)
        if (!res.ok || !body?.ok) { setError(copy.errorGeneric); return }
        setDone(body.status === 'already_submitted'
          ? copy.alreadySubmitted
          : (config.success_message || copy.successDefault))
      } catch {
        setError(copy.errorGeneric)
      }
    })
  }

  if (done) {
    return (
      <div style={{ textAlign: 'center', padding: '12px 0' }}>
        <div style={{
          width: '44px', height: '44px', borderRadius: '50%', margin: '0 auto 14px',
          background: `${accent}22`, border: `1px solid ${accent}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '20px', color: accent,
        }}>
          ✓
        </div>
        <p style={{ fontSize: '15px', color: 'var(--text-primary)', lineHeight: 1.6, margin: 0 }}>{done}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={LABEL}>{copy.firstName} *</label>
          <input style={INPUT} value={firstName} onChange={e => setFirstName(e.target.value)} autoComplete="given-name" />
        </div>
        <div>
          <label style={LABEL}>{copy.lastName}</label>
          <input style={INPUT} value={lastName} onChange={e => setLastName(e.target.value)} autoComplete="family-name" />
        </div>
      </div>
      <div>
        <label style={LABEL}>{copy.email} *</label>
        <input style={INPUT} type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
      </div>
      {(config.ask_phone || channelType === 'contact_form') && (
        <div>
          <label style={LABEL}>{copy.phone}</label>
          <input style={INPUT} value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" />
        </div>
      )}

      {/* Preguntas del constructor (lead_magnet / event) */}
      {channelType !== 'contact_form' && config.questions.map(q => (
        <div key={q.key}>
          <label style={LABEL}>{q.label}{q.required ? ' *' : ''}</label>
          {q.type === 'select' ? (
            <select
              style={{ ...INPUT, cursor: 'pointer' }}
              value={answers[q.key] ?? ''}
              onChange={e => setAnswers(prev => ({ ...prev, [q.key]: e.target.value }))}
            >
              <option value="">—</option>
              {(q.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              style={INPUT}
              value={answers[q.key] ?? ''}
              onChange={e => setAnswers(prev => ({ ...prev, [q.key]: e.target.value }))}
            />
          )}
        </div>
      ))}

      {/* Mensaje libre (contact_form) */}
      {channelType === 'contact_form' && (
        <div>
          <label style={LABEL}>{config.language === 'en' ? 'Message' : config.language === 'pt' ? 'Mensagem' : 'Mensaje'}</label>
          <textarea
            style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            rows={4}
            value={message}
            onChange={e => setMessage(e.target.value)}
          />
        </div>
      )}

      {/* Honeypot — oculto para humanos */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={e => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        style={{ position: 'absolute', left: '-9999px', height: 0, width: 0, opacity: 0 }}
        aria-hidden
      />

      {error && <div style={{ fontSize: '13px', color: '#E04040' }}>{error}</div>}

      <button
        type="submit"
        disabled={pending}
        style={{
          padding: '12px 20px', fontSize: '14px', fontWeight: 600,
          background: accent, color: '#0F0F10', border: 'none', borderRadius: '8px',
          cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.7 : 1,
        }}
      >
        {pending ? '…' : (config.cta_label || copy.submitDefault)}
      </button>
    </form>
  )
}
