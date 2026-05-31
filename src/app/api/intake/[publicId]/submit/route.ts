import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { CORS_HEADERS, corsOptions } from '@/app/api/intake/cors'
import { enrollLeadInSequence } from '@/lib/services/enroll-lead-in-sequence'

export function OPTIONS() {
  return corsOptions()
}

// ── Zod schema ────────────────────────────────────────────────────────────────

const SubmitSchema = z.object({
  first_name:   z.string().min(1).max(100),
  last_name:    z.string().max(100).optional().default(''),
  email:        z.string().email().transform(s => s.toLowerCase().trim()),
  phone:        z.string().max(30).optional(),
  language:     z.enum(['es', 'en', 'pt']).default('es'),
  visitor_id:   z.string().max(128).optional(),
  utms:         z.record(z.string(), z.string().max(256)).optional().default({}),
  quiz_answers: z.record(z.string(), z.unknown()).optional(),
  source_url:   z.string().max(2048).optional(),
  website:      z.string().optional(), // honeypot — must be empty
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveTrafficSource(utms: Record<string, string>): string {
  const src = (utms.utm_source ?? '').toLowerCase()
  if (utms.gclid  || src.includes('google'))    return 'ads_google'
  if (utms.fbclid || src.includes('meta') || src.includes('facebook') || src.includes('instagram')) return 'ads_meta'
  if (src === 'manychat')  return 'manychat_inbound'
  if (src === 'referral')  return 'referral'
  if (src && utms.utm_medium) return 'organic_social'
  if (src)                 return 'unknown'
  return 'direct'
}

// Baseline score per channel_type (from lead scoring model in CLAUDE.md)
const BASELINE_SCORE: Record<string, number> = {
  lead_magnet:   15,
  event:         40,
  contact_form:  20,
  manychat_flow: 20,
  manual:         0,
}

function scoreToStatus(score: number): string {
  if (score >= 60) return 'hot'
  if (score >= 35) return 'warm'
  if (score >= 15) return 'nurturing'
  return 'new'
}

function ok(extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ ok: true, ...extra }, { headers: CORS_HEADERS })
}

