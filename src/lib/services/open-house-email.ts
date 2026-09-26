import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { columns } from '@/lib/supabase/columns'
import type { EmailContent } from '@/lib/email-content'
import type { EmailLocale } from '@/lib/services/email-render'
import { buildOpenHouseMergeVars, formatOpenHouseDate, formatOpenHouseTime, googleCalendarUrl } from '@/lib/open-houses/format'
import { mapsUrl, renderOpenHouseEmail } from '@/lib/open-houses/email-template'
import { appBaseUrl, openHouseIcsUrl, openHouseRsvpUrl, propertyPublicUrl } from '@/lib/open-houses/urls'
import type { OpenHouseEmailKind } from '@/lib/open-houses/model'

// Contexto compartido de un correo de open house: todo lo que es igual para
// todos los destinatarios (la casa, sus fotos, la marca, el remitente elegido,
// los enlaces). Lo arman una vez el despachador y la vista previa, y cada
// correo se renderiza a partir de él — así la vista previa ES el correo.

/* eslint-disable @typescript-eslint/no-explicit-any */

const OH_COLUMNS = columns('open_houses', [
  'id', 'tenant_id', 'property_id', 'starts_at', 'ends_at', 'timezone', 'public_notes', 'sender_agent_id',
])
const PROPERTY_COLUMNS = columns('properties', [
  'name', 'address', 'city', 'state', 'slug', 'published_to_web', 'external_url', 'image_url', 'gallery',
])
const TENANT_COLUMNS = columns('tenants', ['name', 'slug', 'logo_url', 'primary_color'])
const AGENT_COLUMNS  = columns('agents', ['id', 'name', 'email', 'email_signature'])

export interface EmailAgent {
  name:      string
  email:     string
  signature: string | null
}

export interface OpenHouseEmailContext {
  openHouse: { id: string; startsAt: string; endsAt: string; timezone: string; publicNotes: string | null }
  property:  { title: string; address: string; images: string[]; publicUrl: string }
  brand:     { name: string; slug: string; logoUrl: string | null; accent: string | null }
  /** Remitente elegido para todo el open house; null = el agente de cada lead. */
  senderAgent: EmailAgent | null
  baseUrl:   string
}

/** Portada y las dos primeras fotos de la galería, sin repetidas. */
export function propertyEmailImages(imageUrl: string | null, gallery: string[] | null): string[] {
  return [imageUrl, ...(gallery ?? [])]
    .filter((u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u))
    .filter((u, i, all) => all.indexOf(u) === i)
    .slice(0, 3)
}

export async function loadOpenHouseEmailContext(
  db: SupabaseClient,
  openHouseId: string,
  tenantId: string | null,
): Promise<OpenHouseEmailContext | null> {
  let q = db.from('open_houses').select(OH_COLUMNS).eq('id', openHouseId)
  if (tenantId) q = q.eq('tenant_id', tenantId)
  const { data: ohRow } = await q.maybeSingle()
  const oh = ohRow as any
  if (!oh) return null

  const [{ data: property }, { data: tenant }, { data: agent }] = await Promise.all([
    db.from('properties').select(PROPERTY_COLUMNS).eq('id', oh.property_id).eq('tenant_id', oh.tenant_id).maybeSingle(),
    db.from('tenants').select(TENANT_COLUMNS).eq('id', oh.tenant_id).maybeSingle(),
    oh.sender_agent_id
      ? db.from('agents').select(AGENT_COLUMNS).eq('id', oh.sender_agent_id).eq('tenant_id', oh.tenant_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  if (!property || !tenant) return null
  const p = property as any
  const t = tenant as any
  const a = agent as any

  return {
    openHouse: {
      id: oh.id, startsAt: oh.starts_at, endsAt: oh.ends_at, timezone: oh.timezone, publicNotes: oh.public_notes ?? null,
    },
    property: {
      title:     (p.name as string | null) ?? (p.address as string),
      address:   [p.address, p.city, p.state].filter(Boolean).join(', '),
      images:    propertyEmailImages(p.image_url ?? null, p.gallery ?? null),
      publicUrl: propertyPublicUrl((t.slug as string | null) ?? '', p),
    },
    brand: {
      name:    t.name as string,
      slug:    (t.slug as string | null) ?? '',
      logoUrl: (t.logo_url as string | null) ?? null,
      accent:  (t.primary_color as string | null) ?? null,
    },
    senderAgent: a
      ? { name: (a.name as string) ?? '', email: (a.email as string | null) ?? '', signature: (a.email_signature as string | null) ?? null }
      : null,
    baseUrl: appBaseUrl(),
  }
}

/**
 * `"Nombre" <correo@dominio>` con el correo verificado del equipo y el nombre
 * de quien firma. El nombre se limpia de comillas y ángulos: viene de la base,
 * pero un `<` en un nombre rompería la cabecera.
 */
export function fromWithName(name: string, identityFrom: string): string {
  const m = /<([^>]+)>/.exec(identityFrom)
  const address = (m ? m[1] : identityFrom).trim()
  const clean = name.replace(/["<>\r\n]/g, '').trim()
  return clean ? `"${clean}" <${address}>` : identityFrom
}

export function renderOpenHouseEmailForLead(
  ctx: OpenHouseEmailContext,
  args: {
    kind:           OpenHouseEmailKind
    language:       string
    subject:        string
    content:        EmailContent
    lead:           { firstName: string }
    agent:          EmailAgent
    unsubscribeUrl: string
    /** Token firmado del lead; null en la vista previa. */
    rsvpToken:      string | null
    rsvpEnabled:    boolean
  },
): { subject: string; html: string; vars: Record<string, string> } {
  const { openHouse: oh, property, brand } = ctx
  const rsvpUrl = openHouseRsvpUrl(ctx.baseUrl, brand.slug, args.rsvpToken ?? 'vista-previa')
  const calendarUrl = openHouseIcsUrl(ctx.baseUrl, oh.id)
  const vars = buildOpenHouseMergeVars({
    customerName:    args.lead.firstName,
    agentName:       args.agent.name,
    agentEmail:      args.agent.email,
    propertyName:    property.title,
    propertyAddress: property.address,
    startsAt:        oh.startsAt,
    endsAt:          oh.endsAt,
    timeZone:        oh.timezone,
    language:        args.language,
    publicNotes:     oh.publicNotes,
    propertyUrl:     property.publicUrl,
    rsvpUrl,
    calendarUrl,
  })
  const rendered = renderOpenHouseEmail({
    kind:           args.kind,
    locale:         args.language as EmailLocale,
    subject:        args.subject,
    content:        args.content,
    vars,
    signature:      args.agent.signature,
    unsubscribeUrl: args.unsubscribeUrl,
    brand:          { name: brand.name, logoUrl: brand.logoUrl, accent: brand.accent },
    property:       { title: property.title, address: property.address, images: property.images },
    event: {
      date:  formatOpenHouseDate(oh.startsAt, oh.timezone, args.language),
      time:  formatOpenHouseTime(oh.startsAt, oh.endsAt, oh.timezone, args.language),
      notes: oh.publicNotes,
    },
    links: {
      rsvp:           args.rsvpEnabled ? rsvpUrl : null,
      calendar:       calendarUrl,
      googleCalendar: googleCalendarUrl({
        title: `Open house — ${property.title}`, location: property.address,
        description: [brand.name, oh.publicNotes].filter(Boolean).join('\n'),
        startsAt: oh.startsAt, endsAt: oh.endsAt,
      }),
      property:       property.publicUrl || null,
      maps:           mapsUrl(property.address),
    },
  })
  return { ...rendered, vars }
}
