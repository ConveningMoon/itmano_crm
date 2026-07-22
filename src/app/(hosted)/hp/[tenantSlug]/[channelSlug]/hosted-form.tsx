'use client'

import { useEffect, useId, useMemo, useState, useTransition } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { HOSTED_UI_COPY, type HostedPageConfig, type HostedQuestion } from '@/lib/hosted-page'
import { submitHostedContact } from './actions'

// Formulario de la página alojada. lead_magnet/event postean al intake público
// (/api/intake/<publicId>/submit — dedup + scoring + secuencia); contact_form
// usa la server action (misma lógica que el webhook de Webflow).
//
// Cuando hay preguntas, el formulario se muestra como una SECUENCIA de slides
// (una pregunta por pantalla, con barra de progreso) y al final los datos de
// contacto — así no ocupa toda la pantalla aunque haya muchas preguntas.
//
// `surface` adapta la paleta: 'dark' → sobre tarjeta oscura (evento / formulario),
// 'light' → sobre tarjeta blanca (lead magnet).

type Surface = 'dark' | 'light'

function palette(surface: Surface) {
  return surface === 'dark'
    ? {
        inputBg: 'rgba(255,255,255,0.95)', inputBorder: 'rgba(255,255,255,0.16)', inputText: '#12212F',
        label: 'rgba(255,255,255,0.72)', err: '#FFC2B8', doneText: '#FFFFFF',
        heading: '#FFFFFF', sub: 'rgba(255,255,255,0.66)',
        optBg: 'rgba(255,255,255,0.06)', optBorder: 'rgba(255,255,255,0.2)', optText: '#FFFFFF',
        barTrack: 'rgba(255,255,255,0.16)',
      }
    : {
        inputBg: '#F3F1EC', inputBorder: 'rgba(18,33,47,0.14)', inputText: '#12212F',
        label: 'rgba(18,33,47,0.58)', err: '#C0392B', doneText: '#12212F',
        heading: '#12212F', sub: 'rgba(18,33,47,0.6)',
        optBg: '#F3F1EC', optBorder: 'rgba(18,33,47,0.14)', optText: '#12212F',
        barTrack: 'rgba(18,33,47,0.1)',
      }
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

  // Slides: una pregunta por paso + un paso final de contacto. dir para la
  // dirección de la animación (avanzar / retroceder).
  const questions = config.questions
  const useSlides = questions.length > 0
  const totalSteps = questions.length + 1
  const [step, setStep] = useState(0)
  const [dir, setDir]   = useState<1 | -1>(1)
  const isContactStep = step >= questions.length

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

  function advance() { setDir(1); setStep(s => Math.min(totalSteps - 1, s + 1)) }
  function goBack()  { setDir(-1); setStep(s => Math.max(0, s - 1)) }

  function answerAndAdvance(key: string, value: string) {
    setAnswers(prev => ({ ...prev, [key]: value }))
    setError(null)
    advance()
  }

  // Valida la pregunta actual (si es obligatoria) antes de avanzar (texto).
  function nextFromQuestion(q: HostedQuestion) {
    if (q.required && !(answers[q.key] ?? '').trim()) { setError(copy.requiredHint); return }
    setError(null)
    advance()
  }

  function doSubmit() {
    setError(null)
    if (!firstName.trim() || !email.trim()) { setError(copy.requiredHint); return }
    // En modo slides las obligatorias ya se validaron al avanzar; revalida por si acaso.
    for (const q of questions) {
      if (q.required && !(answers[q.key] ?? '').trim()) { setError(copy.requiredHint); setStep(0); return }
    }

    const form_answers = questions
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

  const focusStyle = <style>{`.${focusClass} input:focus, .${focusClass} select:focus, .${focusClass} textarea:focus { border-color: ${accent} !important; box-shadow: 0 0 0 3px ${accent}33; }`}</style>

  const backLink = (
    <button type="button" onClick={goBack} style={{ marginTop: '18px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: P.sub, padding: 0 }}>
      ← Atrás
    </button>
  )

  // ── Contact fields (paso final o formulario simple) ──────────────────────────
  const contactFields = (
    <div className={focusClass} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {focusStyle}
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
      {channelType === 'contact_form' && (
        <div>
          <label style={LABEL}>{config.language === 'en' ? 'Message' : config.language === 'pt' ? 'Mensagem' : 'Mensaje'}</label>
          <textarea style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} rows={4} value={message} onChange={e => setMessage(e.target.value)} />
        </div>
      )}

      {/* Honeypot */}
      <input type="text" name="website" value={website} onChange={e => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden style={{ position: 'absolute', left: '-9999px', height: 0, width: 0, opacity: 0 }} />

      {error && <div style={{ fontSize: '13px', color: P.err }}>{error}</div>}

      <button
        type="button"
        onClick={doSubmit}
        disabled={pending}
        style={{
          padding: '13px 20px', fontSize: '14px', fontWeight: 700, letterSpacing: '0.02em',
          background: accent, color: '#12212F', border: 'none', borderRadius: '10px',
          cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.7 : 1,
        }}
      >
        {pending ? '…' : (config.cta_label || copy.submitDefault)}
      </button>
      {useSlides && !pending && step > 0 && backLink}
    </div>
  )

  // ── Formulario simple (sin preguntas) ────────────────────────────────────────
  if (!useSlides) return contactFields

  // ── Modo slides ──────────────────────────────────────────────────────────────
  const q = questions[step]
  const slideVariants = {
    enter:  (d: number) => ({ x: d * 36, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit:   (d: number) => ({ x: d * -36, opacity: 0 }),
  }

  return (
    <div>
      {/* Barra de progreso */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: P.sub, marginBottom: '7px', fontWeight: 500 }}>
          <span>Paso {step + 1} de {totalSteps}</span>
          <span>{Math.round(((step + 1) / totalSteps) * 100)}%</span>
        </div>
        <div style={{ height: '5px', borderRadius: '999px', background: P.barTrack, overflow: 'hidden' }}>
          <m.div
            animate={{ width: `${((step + 1) / totalSteps) * 100}%` }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{ height: '100%', background: accent, borderRadius: '999px' }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <m.div
          key={step}
          custom={dir}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          {isContactStep ? (
            <>
              <h3 style={{ fontSize: '20px', fontWeight: 700, color: P.heading, margin: '0 0 6px', letterSpacing: '-0.01em' }}>
                {config.form_title || (config.language === 'en' ? 'Almost done — your details' : config.language === 'pt' ? 'Quase lá — seus dados' : 'Ya casi — tus datos')}
              </h3>
              <p style={{ fontSize: '13px', color: P.sub, margin: '0 0 18px', lineHeight: 1.5 }}>
                {config.form_subtitle || (config.language === 'en' ? 'Where should we send it?' : config.language === 'pt' ? 'Para onde enviamos?' : '¿A dónde te lo enviamos?')}
              </p>
              {contactFields}
            </>
          ) : (
            <>
              <h3 style={{ fontSize: '20px', fontWeight: 700, color: P.heading, margin: '0 0 16px', letterSpacing: '-0.01em', lineHeight: 1.25 }}>
                {q.label}{q.required ? ' *' : ''}
              </h3>

              {q.type === 'select' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '9px' }}>
                  {(q.options ?? []).map(o => {
                    const sel = answers[q.key] === o
                    return (
                      <button
                        key={o}
                        type="button"
                        onClick={() => answerAndAdvance(q.key, o)}
                        style={{
                          textAlign: 'left', padding: '13px 15px', borderRadius: '11px', cursor: 'pointer',
                          fontSize: '14px', fontWeight: 500,
                          background: sel ? `${accent}22` : P.optBg,
                          border: `1px solid ${sel ? accent : P.optBorder}`,
                          color: P.optText,
                          transition: 'border-color .15s, background .15s',
                        }}
                      >
                        {o}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className={focusClass}>
                  {focusStyle}
                  <input
                    style={INPUT}
                    value={answers[q.key] ?? ''}
                    onChange={e => setAnswers(prev => ({ ...prev, [q.key]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); nextFromQuestion(q) } }}
                    autoFocus
                    placeholder={config.language === 'en' ? 'Type your answer…' : config.language === 'pt' ? 'Escreva sua resposta…' : 'Escribe tu respuesta…'}
                  />
                  <button
                    type="button"
                    onClick={() => nextFromQuestion(q)}
                    style={{ marginTop: '14px', padding: '11px 22px', fontSize: '14px', fontWeight: 700, background: accent, color: '#12212F', border: 'none', borderRadius: '10px', cursor: 'pointer' }}
                  >
                    {config.language === 'en' ? 'Continue' : config.language === 'pt' ? 'Continuar' : 'Continuar'}
                  </button>
                </div>
              )}

              {error && <div style={{ fontSize: '13px', color: P.err, marginTop: '12px' }}>{error}</div>}

              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                {step > 0 && backLink}
                {!q.required && (
                  <button type="button" onClick={advance} style={{ marginTop: '18px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: P.sub, padding: 0 }}>
                    Omitir →
                  </button>
                )}
              </div>
            </>
          )}
        </m.div>
      </AnimatePresence>
    </div>
  )
}
