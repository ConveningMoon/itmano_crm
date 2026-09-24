import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { verifyRsvpToken } from '@/lib/open-houses/rsvp-token'
import { formatOpenHouseDate, formatOpenHouseTime } from '@/lib/open-houses/format'
import { RsvpResponder } from './rsvp-responder'

// Página del enlace de RSVP de un correo de open house. Es DINÁMICA (depende
// del token) y no registra nada al abrirse: los escáneres de enlaces visitan
// cada URL antes que la persona. La respuesta se envía con un botón.

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Open house', robots: { index: false, follow: false } }

const OH_COLUMNS   = columns('open_houses', ['id', 'tenant_id', 'property_id', 'starts_at', 'ends_at', 'timezone', 'public_notes', 'status', 'rsvp_enabled'])
const PROP_COLUMNS = columns('properties', ['name', 'address', 'city', 'state'])
const TENANT_COLUMNS = columns('tenants', ['name', 'slug', 'logo_url', 'primary_color'])
const LEAD_COLUMNS = columns('leads', ['first_name', 'language'])
const RSVP_COLUMNS = columns('open_house_rsvps', ['response', 'guests'])

const COPY: Record<string, {
  hello: string; question: string; yes: string; no: string; guests: string
  cancelled: string; ended: string; closed: string; current: (r: 'yes' | 'no') => string
}> = {
  es: {
    hello: 'Hola', question: '¿Vienes al open house?', yes: 'Sí, asistiré', no: 'No podré ir', guests: 'Acompañantes',
    cancelled: 'Este open house fue cancelado.', ended: 'Este open house ya terminó.', closed: 'Este open house no recibe confirmaciones.',
    current: r => (r === 'yes' ? 'Tienes confirmada tu asistencia. Puedes cambiarla abajo.' : 'Nos dijiste que no podrás ir. Si cambias de idea, avísanos abajo.'),
  },
  en: {
    hello: 'Hi', question: 'Are you coming to the open house?', yes: "Yes, I'll be there", no: "I can't make it", guests: 'Guests',
    cancelled: 'This open house was cancelled.', ended: 'This open house has ended.', closed: 'This open house is not taking RSVPs.',
    current: r => (r === 'yes' ? "You're confirmed. You can change your answer below." : "You told us you can't make it. If that changes, let us know below."),
  },
  pt: {
    hello: 'Olá', question: 'Você vem ao open house?', yes: 'Sim, estarei lá', no: 'Não poderei ir', guests: 'Acompanhantes',
    cancelled: 'Este open house foi cancelado.', ended: 'Este open house já terminou.', closed: 'Este open house não recebe confirmações.',
    current: r => (r === 'yes' ? 'Sua presença está confirmada. Você pode mudar abaixo.' : 'Você disse que não poderá ir. Se mudar de ideia, avise abaixo.'),
  },
}

interface RsvpOpenHouse {
  id: string; tenant_id: string; property_id: string; starts_at: string; ends_at: string
  timezone: string; public_notes: string | null; status: string; rsvp_enabled: boolean
}
interface RsvpTenant   { name: string; slug: string | null; logo_url: string | null; primary_color: string | null }
interface RsvpProperty { name: string | null; address: string; city: string | null; state: string | null }
interface RsvpLead     { first_name: string | null; language: string | null }
interface RsvpAnswer   { response: 'yes' | 'no'; guests: number }

interface Loaded {
  oh: RsvpOpenHouse; t: RsvpTenant; p: RsvpProperty; l: RsvpLead; r: RsvpAnswer | null
  lang: string; accent: string; blocked: string | null
}

