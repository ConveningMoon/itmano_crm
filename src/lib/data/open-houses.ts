import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { displayState, type OpenHouseDisplayState, type OpenHouseEmailKind, type OpenHouseEmailStatus, type OpenHouseStatus, type AudienceMatch } from '@/lib/open-houses/model'

// Lecturas de open houses para el CRM y para la página pública. Corren con el
// admin client y filtran SIEMPRE por tenant en código (RLS es la segunda capa).

/* eslint-disable @typescript-eslint/no-explicit-any */

const OPEN_HOUSE_COLUMNS = columns('open_houses', [
  'id', 'tenant_id', 'property_id', 'starts_at', 'ends_at', 'timezone', 'public_notes',
  'languages', 'audience_tag_ids', 'audience_match', 'rsvp_enabled', 'status', 'revision',
  'created_by_user_id', 'created_by_agent_id', 'confirmed_at', 'cancelled_at', 'cancel_reason',
  'created_at',
])

const EMAIL_COLUMNS = columns('open_house_emails', [
  'id', 'open_house_id', 'kind', 'scheduled_at', 'status', 'revision', 'sent_count',
  'skipped_count', 'failed_count', 'last_error', 'finished_at', 'recipients_frozen_at', 'created_at',
])

const CONTENT_COLUMNS = columns('open_house_email_contents', [
  'email_id', 'language', 'subject', 'body_json', 'resend_template_id',
])

const RSVP_COLUMNS = columns('open_house_rsvps', [
  'id', 'lead_id', 'response', 'guests', 'source', 'attended', 'created_at', 'updated_at',
])

const RSVP_LEAD_COLUMNS = columns('leads', ['first_name', 'last_name', 'email'])

const PROPERTY_COLUMNS = columns('properties', [
  'id', 'name', 'address', 'city', 'state', 'slug', 'published_to_web', 'status',
  'external_url', 'created_by_agent_id', 'content_languages',
])

const TAG_COLUMNS = columns('lead_tags', ['id', 'name', 'slug', 'color'])

const KIND_ORDER: Record<OpenHouseEmailKind, number> = { announcement: 0, reminder: 1, update: 2, cancellation: 3 }

export interface OpenHouseRow {
  id:              string
  tenantId:        string
  propertyId:      string
  startsAt:        string
  endsAt:          string
  timezone:        string
  publicNotes:     string | null
  languages:       string[]
  audienceTagIds:  string[]
  audienceMatch:   AudienceMatch
  rsvpEnabled:     boolean
  status:          OpenHouseStatus
  displayState:    OpenHouseDisplayState
  /** Ya empezó (calculado en el servidor al leer; los componentes no leen el reloj). */
  hasStarted:      boolean
  revision:        number
  createdByUserId: string | null
  createdByAgentId: string | null
  confirmedAt:     string | null
  cancelledAt:     string | null
  cancelReason:    string | null
  createdAt:       string
}

export interface OpenHouseEmailContent {
  language:         string
  subject:          string | null
  bodyJson:         unknown
  resendTemplateId: string | null
}

export interface OpenHouseEmail {
  id:                 string
  kind:               OpenHouseEmailKind
  scheduledAt:        string
  status:             OpenHouseEmailStatus
  revision:           number
  sentCount:          number
  skippedCount:       number
  failedCount:        number
  lastError:          string | null
  finishedAt:         string | null
  recipientsFrozenAt: string | null
  createdAt:          string
  /** Su hora ya llegó (para un anuncio en borrador: "sale al confirmar"). */
  due:                boolean
  contents:           OpenHouseEmailContent[]
}

export interface OpenHouseRsvp {
  id:        string
  leadId:    string
  leadName:  string
  leadEmail: string | null
  response:  'yes' | 'no'
  guests:    number
  source:    'email' | 'web' | 'crm'
  attended:  boolean | null
  createdAt: string
  updatedAt: string
}

export interface OpenHouseProperty {
  id:               string
  name:             string | null
  address:          string
  city:             string | null
  state:            string | null
  slug:             string | null
  publishedToWeb:   boolean
  status:           string
  externalUrl:      string | null
  createdByAgentId: string | null
  contentLanguages: string[]
}

