import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { resolveChannelAgent } from '@/lib/services/route-channel-agent'
import { emitFormBaselineOnce } from '@/lib/services/emit-form-baseline'
import { emitLeadCreated } from '@/lib/services/emit-lead-created'

// Registrar la respuesta a un open house. Tres entradas llegan aquí:
//
//   · el enlace firmado de un correo (ya sabemos qué lead es),
//   · el formulario de la página pública o de la web propia del cliente (llega
//     un email: puede ser un lead existente o alguien nuevo),
//   · el CRM, cuando el agente anota una respuesta a mano.
//
// Confirmar asistencia es la señal de compromiso más clara que da un open
// house, así que puntúa como el registro a un evento (regla event_submission,
// +20) — UNA vez por open house: el dedup_key por evento hace que cambiar de
// opinión y volver a confirmar no sume dos veces.

/* eslint-disable @typescript-eslint/no-explicit-any */

type AdminClient = ReturnType<typeof createAdminClient>

export type RsvpResponse = 'yes' | 'no'
export type RsvpSource   = 'email' | 'web' | 'crm'

export type RsvpError = 'not_found' | 'cancelled' | 'ended' | 'rsvp_disabled' | 'no_agent' | 'failed'

export const RSVP_ERROR_MESSAGE: Record<RsvpError, string> = {
  not_found:     'Este open house no existe o ya no está disponible.',
  cancelled:     'Este open house fue cancelado.',
  ended:         'Este open house ya terminó.',
  rsvp_disabled: 'Este open house no recibe confirmaciones.',
  no_agent:      'No pudimos registrar tu respuesta. Intenta más tarde.',
  failed:        'No pudimos registrar tu respuesta. Intenta más tarde.',
}

export interface VisitorInput {
  firstName: string
  lastName:  string
  email:     string
  phone:     string | null
  language:  'es' | 'en' | 'pt'
}

export type RsvpResult =
  | { ok: true; status: 'created' | 'updated'; leadCreated: boolean; response: RsvpResponse }
  | { ok: false; error: RsvpError }

async function loadOpenHouse(db: AdminClient, openHouseId: string) {
  const { data } = await db
    .from('open_houses')
    .select('id, tenant_id, property_id, status, ends_at, rsvp_enabled, created_by_agent_id, properties (name, address, created_by_agent_id)')
    .eq('id', openHouseId)
    .maybeSingle()
  return data as any
}

function checkOpen(oh: any, now: Date): RsvpError | null {
  if (!oh || oh.status === 'draft') return 'not_found'
  if (oh.status === 'cancelled') return 'cancelled'
  if (new Date(oh.ends_at).getTime() <= now.getTime()) return 'ended'
  if (!oh.rsvp_enabled) return 'rsvp_disabled'
  return null
}

/** El open house admite respuestas ahora mismo (lo usa la página del enlace). */
export async function openHouseRsvpState(db: AdminClient, openHouseId: string): Promise<RsvpError | null> {
  return checkOpen(await loadOpenHouse(db, openHouseId), new Date())
}

async function findOrCreateVisitorLead(
  db: AdminClient,
  oh: any,
  visitor: VisitorInput,
): Promise<{ leadId: string; created: boolean } | { error: RsvpError }> {
  const tenantId = oh.tenant_id as string
  const email = visitor.email.trim().toLowerCase()

  const { data: existing } = await db
    .from('leads')
    .select('id, phone')
    .eq('tenant_id', tenantId)
    .eq('email', email)
    .maybeSingle()
  if (existing) {
    // Un teléfono nuevo es información útil; el resto de la ficha no se pisa
    // con lo que alguien escribió en un formulario público.
    if (visitor.phone && !(existing as any).phone) {
      await db.from('leads').update({ phone: visitor.phone }).eq('id', (existing as any).id)
    }
    return { leadId: (existing as any).id as string, created: false }
  }

  // Alguien nuevo: el lead es del agente que organiza el open house (o del de
  // la propiedad), con la misma regla de ruteo que las fuentes.
  const property = Array.isArray(oh.properties) ? oh.properties[0] : oh.properties
  const agentId = await resolveChannelAgent(
    db, tenantId,
    (oh.created_by_agent_id as string | null) ?? (property?.created_by_agent_id as string | null) ?? null,
  )
  if (!agentId) return { error: 'no_agent' }

  const leadId = crypto.randomUUID()
  const { error } = await db.from('leads').insert({
    id:             leadId,
    tenant_id:      tenantId,
    agent_id:       agentId,
    first_name:     visitor.firstName,
    last_name:      visitor.lastName,
    email,
    phone:          visitor.phone,
    language:       visitor.language,
    stage:          'nuevo',
    traffic_source: 'direct',
    peak_score:     0,
    current_score:  0,
    metadata:       { open_house_id: oh.id },
  })
  if (error) {
    // Carrera: el mismo email llegó dos veces a la vez. El segundo lo encuentra.
    const { data: again } = await db.from('leads').select('id').eq('tenant_id', tenantId).eq('email', email).maybeSingle()
    if (again) return { leadId: (again as any).id as string, created: false }
    console.error(JSON.stringify({ service: 'open-house-rsvp', open_house_id: oh.id, error: 'lead_insert_failed', detail: error.message }))
    return { error: 'failed' }
  }

  await emitFormBaselineOnce(db, leadId, tenantId)
  await emitLeadCreated(db, {
    leadId, tenantId, via: 'open_house', actorUserId: null,
    channelLabel: (property?.name as string | null) ?? (property?.address as string | null) ?? null,
  })
  return { leadId, created: true }
}