async function loadRsvpPage(tenantSlug: string, token: string): Promise<Loaded | null> {
  const ids = verifyRsvpToken(token)
  if (!ids) return null

  const db = createAdminClient()
  const { data: ohRow } = await db.from('open_houses').select(OH_COLUMNS).eq('id', ids.openHouseId).maybeSingle()
  const oh = ohRow as unknown as RsvpOpenHouse | null
  if (!oh || oh.status === 'draft') return null

  const [{ data: tenant }, { data: property }, { data: lead }, { data: rsvp }] = await Promise.all([
    db.from('tenants').select(TENANT_COLUMNS).eq('id', oh.tenant_id).maybeSingle(),
    db.from('properties').select(PROP_COLUMNS).eq('id', oh.property_id).eq('tenant_id', oh.tenant_id).maybeSingle(),
    db.from('leads').select(LEAD_COLUMNS).eq('id', ids.leadId).eq('tenant_id', oh.tenant_id).maybeSingle(),
    db.from('open_house_rsvps').select(RSVP_COLUMNS).eq('open_house_id', oh.id).eq('lead_id', ids.leadId).maybeSingle(),
  ])
  const t = tenant as unknown as RsvpTenant | null
  const p = property as unknown as RsvpProperty | null
  const l = lead as unknown as RsvpLead | null
  // El enlace es de ESTE tenant: un token válido bajo otro slug no se muestra.
  if (!t || t.slug !== tenantSlug || !p || !l) return null

  const lang = l.language && COPY[l.language] ? l.language : 'en'
  const C = COPY[lang]
  const ended = new Date(oh.ends_at).getTime() <= Date.now()
  const blocked = oh.status === 'cancelled' ? C.cancelled : ended ? C.ended : !oh.rsvp_enabled ? C.closed : null
  return { oh, t, p, l, r: rsvp as unknown as RsvpAnswer | null, lang, accent: t.primary_color || '#C9A96E', blocked }
}

export default async function RsvpPage({ params }: { params: Promise<{ tenantSlug: string; token: string }> }) {
  const { tenantSlug, token } = await params
  const data = await loadRsvpPage(tenantSlug, token)
  if (!data) notFound()
  const { oh, t, p, l, r, lang, accent, blocked } = data
  const C = COPY[lang]

  return (
    <main style={{ minHeight: '100vh', background: '#FBFAF8', color: '#12212F', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: '480px', background: '#fff', border: '1px solid rgba(18,33,47,0.10)', borderRadius: '18px', padding: 'clamp(20px, 5vw, 32px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '22px' }}>
          {t.logo_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={t.logo_url} alt={t.name} style={{ height: '32px', width: 'auto' }} />
            : <span style={{ fontSize: '15px', fontWeight: 700 }}>{t.name}</span>}
        </div>
        <div style={{ fontSize: '14px', color: 'rgba(18,33,47,0.68)' }}>{C.hello} {l.first_name},</div>
        <h1 style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.01em', margin: '6px 0 14px' }}>{C.question}</h1>
        <div style={{ fontSize: '15px', fontWeight: 700 }}>{p.name ?? p.address}</div>
        <div style={{ fontSize: '13px', color: 'rgba(18,33,47,0.68)', marginTop: '2px' }}>{[p.address, p.city, p.state].filter(Boolean).join(', ')}</div>
        <div style={{ fontSize: '14px', marginTop: '12px', textDecoration: oh.status === 'cancelled' ? 'line-through' : undefined }}>
          {formatOpenHouseDate(oh.starts_at, oh.timezone, lang)}
          <br />
          <span style={{ color: 'rgba(18,33,47,0.68)' }}>{formatOpenHouseTime(oh.starts_at, oh.ends_at, oh.timezone, lang)}</span>
        </div>
        {oh.public_notes && oh.status !== 'cancelled' && (
          <div style={{ fontSize: '13px', color: 'rgba(18,33,47,0.68)', marginTop: '10px', lineHeight: 1.5 }}>{oh.public_notes}</div>
        )}

        {blocked ? (
          <div style={{ marginTop: '22px', fontSize: '14px', fontWeight: 600 }}>{blocked}</div>
        ) : (
          <RsvpResponder
            token={token}
            accent={accent}
            labels={{ yes: C.yes, no: C.no, guests: C.guests, current: r ? C.current(r.response) : null }}
            lang={lang}
            initialGuests={r?.guests ?? 0}
          />
        )}
      </div>
    </main>
  )
}
