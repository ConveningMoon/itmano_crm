import 'server-only'
import { after } from 'next/server'
import type { createAdminClient } from '@/lib/supabase/admin'
import { emitFormBaselineOnce } from '@/lib/services/emit-form-baseline'
import { emitLeadCreated } from '@/lib/services/emit-lead-created'
import { resolveChannelAgent } from '@/lib/services/route-channel-agent'
import { assessLeadFit } from '@/lib/services/ai-lead-fit'

type AdminClient = ReturnType<typeof createAdminClient>

// The resolved channel the contact submission is attributed to. Both callers
// (the x-contact-secret backup endpoint and the native Webflow webhook) resolve
// this by public_id before calling in.
export interface ContactChannel {
  id:        string
  tenant_id: string
  name:      string
  agent_id:  string | null
}

// "How can we help?" — the new coded-site form's required intent radio.
// Optional here for backward compatibility with the Webflow webhook, whose form
// never collected it.
export type ContactReason = 'buy' | 'sell' | 'invest'

const REASON_LABELS: Record<ContactReason, string> = {
  buy:    'Quiere comprar',
  sell:   'Quiere vender',
  invest: 'Quiere invertir',
}

export interface ContactSubmissionParams {
  db:          AdminClient
  channel:     ContactChannel
  first_name:  string
  last_name?:  string
  email:       string
  phone?:      string
  reason?:     ContactReason
  message?:    string
  language?:   'es' | 'en' | 'pt'
  // Preguntas personalizadas del formulario (se agregan al snapshot Q&A).
  form_answers?: Array<{ key: string; question?: string; value: string; label?: string }>
}


