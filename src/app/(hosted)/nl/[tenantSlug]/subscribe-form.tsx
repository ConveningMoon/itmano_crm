'use client'

import { useState, useTransition } from 'react'
import type { Pal } from './nl-chrome'

// Formulario de suscripción a la newsletter del tenant — postea al intake
// público (/api/intake/<publicId>/submit), mismo contrato y endpoint que
// hp/[tenantSlug]/[channelSlug]/hosted-form.tsx, pero con menos campos: sólo
// lo que hace falta para dar de alta a un lector, más la PRUEBA del
// consentimiento que exige el RGPD (art. 7.1) — por eso la casilla no viene
// premarcada y su texto literal viaja como `consent_text`.
//
// El suscriptor entra al CRM marcado `newsletter_subscriber` (ver
// src/lib/newsletters/subscriber.ts): no dispara análisis de IA ni contamina
// los quintiles de calidad (migración 106). Lo que recibe es la SECUENCIA
// vinculada a la newsletter — el sistema todavía no envía las ediciones por
// correo, así que el copy nunca lo promete.
//
// Se renderiza en dos sitios: la portada del tenant (sin `editionId`, se
// suscribió desde el archivo general) y la página de cada edición (con
// `editionId`, para que las estadísticas por edición sepan qué edición captó
// al lector — ver getNewsletterStats/aggregateStats).

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

export function SubscribeForm({
  publicId, tenantName, P, editionId,
}: {
  publicId: string
  tenantName: string
  P: Pal
  /** Edición desde la que se suscribe, si el formulario vive en una edición. */
  editionId?: string
}) {
  const [firstName, setFirstName] = useState('')
  const [email, setEmail]         = useState('')
  const [consent, setConsent]     = useState(false)
  const [website, setWebsite]     = useState('') // honeypot
  const [done, setDone]           = useState(false)
  const [already, setAlready]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [pending, start]          = useTransition()

  const consentText = `Acepto recibir comunicaciones de ${tenantName} por correo. Puedo darme de baja en cualquier momento.`

  function doSubmit() {
    setError(null)
    if (!firstName.trim() || !email.trim()) { setError('Completa tu nombre y tu correo.'); return }
    if (!consent) { setError('Marca la casilla de consentimiento para continuar.'); return }

    start(async () => {
      try {
        const res = await fetch(`/api/intake/${publicId}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_name:   firstName.trim(),
            email:        email.trim(),
            visitor_id:   visitorId(),
            consent_text: consentText,
            source_url:   window.location.href,
            ...(editionId ? { edition_id: editionId } : {}),
            website,
          }),
        })
        const body = await res.json().catch(() => null)
        if (!res.ok || !body?.ok) { setError('No pudimos completar la suscripción. Inténtalo de nuevo.'); return }
        setAlready(body.status === 'already_submitted')
        setDone(true)
      } catch {
        setError('No pudimos completar la suscripción. Inténtalo de nuevo.')
      }
    })
  }

  const cardStyle: React.CSSProperties = {
    background: '#fff', borderRadius: '16px', border: `1px solid ${P.line}`,
    boxShadow: P.cardShadow,
  }

  if (done) {
    return (
      <div style={{ ...cardStyle, padding: '28px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: '15px', color: P.ink, lineHeight: 1.6, margin: 0 }}>
          {already
            ? 'Ya estabas suscrito — sigues inscrito.'
            : 'Listo. En breve empiezas a recibir la newsletter.'}
        </p>
      </div>
    )
  }

  const INPUT: React.CSSProperties = {
    width: '100%', background: P.paperAlt, border: `1px solid ${P.line}`,
    borderRadius: '10px', padding: '11px 13px', fontSize: '14px', color: P.ink,
    outline: 'none', boxSizing: 'border-box',
  }
  const LABEL: React.CSSProperties = {
    fontSize: '11px', fontWeight: 600, color: P.textFaint,
    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', display: 'block',
  }

  return (
    <div style={{ ...cardStyle, padding: '26px 24px' }}>
      <h2 style={{ fontSize: '17px', fontWeight: 700, color: P.ink, margin: '0 0 4px', letterSpacing: '-0.01em' }}>
        Suscríbete a la newsletter
      </h2>
      <p style={{ fontSize: '13px', color: P.textSoft, margin: '0 0 18px', lineHeight: 1.5 }}>
        Deja tus datos para recibir el contenido de {tenantName}.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <label style={LABEL}>Nombre *</label>
          <input style={INPUT} value={firstName} onChange={e => setFirstName(e.target.value)} autoComplete="given-name" />
        </div>
        <div>
          <label style={LABEL}>Email *</label>
          <input style={INPUT} type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
        </div>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', fontSize: '12.5px', color: P.textSoft, lineHeight: 1.5, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={consent}
            onChange={e => setConsent(e.target.checked)}
            style={{ marginTop: '2px', accentColor: P.accent, width: '15px', height: '15px', flexShrink: 0 }}
          />
          {consentText}
        </label>

        {/* Honeypot */}
        <input type="text" name="website" value={website} onChange={e => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden style={{ position: 'absolute', left: '-9999px', height: 0, width: 0, opacity: 0 }} />

        {error && <div style={{ fontSize: '13px', color: '#C0392B' }}>{error}</div>}

        <button
          type="button"
          onClick={doSubmit}
          disabled={pending}
          style={{
            padding: '13px 20px', fontSize: '14px', fontWeight: 700, letterSpacing: '0.02em',
            background: P.accent, color: '#12212F', border: 'none', borderRadius: '10px',
            cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.7 : 1,
          }}
        >
          {pending ? '…' : 'Suscribirme'}
        </button>
      </div>
    </div>
  )
}