function toOpenHouse(r: any, now = new Date()): OpenHouseRow {
  return {
    id:               r.id,
    tenantId:         r.tenant_id,
    propertyId:       r.property_id,
    startsAt:         r.starts_at,
    endsAt:           r.ends_at,
    timezone:         r.timezone,
    publicNotes:      r.public_notes ?? null,
    languages:        r.languages ?? [],
    audienceTagIds:   r.audience_tag_ids ?? [],
    audienceMatch:    r.audience_match,
    rsvpEnabled:      r.rsvp_enabled === true,
    status:           r.status,
    displayState:     displayState(r.status, r.ends_at, now),
    hasStarted:       new Date(r.starts_at).getTime() <= now.getTime(),
    revision:         r.revision,
    createdByUserId:  r.created_by_user_id ?? null,
    createdByAgentId: r.created_by_agent_id ?? null,
    confirmedAt:      r.confirmed_at ?? null,
    cancelledAt:      r.cancelled_at ?? null,
    cancelReason:     r.cancel_reason ?? null,
    createdAt:        r.created_at,
  }
}

function toEmail(r: any, contents: any[], now = new Date()): OpenHouseEmail {
  return {
    id:                 r.id,
    kind:               r.kind,
    scheduledAt:        r.scheduled_at,
    status:             r.status,
    revision:           r.revision,
    sentCount:          r.sent_count,
    skippedCount:       r.skipped_count,
    failedCount:        r.failed_count,
    lastError:          r.last_error ?? null,
    finishedAt:         r.finished_at ?? null,
    recipientsFrozenAt: r.recipients_frozen_at ?? null,
    createdAt:          r.created_at,
    due:                new Date(r.scheduled_at).getTime() <= now.getTime(),
    contents: contents.filter(c => c.email_id === r.id).map(c => ({
      language:         c.language,
      subject:          c.subject ?? null,
      bodyJson:         c.body_json ?? null,
      resendTemplateId: c.resend_template_id ?? null,
    })),
  }
}

function toProperty(p: any): OpenHouseProperty {
  return {
    id:               p.id,
    name:             p.name ?? null,
    address:          p.address,
    city:             p.city ?? null,
    state:            p.state ?? null,
    slug:             p.slug ?? null,
    publishedToWeb:   p.published_to_web === true,
    status:           p.status,
    externalUrl:      p.external_url ?? null,
    createdByAgentId: p.created_by_agent_id ?? null,
    contentLanguages: p.content_languages ?? [],
  }
}

export interface OpenHouseListItem extends OpenHouseRow {
  rsvpYes:      number
  announcement: { status: OpenHouseEmailStatus; scheduledAt: string; sentCount: number } | null
}

export async function listPropertyOpenHouses(propertyId: string, tenantId: string): Promise<OpenHouseListItem[]> {
  const db = createAdminClient()
  const { data: rows } = await db
    .from('open_houses')
    .select(OPEN_HOUSE_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('property_id', propertyId)
    .order('starts_at', { ascending: false })
    .limit(50)
  const list = ((rows ?? []) as any[]).map(r => toOpenHouse(r))
  if (list.length === 0) return []

  const ids = list.map(o => o.id)
  const [{ data: emails }, { data: rsvps }] = await Promise.all([
    db.from('open_house_emails')
      .select(columns('open_house_emails', ['open_house_id', 'status', 'scheduled_at', 'sent_count']))
      .eq('tenant_id', tenantId)
      .eq('kind', 'announcement')
      .in('open_house_id', ids),
    db.from('open_house_rsvps')
      .select(columns('open_house_rsvps', ['open_house_id']))
      .eq('tenant_id', tenantId)
      .eq('response', 'yes')
      .in('open_house_id', ids),
  ])
  const annByOh = new Map(((emails ?? []) as any[]).map(e => [e.open_house_id as string, e]))
  const yesByOh = new Map<string, number>()
  for (const r of (rsvps ?? []) as any[]) yesByOh.set(r.open_house_id, (yesByOh.get(r.open_house_id) ?? 0) + 1)

  return list.map(o => {
    const a = annByOh.get(o.id)
    return {
      ...o,
      rsvpYes: yesByOh.get(o.id) ?? 0,
      announcement: a ? { status: a.status, scheduledAt: a.scheduled_at, sentCount: a.sent_count } : null,
    }
  })
}

export interface OpenHouseDetail {
  openHouse: OpenHouseRow
  property:  OpenHouseProperty
  emails:    OpenHouseEmail[]
  rsvps:     OpenHouseRsvp[]
  tags:      { id: string; name: string; slug: string; color: string }[]
}

export async function getOpenHouseDetail(openHouseId: string, tenantId: string): Promise<OpenHouseDetail | null> {
  const db = createAdminClient()
  const { data: row } = await db
    .from('open_houses')
    .select(OPEN_HOUSE_COLUMNS)
    .eq('id', openHouseId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!row) return null
  const openHouse = toOpenHouse(row)

  const [{ data: property }, { data: emails }, { data: rsvps }, { data: tags }] = await Promise.all([
    db.from('properties').select(PROPERTY_COLUMNS).eq('id', openHouse.propertyId).eq('tenant_id', tenantId).maybeSingle(),
    db.from('open_house_emails').select(EMAIL_COLUMNS).eq('open_house_id', openHouse.id).eq('tenant_id', tenantId).order('created_at'),
    db.from('open_house_rsvps')
      .select(`${RSVP_COLUMNS}, leads (${RSVP_LEAD_COLUMNS})`)
      .eq('open_house_id', openHouse.id)
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false }),
    db.from('lead_tags').select(TAG_COLUMNS).eq('tenant_id', tenantId).order('position'),
  ])
  if (!property) return null

  const emailIds = ((emails ?? []) as any[]).map(e => e.id as string)
  const { data: contents } = emailIds.length
    ? await db.from('open_house_email_contents').select(CONTENT_COLUMNS).eq('tenant_id', tenantId).in('email_id', emailIds)
    : { data: [] }

  return {
    openHouse,
    property: toProperty(property),
    // Orden de lectura: anuncio, recordatorio y después los avisos por fecha.
    emails:   ((emails ?? []) as any[])
      .map(e => toEmail(e, (contents ?? []) as any[]))
      .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.createdAt.localeCompare(b.createdAt)),
    rsvps:    ((rsvps ?? []) as unknown as any[]).map(r => {
      const lead = Array.isArray(r.leads) ? r.leads[0] : r.leads
      return {
        id:        r.id,
        leadId:    r.lead_id,
        leadName:  [lead?.first_name, lead?.last_name].filter(Boolean).join(' ').trim() || 'Lead',
        leadEmail: lead?.email ?? null,
        response:  r.response,
        guests:    r.guests,
        source:    r.source,
        attended:  r.attended ?? null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }
    }),
    tags: ((tags ?? []) as any[]).map(t => ({ id: t.id, name: t.name, slug: t.slug, color: t.color })),
  }
}

