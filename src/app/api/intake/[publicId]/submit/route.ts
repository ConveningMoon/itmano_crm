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

function ok(): NextResponse {
  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
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
      return err('Invalid request', 400)
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
    .select('id, tenant_id, channel_type, email_sequence_id, metadata')
    .eq('public_id', publicId)
    .eq('active', true)
    .maybeSingle()

  if (!channel) {
    return err('Channel not found', 404)
  }

  const tenantId = channel.tenant_id as string

  // Resolve agent — explicit routing first, then language-based fallback
  const channelMeta = (channel.metadata ?? {}) as Record<string, unknown>
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

  const baseline = BASELINE_SCORE[channel.channel_type as string] ?? 0
  const leadId   = crypto.randomUUID()
  const utms     = parsed.utms

  // Insert lead
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
    acquisition_channel_id: channel.id,
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
    acquisition_channel_id: channel.id,
  })

  // Fire contact_form_question notification (triggers Telegram via DB webhook)
  if (channel.channel_type === 'contact_form') {
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