function err(message: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status, headers: CORS_HEADERS })
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> }
) {
  const { publicId } = await params

  // TODO: rate limiting — 10 req/IP/min — implement with Upstash Redis when added.
  // Current first line of defense: non-guessable public_id + honeypot + Zod validation.

  // Parse and validate body
  let parsed: z.infer<typeof SubmitSchema>
  try {
    const body = await request.json()
    const result = SubmitSchema.safeParse(body)
    if (!result.success) {
      const issues = result.error.issues.map(i => ({
        field:    i.path.join('.') || '(root)',
        code:     i.code,
        message:  i.message,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        received: 'received' in i ? (i as any).received : undefined,
      }))
      console.warn(JSON.stringify({
        service:    'intake-submit',
        result:     'validation_failed',
        public_id:  publicId,
        issues,
      }))
      return NextResponse.json(
        { ok: false, error: 'Invalid request', issues },
        { status: 400, headers: CORS_HEADERS }
      )
    }
    parsed = result.data
  } catch {
    return err('Invalid request', 400)
  }

  // Server-side honeypot check
  if (parsed.website) {
    console.log(JSON.stringify({
      service:   'intake-submit',
      public_id: publicId,
      result:    'honeypot_triggered',
    }))
    return ok() // Silent reject — don't tip off bots
  }

  const db = createAdminClient()

  // Resolve channel
  const { data: channel } = await db
    .from('acquisition_channels')
    .select('id, name, tenant_id, channel_type, email_sequence_id, metadata')
    .eq('public_id', publicId)
    .eq('active', true)
    .maybeSingle()

  if (!channel) {
    return err('Channel not found', 404)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRow = channel as any
  const tenantId   = channelRow.tenant_id as string
  const channelId  = channelRow.id as string
  const channelName = channelRow.name as string

  // Resolve agent — explicit routing first, then language-based fallback
  const channelMeta = (channelRow.metadata ?? {}) as Record<string, unknown>
  let agentId: string | null = typeof channelMeta.default_agent_id === 'string'
    ? channelMeta.default_agent_id
    : null

  if (!agentId) {
    const { data: agent } = await db
      .from('agents')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('language', parsed.language)
      .neq('specialty', 'first_buyer') // Melanie is manual-assignment only
      .limit(1)
      .maybeSingle()
    agentId = agent?.id ?? null
  }

  // Fallback: any active agent for the tenant (should never reach this)
  if (!agentId) {
    const { data: fallback } = await db
      .from('agents')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .limit(1)
      .maybeSingle()
    agentId = fallback?.id ?? null
  }

  if (!agentId) {
    console.error(JSON.stringify({ service: 'intake-submit', public_id: publicId, error: 'no_agent_found' }))
    return err('Configuration error', 500)
  }

  // ── Duplicate check — same tenant + email ─────────────────────────────────

  const { data: existingLead } = await db
    .from('leads')
    .select('id, status, first_name, last_name, phone, language')
    .eq('tenant_id', tenantId)
    .eq('email', parsed.email)
    .maybeSingle()

  if (existingLead) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = existingLead as any

    // a) Merge non-empty changed fields
    const updates: Record<string, string> = {}
    if (parsed.first_name && parsed.first_name !== existing.first_name) updates.first_name = parsed.first_name
    if (parsed.last_name  && parsed.last_name  !== existing.last_name)  updates.last_name  = parsed.last_name
    if (parsed.phone      && parsed.phone      !== existing.phone)      updates.phone      = parsed.phone
    if (parsed.language   && parsed.language   !== existing.language)   updates.language   = parsed.language

    if (Object.keys(updates).length > 0) {
      await db.from('leads').update(updates).eq('id', existing.id)
    }

    // b) Log re-engagement event
    await db.from('lead_events').insert({
      lead_id:     existing.id,
      tenant_id:   tenantId,
      type:        'lead_resubmitted',
      description: `Lead re-submitted via intake form (channel: ${channelName})`,
      points:      5,
    })

    // c) Re-enroll in sequence only if no active run exists
    const { data: activeRuns } = await db
      .from('lead_sequence_runs')
      .select('id')
      .eq('lead_id', existing.id)
      .eq('status', 'active')
      .limit(1)

    if (!activeRuns?.length) {
      await enrollLeadInSequence({
        db,
        lead_id:                existing.id,
        tenant_id:              tenantId,
        acquisition_channel_id: channelId,
      })
    }

    console.log(JSON.stringify({
      service:    'intake-submit',
      public_id:  publicId,
      lead_id:    existing.id,
      tenant_id:  tenantId,
      result:     'duplicate',
    }))

    return ok({ duplicate: true })
  }

  // ── New lead ──────────────────────────────────────────────────────────────

  const baseline = BASELINE_SCORE[channelRow.channel_type as string] ?? 0
  const leadId   = crypto.randomUUID()
  const utms     = parsed.utms

  const { error: leadError } = await db.from('leads').insert({
    id:                   leadId,
    tenant_id:            tenantId,
    agent_id:             agentId,
    first_name:           parsed.first_name,
    last_name:            parsed.last_name,
    email:                parsed.email,
    phone:                parsed.phone ?? null,
    language:             parsed.language,
    status:               scoreToStatus(baseline),
    acquisition_channel_id: channelId,
    traffic_source:       resolveTrafficSource(utms),
    traffic_source_detail: Object.keys(utms).length > 0 ? utms : null,
    peak_score:           baseline,
    current_score:        baseline,
    metadata:             parsed.quiz_answers ? { quiz_answers: parsed.quiz_answers } : null,
  })

  if (leadError) {
    console.error(JSON.stringify({ service: 'intake-submit', public_id: publicId, error: leadError.message }))
    return err('Submission failed', 500)
  }

  // Enroll in email sequence if the channel has one
  await enrollLeadInSequence({
    db,
    lead_id:                leadId,
    tenant_id:              tenantId,
    acquisition_channel_id: channelId,
  })

  // Fire contact_form_question notification (triggers Telegram via DB webhook)
  if (channelRow.channel_type === 'contact_form') {
    const qa       = parsed.quiz_answers
    const question = (
      typeof qa?.question === 'string' ? qa.question :
      typeof qa?.message  === 'string' ? qa.message  :
      ''
    ).slice(0, 300)

    const { error: notifError } = await db.from('notifications').insert({
      tenant_id: tenantId,
      type:      'contact_form_question',
      lead_id:   leadId,
      message:   question,
    })

    if (notifError) {
      console.error(JSON.stringify({ service: 'intake-submit', public_id: publicId, error: 'notification_insert_failed', detail: notifError.message }))
    }
  }

  console.log(JSON.stringify({
    service:    'intake-submit',
    public_id:  publicId,
    lead_id:    leadId,
    tenant_id:  tenantId,
    language:   parsed.language,
    agent_id:   agentId,
    baseline,
  }))

  return ok()
}