export async function listTenantTags(tenantId: string) {
  const db = createAdminClient()
  const { data } = await db.from('lead_tags').select(TAG_COLUMNS).eq('tenant_id', tenantId).order('position')
  return ((data ?? []) as any[]).map(t => ({ id: t.id as string, name: t.name as string, slug: t.slug as string, color: t.color as string }))
}

// ── Página pública ───────────────────────────────────────────────────────────

export interface PublicOpenHouse {
  id:          string
  startsAt:    string
  endsAt:      string
  timezone:    string
  publicNotes: string | null
  rsvpEnabled: boolean
  status:      'scheduled' | 'cancelled'
  revision:    number
}

const PUBLIC_OPEN_HOUSE_COLUMNS = columns('open_houses', [
  'id', 'starts_at', 'ends_at', 'timezone', 'public_notes', 'rsvp_enabled', 'status', 'revision',
])

/**
 * El open house que la ficha pública debe mostrar: el próximo confirmado que
 * no terminó; si no hay, uno cancelado cuya fecha aún no pasó (para decir
 * "cancelado" en vez de desaparecer sin explicación).
 */
export async function getPublicOpenHouseForProperty(propertyId: string, tenantId: string): Promise<PublicOpenHouse | null> {
  const db = createAdminClient()
  const { data } = await db
    .from('open_houses')
    .select(PUBLIC_OPEN_HOUSE_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('property_id', propertyId)
    .in('status', ['scheduled', 'cancelled'])
    .gt('ends_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(5)
  const rows = (data ?? []) as any[]
  const pick = rows.find(r => r.status === 'scheduled') ?? rows.find(r => r.status === 'cancelled')
  if (!pick) return null
  return {
    id:          pick.id,
    startsAt:    pick.starts_at,
    endsAt:      pick.ends_at,
    timezone:    pick.timezone,
    publicNotes: pick.public_notes ?? null,
    rsvpEnabled: pick.rsvp_enabled === true,
    status:      pick.status,
    revision:    pick.revision,
  }
}

/**
 * Zona horaria por defecto para un open house nuevo: la del último que creó el
 * equipo. El navegador de quien lo crea no sirve —el agente puede estar de
 * viaje o el equipo operar en otro huso—; null si el equipo aún no tiene uno.
 */
export async function lastOpenHouseTimezone(tenantId: string): Promise<string | null> {
  const db = createAdminClient()
  const { data } = await db
    .from('open_houses')
    .select(columns('open_houses', ['timezone']))
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return ((data as any)?.timezone as string | undefined) ?? null
}
