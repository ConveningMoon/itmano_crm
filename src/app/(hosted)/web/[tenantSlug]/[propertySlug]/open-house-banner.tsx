'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, CalendarPlus, Check } from 'lucide-react'
import type { PublicOpenHouse } from '@/lib/data/open-houses'
import { countdown, countdownLabels } from '@/lib/open-houses/countdown'
import { formatOpenHouseDate, formatOpenHouseTime, googleCalendarUrl } from '@/lib/open-houses/format'

// Bloque de open house en la ficha pública (y en su iframe embebible):
// fecha y hora escritas en la zona del LUGAR, cuenta regresiva y formulario de
// asistencia. La cuenta regresiva arranca en el cliente: el primer render
// (servidor) muestra sólo la fecha, para no producir un desajuste de
// hidratación con la hora del navegador.

type Pal = { accent: string; ink: string; paper: string; paperAlt: string; textSoft: string; textFaint: string; line: string }

const FORM_COPY: Record<string, {
  firstName: string; lastName: string; email: string; guests: string; send: string; sending: string; error: string; notes: string; google: string; ics: string
}> = {
  es: { firstName: 'Nombre', lastName: 'Apellido', email: 'Email', guests: 'Acompañantes', send: 'Confirmar asistencia', sending: 'Enviando…', error: 'No pudimos registrar tu respuesta.', notes: 'Indicaciones', google: 'Google Calendar', ics: 'Apple / Outlook (.ics)' },
  en: { firstName: 'First name', lastName: 'Last name', email: 'Email', guests: 'Guests', send: 'RSVP', sending: 'Sending…', error: "We couldn't save your RSVP.", notes: 'Details', google: 'Google Calendar', ics: 'Apple / Outlook (.ics)' },
  pt: { firstName: 'Nome', lastName: 'Sobrenome', email: 'E-mail', guests: 'Acompanhantes', send: 'Confirmar presença', sending: 'Enviando…', error: 'Não foi possível registrar sua resposta.', notes: 'Informações', google: 'Google Calendar', ics: 'Apple / Outlook (.ics)' },
}

