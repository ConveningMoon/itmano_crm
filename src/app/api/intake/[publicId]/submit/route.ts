import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { CORS_HEADERS, corsOptions } from '@/app/api/intake/cors'
import { enrollLeadInSequence } from '@/lib/services/enroll-lead-in-sequence'

export function OPTIONS() {
  return corsOptions()
}

// ── Zod schema ────────────────────────────────────────────────────────────────

// One answer in the form_submissions snapshot (see CLAUDE.md → answers contract).
// key/value required; question/label optional for robustness.
const FormAnswerSchema = z.object({
  key:      z.string().min(1).max(200),
  question: z.string().max(2000).optional(),
  value:    z.union([z.string().max(4000), z.number(), z.boolean()]),
  label:    z.string().max(4000).optional(),
})

const SubmitSchema = z.object({
  first_name:   z.string().min(1).max(100),
  last_name:    z.string().max(100).optional().default(''),
  email:        z.string().email().transform(s => s.toLowerCase().trim()),
  phone:        z.string().max(30).optional(),
  language:     z.enum(['es', 'en', 'pt']).default('es'),
  visitor_id:   z.string().max(128).optional(),
  utms:         z.record(z.string(), z.string().max(256)).optional().default({}),
  quiz_answers: z.record(z.string(), z.unknown()).optional(),
  form_answers: z.array(FormAnswerSchema).max(50).optional(),
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

  let leadId: string
  let duplicate = false
  const fullName = `${parsed.first_name} ${parsed.last_name}`.trim() || 'Lead'

  if (existingLead) {
    duplicate = true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = existingLead as any
    leadId = existing.id as string

    // a) Merge non-empty changed fields
    const updates: Record<string, string> = {}
    if (parsed.first_name && parsed.first_name !== existing.first_name) updates.first_name = parsed.first_name
    if (parsed.last_name  && parsed.last_name  !== existing.last_name)  updates.last_name  = parsed.last_name
    if (parsed.phone      && parsed.phone      !== existing.phone)      updates.phone      = parsed.phone
    if (parsed.language   && parsed.language   !== existing.language)   updates.language   = parsed.language

    if (Object.keys(updates).length > 0) {
      await db.from('leads').update(updates).eq('id', leadId)
    }

    // b) Log re-engagement event (lead-level dedup — independent of submission dedup)
    await db.from('lead_events').insert({
      lead_id:     leadId,
      tenant_id:   tenantId,
      type:        'lead_resubmitted',
      description: `Lead re-submitted via intake form (channel: ${channelName})`,
      points:      5,
    })
    // Enrollment is decided below, by submission status (created vs already_submitted).
  } else {
    // ── New lead ──────────────────────────────────────────────────────────────
    const baseline = BASELINE_SCORE[channelRow.channel_type as string] ?? 0
    leadId         = crypto.randomUUID()
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
      // quiz_answers is no longer persisted to metadata — answers now live in
      // form_submissions (see CLAUDE.md → answers contract).
    })

    if (leadError) {
      console.error(JSON.stringify({ service: 'intake-submit', public_id: publicId, error: leadError.message }))
      return err('Submission failed', 500)
    }

    // Contact-form questions keep their dedicated notification.
    if (channelRow.channel_type === 'contact_form') {
      const question = (
        typeof parsed.quiz_answers?.question === 'string' ? parsed.quiz_answers.question :
        typeof parsed.quiz_answers?.message  === 'string' ? parsed.quiz_answers.message  :
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
  }

  // ── Submission + enrollment + notifications ──────────────────────────────────
  // Two dedup layers: the lead is unique per (tenant_id, email) above; here a
  // SECOND layer dedups the *submission* per (lead_id, channel_id) — but ONLY for
  // lead_magnet & event. Contact-form/manychat/manual keep one submission per submit.
  const channelType = channelRow.channel_type as string
  let submissionStatus: 'created' | 'already_submitted' = 'created'

  // Legacy enrollment guard for non-LM/event: new lead always; existing lead only
  // if it has no active run (avoids duplicate runs). Preserves prior behavior.
  async function enrollIfEligible() {
    if (!duplicate) {
      await enrollLeadInSequence({ db, lead_id: leadId, tenant_id: tenantId, acquisition_channel_id: channelId })
      return
    }
    const { data: activeRuns } = await db
      .from('lead_sequence_runs').select('id').eq('lead_id', leadId).eq('status', 'active').limit(1)
    if (!activeRuns?.length) {
      await enrollLeadInSequence({ db, lead_id: leadId, tenant_id: tenantId, acquisition_channel_id: channelId })
    }
  }

  if (channelType === 'lead_magnet' || channelType === 'event') {
    const { data: existingSub } = await db
      .from('form_submissions')
      .select('id')
      .eq('lead_id', leadId)
      .eq('channel_id', channelId)
      .limit(1)
      .maybeSingle()

    if (existingSub) {
      // ── already_submitted: overwrite answers, no re-enroll, no new notification ──
      submissionStatus = 'already_submitted'
      const subId = (existingSub as { id: string }).id
      const { error: updErr } = await db.from('form_submissions').update({
        answers:      parsed.form_answers ?? [],
        submitted_at: new Date().toISOString(),
      }).eq('id', subId)
      if (updErr) {
        console.error(JSON.stringify({ service: 'intake-submit', public_id: publicId, lead_id: leadId, error: 'submission_update_failed', detail: updErr.message }))
      }
    } else {
      // ── created: new submission for this (lead, channel) ──
      submissionStatus = 'created'
      const { error: insErr } = await db.from('form_submissions').insert({
        tenant_id: tenantId, channel_id: channelId, lead_id: leadId, answers: parsed.form_answers ?? [],
      })
      if (insErr) {
        console.error(JSON.stringify({ service: 'intake-submit', public_id: publicId, lead_id: leadId, error: 'submission_insert_failed', detail: insErr.message }))
      }
      // Enroll / send material (no-op if the channel has no linked sequence).
      await enrollLeadInSequence({ db, lead_id: leadId, tenant_id: tenantId, acquisition_channel_id: channelId })
      // Events notify on first submission; lead_magnet does not.
      if (channelType === 'event') {
        const { error: evNotifError } = await db.from('notifications').insert({
          tenant_id: tenantId, type: 'event_submission', lead_id: leadId,
          message: `${fullName} se registró en ${channelName}`,
        })
        if (evNotifError) {
          console.error(JSON.stringify({ service: 'intake-submit', public_id: publicId, error: 'event_notification_failed', detail: evNotifError.message }))
        }
      }
    }
  } else {
    // contact_form / manychat / manual — unchanged: one submission per submit + legacy enroll.
    const { error: submissionError } = await db.from('form_submissions').insert({
      tenant_id: tenantId, channel_id: channelId, lead_id: leadId, answers: parsed.form_answers ?? [],
    })
    if (submissionError) {
      console.error(JSON.stringify({ service: 'intake-submit', public_id: publicId, lead_id: leadId, error: 'submission_insert_failed', detail: submissionError.message }))
    }
    await enrollIfEligible()
  }

  console.log(JSON.stringify({
    service:      'intake-submit',
    public_id:    publicId,
    lead_id:      leadId,
    tenant_id:    tenantId,
    channel_type: channelType,
    status:       submissionStatus,
  }))

  return ok({ status: submissionStatus, channel_type: channelType })
}
