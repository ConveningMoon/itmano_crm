'use client'

import { useState, useTransition } from 'react'
import { CalendarDays, CalendarPlus, Check, Clock, ExternalLink, Info, MapPin, Minus, Plus, XCircle } from 'lucide-react'
import { respondToOpenHouse } from './actions'

// Vista de la página de RSVP de un open house. Recibe todo resuelto del
// servidor (textos, fecha en la zona del lugar, enlaces): aquí sólo se pinta y
// se responde. La marca es la del tenant — color, logo y nombre—, no la de ITMANO.

export interface RsvpViewModel {
  token:     string
  lang:      string
  state:     'open' | 'cancelled' | 'ended' | 'closed'
  firstName: string
  current:   { response: 'yes' | 'no'; guests: number } | null
  brand:     { name: string; logoUrl: string | null; accent: string }
  property:  { title: string; address: string; images: string[]; url: string | null }
  event:     { date: string; time: string; notes: string | null }
  links:     { google: string; ics: string; maps: string }
  agent:     { name: string; email: string | null } | null
}

const COPY: Record<string, {
  eyebrow: string; hello: (n: string) => string; question: string; lead: string
  guests: string; guestsHint: string; yes: string; no: string; sending: string
  doneYes: (n: string) => string; doneYesSub: string; doneNo: string; doneNoSub: string
  addToCalendar: string; google: string; ics: string; directions: string; seeProperty: string
  change: string; currentYes: (g: number) => string; currentNo: string
  cancelled: string; ended: string; closed: string; questions: (a: string) => string
  less: string; more: string
}> = {
  es: {
    eyebrow: 'Open house', hello: n => (n ? `Hola ${n},` : 'Hola,'), question: '¿Te esperamos en el open house?',
    lead: 'Confírmanos si vienes para tenerlo todo listo cuando llegues.',
    guests: 'Acompañantes', guestsHint: 'Personas que vienen contigo', yes: 'Sí, asistiré', no: 'No podré ir', sending: 'Enviando…',
    doneYes: n => (n ? `¡Listo, ${n}! Te esperamos.` : '¡Listo! Te esperamos.'), doneYesSub: 'Agrégalo a tu calendario para no olvidarlo.',
    doneNo: 'Gracias por avisarnos.', doneNoSub: 'Si cambias de idea, puedes volver a este enlace cuando quieras.',
    addToCalendar: 'Agregar al calendario', google: 'Google Calendar', ics: 'Apple / Outlook', directions: 'Cómo llegar',
    seeProperty: 'Ver la propiedad', change: 'Cambiar mi respuesta',
    currentYes: g => (g ? `Tienes confirmada tu asistencia (+${g}).` : 'Tienes confirmada tu asistencia.'),
    currentNo: 'Nos dijiste que no podrás ir.',
    cancelled: 'Este open house fue cancelado.', ended: 'Este open house ya terminó.', closed: 'Este open house no recibe confirmaciones.',
    questions: a => `¿Dudas? Escríbele a ${a}`, less: 'Quitar un acompañante', more: 'Agregar un acompañante',
  },
  en: {
    eyebrow: 'Open house', hello: n => (n ? `Hi ${n},` : 'Hi,'), question: 'Will we see you at the open house?',
    lead: "Let us know if you're coming so everything is ready when you arrive.",
    guests: 'Guests', guestsHint: 'People coming with you', yes: "Yes, I'll be there", no: "I can't make it", sending: 'Sending…',
    doneYes: n => (n ? `You're all set, ${n}!` : "You're all set!"), doneYesSub: 'Add it to your calendar so you don’t forget.',
    doneNo: 'Thanks for letting us know.', doneNoSub: 'If your plans change, you can come back to this link anytime.',
    addToCalendar: 'Add to calendar', google: 'Google Calendar', ics: 'Apple / Outlook', directions: 'Get directions',
    seeProperty: 'See the property', change: 'Change my answer',
    currentYes: g => (g ? `You're confirmed (+${g}).` : "You're confirmed."),
    currentNo: "You told us you can't make it.",
    cancelled: 'This open house was cancelled.', ended: 'This open house has ended.', closed: 'This open house is not taking RSVPs.',
    questions: a => `Questions? Email ${a}`, less: 'Remove a guest', more: 'Add a guest',
  },
  pt: {
    eyebrow: 'Open house', hello: n => (n ? `Olá ${n},` : 'Olá,'), question: 'Podemos te esperar no open house?',
    lead: 'Confirme se vem para deixarmos tudo pronto quando você chegar.',
    guests: 'Acompanhantes', guestsHint: 'Pessoas que vêm com você', yes: 'Sim, estarei lá', no: 'Não poderei ir', sending: 'Enviando…',
    doneYes: n => (n ? `Pronto, ${n}! Te esperamos.` : 'Pronto! Te esperamos.'), doneYesSub: 'Adicione à sua agenda para não esquecer.',
    doneNo: 'Obrigado por avisar.', doneNoSub: 'Se mudar de ideia, volte a este link quando quiser.',
    addToCalendar: 'Adicionar à agenda', google: 'Google Calendar', ics: 'Apple / Outlook', directions: 'Como chegar',
    seeProperty: 'Ver o imóvel', change: 'Mudar minha resposta',
    currentYes: g => (g ? `Sua presença está confirmada (+${g}).` : 'Sua presença está confirmada.'),
    currentNo: 'Você disse que não poderá ir.',
    cancelled: 'Este open house foi cancelado.', ended: 'Este open house já terminou.', closed: 'Este open house não recebe confirmações.',
    questions: a => `Dúvidas? Escreva para ${a}`, less: 'Remover acompanhante', more: 'Adicionar acompanhante',
  },
}