export async function recordOpenHouseRsvp(
  db: AdminClient,
  args: {
    openHouseId: string
    response:    RsvpResponse
    guests:      number
    source:      RsvpSource
    /** Lead conocido (enlace firmado o CRM). */
    leadId?:     string
    /** Visitante del formulario público. */
    visitor?:    VisitorInput
    /** El CRM puede anotar respuestas de un evento que ya pasó. */
    allowEnded?: boolean
    now?:        Date
  },
): Promise<RsvpResult> {
  const now = args.now ?? new Date()
  const oh = await loadOpenHouse(db, args.openHouseId)
  const closed = checkOpen(oh, now)
  if (closed && !(args.allowEnded && closed === 'ended')) return { ok: false, error: closed }
  const tenantId = oh.tenant_id as string

  let leadId: string
  let leadCreated = false
  if (args.leadId) {
    const { data: lead } = await db.from('leads').select('id').eq('id', args.leadId).eq('tenant_id', tenantId).maybeSingle()
    if (!lead) return { ok: false, error: 'not_found' }
    leadId = args.leadId
  } else if (args.visitor) {
    const res = await findOrCreateVisitorLead(db, oh, args.visitor)
    if ('error' in res) return { ok: false, error: res.error }
    leadId = res.leadId
    leadCreated = res.created
  } else {
    return { ok: false, error: 'failed' }
  }

  const { data: previous } = await db
    .from('open_house_rsvps')
    .select('id, response')
    .eq('open_house_id', oh.id)
    .eq('lead_id', leadId)
    .maybeSingle()

  const guests = Math.max(0, Math.min(10, Math.trunc(args.guests || 0)))
  const { error: upErr } = await db.from('open_house_rsvps').upsert({
    tenant_id:     tenantId,
    open_house_id: oh.id,
    lead_id:       leadId,
    response:      args.response,
    guests:        args.response === 'yes' ? guests : 0,
    source:        args.source,
  }, { onConflict: 'open_house_id,lead_id' })
  if (upErr) {
    console.error(JSON.stringify({ service: 'open-house-rsvp', open_house_id: oh.id, lead_id: leadId, error: 'upsert_failed', detail: upErr.message }))
    return { ok: false, error: 'failed' }
  }

  const property = Array.isArray(oh.properties) ? oh.properties[0] : oh.properties
  const propertyLabel = (property?.name as string | null) ?? (property?.address as string | null) ?? 'la propiedad'

  if (args.response === 'yes' && (previous as any)?.response !== 'yes') {
    // Puntúa una vez por open house: el índice único (lead_id, dedup_key) hace
    // que una segunda confirmación choque y no sume. Ese choque no es un error.
    const { error: evErr } = await db.from('lead_events').insert({
      lead_id:     leadId,
      tenant_id:   tenantId,
      type:        'event_submission',
      description: `Confirmó asistencia al open house de ${propertyLabel}`,
      points:      20,
      dedup_key:   `open_house_rsvp:${oh.id}`,
      metadata:    { open_house_id: oh.id, source: args.source },
    })
    if (evErr && evErr.code !== '23505') {
      console.error(JSON.stringify({ service: 'open-house-rsvp', lead_id: leadId, error: 'event_insert_failed', detail: evErr.message }))
    }

    // Aviso al agente del lead (Telegram incluido), salvo que la respuesta la
    // haya anotado él mismo desde el CRM.
    if (args.source !== 'crm') {
      const { data: leadRow } = await db.from('leads').select('first_name, last_name, agent_id').eq('id', leadId).maybeSingle()
      const l = leadRow as any
      const name = [l?.first_name, l?.last_name].filter(Boolean).join(' ').trim() || 'Un lead'
      const { error: nErr } = await db.from('notifications').insert({
        tenant_id: tenantId,
        type:      'event_submission',
        lead_id:   leadId,
        agent_id:  (l?.agent_id as string | null) ?? null,
        message:   `${name} confirmó asistencia al open house de ${propertyLabel}`,
      })
      if (nErr) console.error(JSON.stringify({ service: 'open-house-rsvp', lead_id: leadId, error: 'notification_failed', detail: nErr.message }))
    }
  }

  if (leadCreated) {
    const { error: rErr } = await db.rpc('recompute_lead_score', { p_lead_id: leadId })
    if (rErr) console.error(JSON.stringify({ service: 'open-house-rsvp', lead_id: leadId, error: 'recompute_failed', detail: rErr.message }))
  }

  return { ok: true, status: previous ? 'updated' : 'created', leadCreated, response: args.response }
}