export function OpenHouseBanner({
  openHouse, lang, P, propertyTitle, location,
}: {
  openHouse:     PublicOpenHouse
  lang:          string
  P:             Pal
  propertyTitle: string
  location:      string
}) {
  const L  = countdownLabels(lang)
  const F  = FORM_COPY[lang] ?? FORM_COPY.en
  const language = FORM_COPY[lang] ? lang : 'en'

  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const tick = () => setNow(new Date())
    const first = setTimeout(tick, 0)
    const id = setInterval(tick, 1000)
    return () => { clearTimeout(first); clearInterval(id) }
  }, [])

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', guests: 0, website: '' })
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  const cancelled = openHouse.status === 'cancelled'
  const cd = now ? countdown(openHouse.startsAt, openHouse.endsAt, now) : null
  if (cd?.phase === 'ended') return null

  const date = formatOpenHouseDate(openHouse.startsAt, openHouse.timezone, language)
  const time = formatOpenHouseTime(openHouse.startsAt, openHouse.endsAt, openHouse.timezone, language)
  const gcal = googleCalendarUrl({
    title: `Open house — ${propertyTitle}`, location, description: openHouse.publicNotes ?? '',
    startsAt: openHouse.startsAt, endsAt: openHouse.endsAt,
  })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setState('sending')
    try {
      const res = await fetch(`/api/open-houses/${openHouse.id}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, language, response: 'yes' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) { setError(json.error ?? F.error); setState('idle'); return }
      setState('done')
    } catch {
      setError(F.error)
      setState('idle')
    }
  }

  const input: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '11px 13px', fontSize: '14px', borderRadius: '10px',
    border: `1px solid ${P.line}`, background: '#fff', color: P.ink, fontFamily: 'inherit', outline: 'none',
  }
  const unit = (value: number, label: string) => (
    <div style={{ minWidth: '64px', textAlign: 'center' }}>
      <div style={{ fontSize: 'clamp(26px, 4.5vw, 36px)', fontWeight: 800, letterSpacing: '-0.02em', color: P.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {String(value).padStart(2, '0')}
      </div>
      <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: P.textFaint, marginTop: '6px' }}>{label}</div>
    </div>
  )

  return (
    <section
      aria-label={L.title}
      style={{
        marginTop: '28px', padding: 'clamp(18px, 3vw, 26px)', borderRadius: '18px',
        background: cancelled ? P.paperAlt : '#fff', border: `1px solid ${cancelled ? P.line : `${P.accent}66`}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '18px', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: cancelled ? P.textFaint : P.accent }}>
            <CalendarDays size={14} /> {L.title}
          </div>
          <div style={{ fontSize: 'clamp(17px, 2.4vw, 21px)', fontWeight: 700, color: P.ink, marginTop: '8px', textDecoration: cancelled ? 'line-through' : undefined }}>{date}</div>
          <div style={{ fontSize: '14px', color: P.textSoft, marginTop: '3px' }}>{time}</div>
          {openHouse.publicNotes && !cancelled && (
            <div style={{ fontSize: '13px', color: P.textSoft, marginTop: '8px', maxWidth: '520px', lineHeight: 1.5 }}>{openHouse.publicNotes}</div>
          )}
          {cancelled && <div style={{ fontSize: '14px', fontWeight: 600, color: P.ink, marginTop: '10px' }}>{L.cancelled}</div>}
        </div>

        {!cancelled && (
          <div aria-live="polite" style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
            {cd?.phase === 'upcoming' && (
              <>
                {unit(cd.days, L.days)}{unit(cd.hours, L.hours)}{unit(cd.minutes, L.minutes)}{unit(cd.seconds, L.seconds)}
              </>
            )}
            {cd?.phase === 'live' && (
              <div style={{ fontSize: '14px', fontWeight: 700, color: P.accent, padding: '8px 0' }}>{L.live}</div>
            )}
          </div>
        )}
      </div>

      {!cancelled && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '18px', alignItems: 'center' }}>
          {openHouse.rsvpEnabled && state !== 'done' && !open && (
            <button
              onClick={() => setOpen(true)}
              style={{ padding: '11px 20px', fontSize: '14px', fontWeight: 700, borderRadius: '999px', border: 'none', background: P.accent, color: '#12212F', cursor: 'pointer' }}
            >
              {L.rsvp}
            </button>
          )}
          <a href={gcal} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: P.textSoft, textDecoration: 'none', padding: '9px 12px', borderRadius: '999px', border: `1px solid ${P.line}` }}>
            <CalendarPlus size={14} /> {F.google}
          </a>
          <a href={`/api/open-houses/${openHouse.id}/ics`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: P.textSoft, textDecoration: 'none', padding: '9px 12px', borderRadius: '999px', border: `1px solid ${P.line}` }}>
            <CalendarPlus size={14} /> {F.ics}
          </a>
        </div>
      )}

      {!cancelled && state === 'done' && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', fontSize: '14px', fontWeight: 600, color: P.ink }}>
          <Check size={16} color={P.accent} /> {L.rsvpDone}
        </div>
      )}

      {!cancelled && openHouse.rsvpEnabled && open && state !== 'done' && (
        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginTop: '18px' }}>
          <input required aria-label={F.firstName} placeholder={F.firstName} value={form.first_name} maxLength={100} onChange={e => setForm({ ...form, first_name: e.target.value })} style={input} />
          <input aria-label={F.lastName} placeholder={F.lastName} value={form.last_name} maxLength={100} onChange={e => setForm({ ...form, last_name: e.target.value })} style={input} />
          <input required type="email" aria-label={F.email} placeholder={F.email} value={form.email} maxLength={254} onChange={e => setForm({ ...form, email: e.target.value })} style={input} />
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: P.textSoft }}>
            {F.guests}
            <input type="number" min={0} max={10} value={form.guests} onChange={e => setForm({ ...form, guests: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} style={{ ...input, width: '80px' }} />
          </label>
          {/* Honeypot: oculto por CSS, no con type="hidden". */}
          <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })}
            style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0 }} />
          <button type="submit" disabled={state === 'sending'}
            style={{ padding: '11px 20px', fontSize: '14px', fontWeight: 700, borderRadius: '10px', border: 'none', background: P.accent, color: '#12212F', cursor: 'pointer', opacity: state === 'sending' ? 0.6 : 1 }}>
            {state === 'sending' ? F.sending : F.send}
          </button>
          {error && <div role="alert" style={{ gridColumn: '1 / -1', fontSize: '13px', color: '#B3261E' }}>{error}</div>}
        </form>
      )}
    </section>
  )
}