const INK = '#16202B'
const SOFT = '#5B6570'
const LINE = '#E7E3DC'
const PAPER = '#F4F1EC'

/** Texto oscuro o claro, el que se lea mejor sobre el color de la marca. */
function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#FFFFFF'
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? INK : '#FFFFFF'
}

export function RsvpView({ model }: { model: RsvpViewModel }) {
  const C = COPY[model.lang] ?? COPY.en
  const accent = /^#[0-9a-f]{6}$/i.test(model.brand.accent) ? model.brand.accent : '#C9A96E'
  const onAccent = textOn(accent)

  const [guests, setGuests] = useState(model.current?.guests ?? 0)
  const [done, setDone] = useState<'yes' | 'no' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [hero, ...thumbs] = model.property.images

  function answer(response: 'yes' | 'no') {
    setError(null)
    start(async () => {
      const res = await respondToOpenHouse({ token: model.token, response, guests: response === 'yes' ? guests : 0 })
      if (!res.ok) { setError(res.error); return }
      setDone(response)
    })
  }

  const pill: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
    padding: '12px 18px', borderRadius: '999px', fontSize: '14px', fontWeight: 600,
    textDecoration: 'none', border: `1px solid ${LINE}`, color: INK, background: '#FFFFFF',
  }

  const calendarButtons = (
    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
      <a className="rsvp-btn" href={model.links.google} target="_blank" rel="noopener noreferrer" style={pill}><CalendarPlus size={16} /> {C.google}</a>
      <a className="rsvp-btn" href={model.links.ics} style={pill}><CalendarPlus size={16} /> {C.ics}</a>
      <a className="rsvp-btn" href={model.links.maps} target="_blank" rel="noopener noreferrer" style={pill}><MapPin size={16} /> {C.directions}</a>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: PAPER, color: INK, fontFamily: 'inherit' }}>
      <style>{`
        .rsvp-btn { transition: transform .15s ease, box-shadow .15s ease, background-color .15s ease; }
        .rsvp-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(22,32,43,0.10); }
        .rsvp-btn:focus-visible { outline: 3px solid ${accent}; outline-offset: 2px; }
        .rsvp-btn:disabled { opacity: .6; cursor: default; transform: none; box-shadow: none; }
        .rsvp-fade { animation: rsvp-fade .35s ease both; }
        @keyframes rsvp-fade { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
        @media (prefers-reduced-motion: reduce) { .rsvp-btn, .rsvp-fade { transition: none; animation: none; } }
      `}</style>

      {/* Portada: la casa es la protagonista */}
      <header style={{ position: 'relative', height: hero ? 'clamp(260px, 46vh, 420px)' : '200px', background: hero ? '#222' : accent, overflow: 'hidden' }}>
        {hero && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={hero} alt={model.property.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.55) 100%)' }} />
        <div style={{ position: 'absolute', top: 16, left: 16, right: 16, display: 'flex', justifyContent: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '8px 16px', borderRadius: '999px', background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(6px)' }}>
            {model.brand.logoUrl
              /* eslint-disable-next-line @next/next/no-img-element */
              ? <img src={model.brand.logoUrl} alt={model.brand.name} style={{ height: '26px', width: 'auto', display: 'block' }} />
              : <span style={{ fontSize: '14px', fontWeight: 700 }}>{model.brand.name}</span>}
          </span>
        </div>
      </header>

      <main style={{ maxWidth: '560px', margin: '-72px auto 0', padding: '0 16px 48px', position: 'relative' }}>
        <div className="rsvp-fade" style={{ background: '#FFFFFF', borderRadius: '24px', boxShadow: '0 18px 50px rgba(22,32,43,0.14)', overflow: 'hidden' }}>
          <div style={{ padding: 'clamp(22px, 5vw, 32px)' }}>
            <span style={{
              display: 'inline-block', fontSize: '11px', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: model.state === 'cancelled' ? SOFT : accent,
            }}>{C.eyebrow}</span>
            <h1 style={{ fontSize: 'clamp(22px, 5vw, 28px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15, margin: '8px 0 4px' }}>
              {model.property.title}
            </h1>
            <p style={{ margin: 0, fontSize: '14px', color: SOFT }}>{model.property.address}</p>

            {/* Cuándo y dónde */}
            <div style={{ marginTop: '22px', display: 'grid', gap: '12px', padding: '18px', borderRadius: '16px', background: PAPER }}>
              <Row icon={<CalendarDays size={18} color={accent} />} strong strike={model.state === 'cancelled'}>{model.event.date}</Row>
              <Row icon={<Clock size={18} color={accent} />}>{model.event.time}</Row>
              <Row icon={<MapPin size={18} color={accent} />}>
                <a href={model.links.maps} target="_blank" rel="noopener noreferrer" style={{ color: INK, textDecoration: 'underline', textDecorationColor: LINE, textUnderlineOffset: '3px' }}>
                  {model.property.address}
                </a>
              </Row>
              {model.event.notes && model.state !== 'cancelled' && (
                <Row icon={<Info size={18} color={accent} />} soft>{model.event.notes}</Row>
              )}
            </div>

            {thumbs.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${thumbs.length}, 1fr)`, gap: '8px', marginTop: '12px' }}>
                {thumbs.map(src => (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img key={src} src={src} alt="" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: '12px', display: 'block' }} />
                ))}
              </div>
            )}

            <div aria-live="polite" style={{ marginTop: '26px' }}>
              {model.state !== 'open' ? (
                <div className="rsvp-fade" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '16px', fontWeight: 700 }}>
                    <XCircle size={20} color={SOFT} />
                    {model.state === 'cancelled' ? C.cancelled : model.state === 'ended' ? C.ended : C.closed}
                  </div>
                  {model.property.url && (
                    <a className="rsvp-btn" href={model.property.url} target="_blank" rel="noopener noreferrer" style={{ ...pill, alignSelf: 'flex-start' }}>
                      <ExternalLink size={16} /> {C.seeProperty}
                    </a>
                  )}
                </div>
              ) : done === 'yes' ? (
                <div className="rsvp-fade" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ width: 44, height: 44, borderRadius: '50%', background: accent, color: onAccent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Check size={24} />
                    </span>
                    <div>
                      <div style={{ fontSize: '18px', fontWeight: 800 }}>{C.doneYes(model.firstName)}</div>
                      <div style={{ fontSize: '14px', color: SOFT, marginTop: '2px' }}>{C.doneYesSub}</div>
                    </div>
                  </div>
                  {calendarButtons}
                  <button onClick={() => setDone(null)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: SOFT, fontSize: '13px', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
                    {C.change}
                  </button>
                </div>
              ) : done === 'no' ? (
                <div className="rsvp-fade" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '18px', fontWeight: 800 }}>{C.doneNo}</div>
                  <div style={{ fontSize: '14px', color: SOFT }}>{C.doneNoSub}</div>
                  <button onClick={() => setDone(null)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: SOFT, fontSize: '13px', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
                    {C.change}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  <div>
                    <div style={{ fontSize: '15px', color: SOFT }}>{C.hello(model.firstName)}</div>
                    <h2 style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.01em', margin: '4px 0 6px' }}>{C.question}</h2>
                    <p style={{ margin: 0, fontSize: '14px', color: SOFT, lineHeight: 1.5 }}>{C.lead}</p>
                  </div>

                  {model.current && (
                    <div style={{ fontSize: '13px', fontWeight: 600, padding: '10px 14px', borderRadius: '12px', background: model.current.response === 'yes' ? `${accent}1F` : PAPER, color: INK }}>
                      {model.current.response === 'yes' ? C.currentYes(model.current.guests) : C.currentNo}
                    </div>
                  )}

                  {/* Acompañantes */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 14px', border: `1px solid ${LINE}`, borderRadius: '14px' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600 }}>{C.guests}</div>
                      <div style={{ fontSize: '12px', color: SOFT }}>{C.guestsHint}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button className="rsvp-btn" type="button" aria-label={C.less} disabled={guests === 0 || pending}
                        onClick={() => setGuests(g => Math.max(0, g - 1))}
                        style={{ width: 40, height: 40, borderRadius: '50%', border: `1px solid ${LINE}`, background: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: INK }}>
                        <Minus size={16} />
                      </button>
                      <span aria-live="polite" style={{ minWidth: '20px', textAlign: 'center', fontSize: '17px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{guests}</span>
                      <button className="rsvp-btn" type="button" aria-label={C.more} disabled={guests === 10 || pending}
                        onClick={() => setGuests(g => Math.min(10, g + 1))}
                        style={{ width: 40, height: 40, borderRadius: '50%', border: `1px solid ${LINE}`, background: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: INK }}>
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: '10px' }}>
                    <button className="rsvp-btn" onClick={() => answer('yes')} disabled={pending}
                      style={{ padding: '16px', borderRadius: '14px', border: 'none', background: accent, color: onAccent, fontSize: '16px', fontWeight: 700, cursor: 'pointer' }}>
                      {pending ? C.sending : C.yes}
                    </button>
                    <button className="rsvp-btn" onClick={() => answer('no')} disabled={pending}
                      style={{ padding: '14px', borderRadius: '14px', border: `1px solid ${LINE}`, background: '#FFFFFF', color: INK, fontSize: '15px', fontWeight: 600, cursor: 'pointer' }}>
                      {C.no}
                    </button>
                  </div>
                  {error && <div role="alert" style={{ fontSize: '13px', color: '#B3261E' }}>{error}</div>}
                </div>
              )}
            </div>
          </div>
        </div>

        <footer style={{ textAlign: 'center', marginTop: '22px', fontSize: '13px', color: SOFT, lineHeight: 1.7 }}>
          {model.agent && (
            <div>
              {model.agent.email
                ? <a href={`mailto:${model.agent.email}`} style={{ color: INK, fontWeight: 600, textDecoration: 'none' }}>{C.questions(model.agent.name)}</a>
                : C.questions(model.agent.name)}
            </div>
          )}
          <div>{model.brand.name}</div>
        </footer>
      </main>
    </div>
  )
}

function Row({ icon, children, strong, soft, strike }: {
  icon: React.ReactNode; children: React.ReactNode; strong?: boolean; soft?: boolean; strike?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
      <span style={{ flexShrink: 0, marginTop: '1px' }}>{icon}</span>
      <span style={{
        fontSize: strong ? '16px' : '14px', fontWeight: strong ? 700 : 500, lineHeight: 1.45,
        color: soft ? SOFT : INK, textDecoration: strike ? 'line-through' : undefined,
      }}>{children}</span>
    </div>
  )
}