// Core contact-submission logic shared by all contact entry points:
// dedup by (tenant_id, email) with field merge, always log a high-intent
// contact_us_question scoring event (+20 via trigger), and notify contact_us.
// Never enrolls in an email sequence.
export async function handleContactSubmission(
  params: ContactSubmissionParams
): Promise<{ ok: true; duplicate: boolean }> {
  const { db, channel } = params
  const language   = params.language ?? 'es'
  const firstName  = params.first_name.trim()
  const lastName   = (params.last_name ?? '').trim()
  const email      = params.email.toLowerCase().trim()
  const phone      = params.phone?.trim() || null
  const reason     = params.reason ?? null
  const reasonLabel = reason ? REASON_LABELS[reason] : null
  const message    = params.message?.trim().slice(0, 2000) || null
  // lead_events.description is NOT NULL — fall back to the reason label, then a
  // generic label, so a submission with no free-text message still logs cleanly.
  const description = message || reasonLabel || 'Formulario de contacto enviado'
  const tenantId   = channel.tenant_id

  // ── Resolve agent — channel.agent_id (explicit) or round-robin. Language is NO
  //    LONGER a routing criterion. See route-channel-agent.ts. ──────────────────
  const agentId = await resolveChannelAgent(db, tenantId, channel.agent_id)
  if (!agentId) {
    console.error(JSON.stringify({ service: 'handle-contact-submission', channel_id: channel.id, error: 'no_agent_found' }))
    throw new Error('No agent available for tenant')
  }

  // ── Dedup by (tenant_id, email) ───────────────────────────────────────────────
  const { data: existingLead } = await db
    .from('leads')
    .select('id, first_name, last_name, phone, language')
    .eq('tenant_id', tenantId)
    .eq('email', email)
    .maybeSingle()

  let leadId: string
  let duplicate = false

  if (existingLead) {
    duplicate = true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = existingLead as any
    leadId = existing.id as string

    // Merge non-empty changed fields
    const updates: Record<string, string> = {}
    if (firstName && firstName !== existing.first_name) updates.first_name = firstName
    if (lastName  && lastName  !== existing.last_name)  updates.last_name  = lastName
    if (phone     && phone     !== existing.phone)      updates.phone      = phone
    if (language  && language  !== existing.language)   updates.language   = language
    if (Object.keys(updates).length > 0) {
      await db.from('leads').update(updates).eq('id', leadId)
    }
  } else {
    leadId = crypto.randomUUID()
    // Score starts at 0/new; it is derived from engagement-by-action — form_baseline
    // (+10) + contact_us_question (+20) below, folded in by recompute via the event
    // triggers (= 30). No per-channel baseline is seeded (it would only pollute peak_score).
    const { error: leadError } = await db.from('leads').insert({
      id:                     leadId,
      tenant_id:              tenantId,
      agent_id:               agentId,
      first_name:             firstName,
      last_name:              lastName,
      email,
      phone,
      language,
      status:                 'new',
      acquisition_channel_id: channel.id,
      // traffic_source is the *arrival* source (constrained set), not the channel
      // type. A contact submission has no UTM context → 'direct'.
      traffic_source:         'direct',
      peak_score:             0,
      current_score:          0,
    })
    if (leadError) {
      console.error(JSON.stringify({ service: 'handle-contact-submission', channel_id: channel.id, error: leadError.message }))
      throw new Error(`Lead insert failed: ${leadError.message}`)
    }

    // form_baseline (+10) on the lead's FIRST form — only on creation (new lead).
    await emitFormBaselineOnce(db, leadId, tenantId)
    // Lifecycle log — system-authored (no user context on a public webhook).
    await emitLeadCreated(db, { leadId, tenantId, via: 'contact_form', actorUserId: null })
  }

  // ── Always log the submission as a scoring event ─────────────────────────────
  // Each submission is its own event (dedup_key null). The apply_lead_event_scoring
  // trigger applies the +20 from lead_score_rules and may auto-promote / notify.
  // description falls back to the reason label when no free-text message was sent.
  const { error: eventError } = await db.from('lead_events').insert({
    lead_id:     leadId,
    tenant_id:   tenantId,
    type:        'contact_us_question',
    description,
    points:      20,
    metadata:    { channel_id: channel.id, source: 'contact_us', reason },
  })
  if (eventError) {
    console.error(JSON.stringify({ service: 'handle-contact-submission', channel_id: channel.id, lead_id: leadId, error: 'event_insert_failed', detail: eventError.message }))
  }

  // ── Notify Telegram via the notifications webhook trigger ─────────────────────
  const name = `${firstName} ${lastName}`.trim() || 'Lead'
  const intentSuffix = reasonLabel ? ` (${reasonLabel})` : ''
  const notifMessage = message
    ? `Nueva pregunta de ${name}${intentSuffix}: ${message.slice(0, 100)}`
    : `Nueva consulta de ${name}${intentSuffix}`
  const { error: notifError } = await db.from('notifications').insert({
    tenant_id: tenantId,
    type:      'contact_us',
    lead_id:   leadId,
    agent_id:  agentId,
    message:   notifMessage,
  })
  if (notifError) {
    console.error(JSON.stringify({ service: 'handle-contact-submission', channel_id: channel.id, lead_id: leadId, error: 'notification_insert_failed', detail: notifError.message }))
  }

  // ── Structured submission snapshot (reason + message as Q&A items) ────────────
  // lead_events above is the activity/scoring log; this is the display record.
  const answers: Array<{ key: string; question: string; value: string; label: string }> = []
  if (reason) {
    answers.push({ key: 'reason', question: '¿Cómo podemos ayudarte?', value: reason, label: reasonLabel! })
  }
  if (message) {
    answers.push({ key: 'message', question: 'Mensaje', value: message, label: message })
  }
  // Preguntas personalizadas del formulario (constructor de la página alojada).
  for (const a of params.form_answers ?? []) {
    answers.push({ key: a.key, question: a.question ?? a.key, value: a.value, label: a.label ?? a.value })
  }
  const { error: submissionError } = await db.from('form_submissions').insert({
    tenant_id:  tenantId,
    channel_id: channel.id,
    lead_id:    leadId,
    answers,
  })
  if (submissionError) {
    console.error(JSON.stringify({ service: 'handle-contact-submission', channel_id: channel.id, lead_id: leadId, error: 'submission_insert_failed', detail: submissionError.message }))
  }

  // Análisis de fit con IA (si el tenant lo tiene activado) — cada acción del
  // lead se reanaliza. Fire-and-forget: no bloquea la respuesta.
  after(() => assessLeadFit({ leadId, tenantId, reason: 'contact_form' }))

  console.log(JSON.stringify({
    service:   'handle-contact-submission',
    channel:   channel.name,
    lead_id:   leadId,
    tenant_id: tenantId,
    duplicate,
  }))

  return { ok: true, duplicate }
}
