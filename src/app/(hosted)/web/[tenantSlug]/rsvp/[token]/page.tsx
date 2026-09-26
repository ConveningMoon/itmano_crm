import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { verifyRsvpToken } from '@/lib/open-houses/rsvp-token'
import { formatOpenHouseDate, formatOpenHouseTime, googleCalendarUrl } from '@/lib/open-houses/format'
import { mapsUrl } from '@/lib/open-houses/email-template'
import { propertyEmailImages } from '@/lib/services/open-house-email'
import { appBaseUrl, openHouseIcsUrl, propertyPublicUrl } from '@/lib/open-houses/urls'
import { RsvpView, type RsvpViewModel } from './rsvp-view'

// Página del enlace de RSVP de un correo de open house. Es DINÁMICA (depende
// del token) y no registra nada al abrirse: los escáneres de enlaces visitan
// cada URL antes que la persona. La respuesta se envía con un botón.
//
// El servidor resuelve todo (textos en el idioma del lead, fecha en la zona
// del lugar, enlaces) y la vista sólo pinta y responde.

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Open house', robots: { index: false, follow: false } }

const OH_COLUMNS     = columns('open_houses', ['id', 'tenant_id', 'property_id', 'starts_at', 'ends_at', 'timezone', 'public_notes', 'status', 'rsvp_enabled', 'sender_agent_id'])
const PROP_COLUMNS   = columns('properties', ['name', 'address', 'city', 'state', 'slug', 'published_to_web', 'external_url', 'image_url', 'gallery'])
const TENANT_COLUMNS = columns('tenants', ['name', 'slug', 'logo_url', 'primary_color'])
const LEAD_COLUMNS   = columns('leads', ['first_name', 'language', 'agent_id'])
const RSVP_COLUMNS   = columns('open_house_rsvps', ['response', 'guests'])
const AGENT_COLUMNS  = columns('agents', ['name', 'email'])

interface RsvpOpenHouse {
  id: string; tenant_id: string; property_id: string; starts_at: string; ends_at: string
  timezone: string; public_notes: string | null; status: string; rsvp_enabled: boolean; sender_agent_id: string | null
}
interface RsvpTenant   { name: string; slug: string | null; logo_url: string | null; primary_color: string | null }
interface RsvpProperty {
  name: string | null; address: string; city: string | null; state: string | null; slug: string | null
  published_to_web: boolean; external_url: string | null; image_url: string | null; gallery: string[] | null
}
interface RsvpLead     { first_name: string | null; language: string | null; agent_id: string | null }
interface RsvpAnswer   { response: 'yes' | 'no'; guests: number }
interface RsvpAgent    { name: string | null; email: string | null }

const SUPPORTED = ['es', 'en', 'pt']

async function loadRsvpPage(tenantSlug: string, token: string): Promise<RsvpViewModel | null> {
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

  // Quien firma: el remitente elegido para el open house o el agente del lead.
  const agentId = oh.sender_agent_id ?? l.agent_id
  const { data: agentRow } = agentId
    ? await db.from('agents').select(AGENT_COLUMNS).eq('id', agentId).eq('tenant_id', oh.tenant_id).maybeSingle()
    : { data: null }
  const agent = agentRow as unknown as RsvpAgent | null

  const lang = l.language && SUPPORTED.includes(l.language) ? l.language : 'en'
  const cancelled = oh.status === 'cancelled'
  const ended = new Date(oh.ends_at).getTime() <= Date.now()
  const title = p.name ?? p.address
  const address = [p.address, p.city, p.state].filter(Boolean).join(', ')

  return {
    token,
    lang,
    state: cancelled ? 'cancelled' : ended ? 'ended' : !oh.rsvp_enabled ? 'closed' : 'open',
    firstName: l.first_name ?? '',
    current: (rsvp as unknown as RsvpAnswer | null) ?? null,
    brand: { name: t.name, logoUrl: t.logo_url, accent: t.primary_color || '#C9A96E' },
    property: {
      title,
      address,
      images: propertyEmailImages(p.image_url, p.gallery),
      url: propertyPublicUrl(t.slug ?? '', p) || null,
    },
    event: {
      date:  formatOpenHouseDate(oh.starts_at, oh.timezone, lang),
      time:  formatOpenHouseTime(oh.starts_at, oh.ends_at, oh.timezone, lang),
      notes: oh.public_notes,
    },
    links: {
      google: googleCalendarUrl({
        title: `Open house — ${title}`, location: address,
        description: [t.name, oh.public_notes].filter(Boolean).join('\n'),
        startsAt: oh.starts_at, endsAt: oh.ends_at,
      }),
      ics:  openHouseIcsUrl(appBaseUrl(), oh.id),
      maps: mapsUrl(address),
    },
    agent: agent?.name ? { name: agent.name, email: agent.email } : null,
  }
}

export default async function RsvpPage({ params }: { params: Promise<{ tenantSlug: string; token: string }> }) {
  const { tenantSlug, token } = await params
  const model = await loadRsvpPage(tenantSlug, token)
  if (!model) notFound()
  return <RsvpView model={model} />
}
