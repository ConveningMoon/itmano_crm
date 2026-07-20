'use client'

import { useEffect, useId, useMemo, useState, useTransition } from 'react'
import { HOSTED_UI_COPY, type HostedPageConfig } from '@/lib/hosted-page'
import { submitHostedContact } from './actions'

// Formulario de la página alojada. lead_magnet/event postean al intake público
// (/api/intake/<publicId>/submit — dedup + scoring + secuencia); contact_form
// usa la server action (misma lógica que el webhook de Webflow).
//
// `surface` adapta la paleta: 'dark' → inputs blancos sobre tarjeta oscura
// (evento / formulario), 'light' → inputs claros sobre tarjeta blanca (lead magnet).

type Surface = 'dark' | 'light'

function palette(surface: Surface) {
  return surface === 'dark'
    ? { inputBg: 'rgba(255,255,255,0.95)', inputBorder: 'rgba(255,255,255,0.16)', inputText: '#12212F', label: 'rgba(255,255,255,0.72)', err: '#FFC2B8', doneText: '#FFFFFF' }
    : { inputBg: '#F3F1EC', inputBorder: 'rgba(18,33,47,0.14)', inputText: '#12212F', label: 'rgba(18,33,47,0.58)', err: '#C0392B', doneText: '#12212F' }
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
  publicId, channelType, tenantSlug, channelSlug, config, accent, surface = 'dark',
}: {
  publicId: string
  channelType: 'lead_magnet' | 'event' | 'contact_form'
  tenantSlug: string
  channelSlug: string
  config: HostedPageConfig
  accent: string
  surface?: Surface
}) {
  const copy = HOSTED_UI_COPY[config.language]
  const P = palette(surface)
  const focusClass = useId().replace(/[:]/g, '')
  const INPUT: React.CSSProperties = {
    width: '100%', background: P.inputBg, border: `1px solid ${P.inputBorder}`,
    borderRadius: '10px', padding: '11px 13px', fontSize: '14px', color: P.inputText,
    outline: 'none', boxSizing: 'border-box',
  }
  const LABEL: React.CSSProperties = {
    fontSize: '11px', fontWeight: 600, color: P.label,
    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', display: 'block',
  }

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
      if (q.required && !(answers[q.key] ?? '').trim()) {
        setError(copy.requiredHint)
        return
      }
    }

    // Respuestas a las preguntas personalizadas (todos los tipos).
    const form_answers = config.questions
      .map(q => {
        const value = (answers[q.key] ?? '').trim()
        if (!value) return null
        return { key: q.key, question: q.label, value, label: value }
      })
      .filter((a): a is NonNullable<typeof a> => a !== null)

    start(async () => {
      try {
        if (channelType === 'contact_form') {
          const res = await submitHostedContact({
            tenantSlug, channelSlug,
            first_name: firstName, last_name: lastName, email, phone,
            message, language: config.language, website,
            form_answers,
          })
          if (!res.ok) { setError(res.error); return }
          setDone(config.success_message || copy.successDefault)
          return
        }

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
        <p style={{ fontSize: '15px', color: P.doneText, lineHeight: 1.6, margin: 0 }}>{done}</p>
      </div>
    )
  }

  return (
    <form className={focusClass} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <style>{`.${focusClass} input:focus, .${focusClass} select:focus, .${focusClass} textarea:focus { border-color: ${accent} !important; box-shadow: 0 0 0 3px ${accent}33; }`}</style>
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

      {/* Preguntas del constructor (todos los tipos) */}
      {config.questions.map(q => (
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

      {error && <div style={{ fontSize: '13px', color: P.err }}>{error}</div>}

      <button
        type="submit"
        disabled={pending}
        style={{
          padding: '13px 20px', fontSize: '14px', fontWeight: 700, letterSpacing: '0.02em',
          background: accent, color: '#12212F', border: 'none', borderRadius: '10px',
          cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.7 : 1,
          transition: 'filter 0.15s, transform 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.06)' }}
        onMouseLeave={e => { e.currentTarget.style.filter = 'none' }}
      >
        {pending ? '…' : (config.cta_label || copy.submitDefault)}
      </button>
    </form>
  )
}
