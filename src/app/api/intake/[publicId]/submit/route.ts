import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { CORS_HEADERS, corsOptions } from '@/app/api/intake/cors'
import { enrollLeadInSequence } from '@/lib/services/enroll-lead-in-sequence'
import { normalizeIntent, extractFitDimensions } from '@/lib/services/intake-fit'
import { emitFormBaselineOnce } from '@/lib/services/emit-form-baseline'

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
  intent:       z.string().max(40).optional(), // buyer/seller path — drives fit extraction
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

// Distinct-LM engagement events (see lead_score_rules, migration 029). form_baseline
// (the lead's FIRST form of any type) is emitted on lead creation by emitFormBaselineOnce
// — NOT here — so the LM tiers start at the 2nd distinct lead magnet. recompute_lead_score
// reads points from the rules; the `points` on the event row is for the activity log only.
const LM_ENGAGEMENT: Record<string, { type: string; points: number; description: string }> = {
  second: { type: 'second_lm', points: 8,  description: '2º lead magnet descargado' },
  third:  { type: 'third_lm',  points: 12, description: '3º+ lead magnet descargado' },
}

// Count the distinct lead_magnet channels this lead has ever submitted a form to.
// Used to fire the 2nd/3rd distinct-LM engagement events.
async function countDistinctLeadMagnetSubmissions(
  db: ReturnType<typeof createAdminClient>,
  leadId: string
): Promise<number> {
  const { data: subs } = await db.from('form_submissions').select('channel_id').eq('lead_id', leadId)
  const channelIds = [...new Set((subs ?? []).map(s => (s as { channel_id: string }).channel_id))]
  if (channelIds.length === 0) return 0
  const { data: lm } = await db
    .from('acquisition_channels')
    .select('id')
    .in('id', channelIds)
    .eq('channel_type', 'lead_magnet')
  return (lm ?? []).length
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
    .select('id, status, first_name, last_name, phone, language, fit_profile, metadata')
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

    // b) Log re-engagement as an activity-feed entry only. There is NO scoring rule for
    // lead_resubmitted (retired in migration 029): resubmitting the SAME form is a weak
    // signal and easy to inflate. Real re-engagement already scores (a distinct LM fires
    // second_lm/third_lm, a form of another type fires its own signal). points:0 — the
    // column is informational; recompute_lead_score reads the rules, not this value.
    await db.from('lead_events').insert({
      lead_id:     leadId,
      tenant_id:   tenantId,
      type:        'lead_resubmitted',
      description: `Lead re-submitted via intake form (channel: ${channelName})`,
      points:      0,
    })
    // Enrollment is decided below, by submission status (created vs already_submitted).
  } else {
    // ── New lead ──────────────────────────────────────────────────────────────
    // Score starts at 0/new; recompute_lead_score (called at the end, after fit_profile
    // is set and engagement events are logged) is the authoritative source. Writing a
    // channel baseline here would only pollute peak_score before recompute overwrites it.
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
      status:               'new',
      acquisition_channel_id: channelId,
      traffic_source:       resolveTrafficSource(utms),
      traffic_source_detail: Object.keys(utms).length > 0 ? utms : null,
      peak_score:           0,
      current_score:        0,
      // quiz_answers is no longer persisted to metadata — answers now live in
      // form_submissions (see CLAUDE.md → answers contract).
    })

    if (leadError) {
      console.error(JSON.stringify({ service: 'intake-submit', public_id: publicId, error: leadError.message }))
      return err('Submission failed', 500)
    }

    // FASE 2: form_baseline (+10) on the lead's FIRST form — any channel_type. Only on
    // creation (new lead); the existing-lead path never re-emits it (dedup_key guards too).
    await emitFormBaselineOnce(db, leadId, tenantId)

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

  const channelType = channelRow.channel_type as string

  // ── FASE 1: merge fit dimensions (latest-wins) + record intent ────────────────
  // Recognized fit answers update leads.fit_profile, overwriting only the dimensions
  // present in this submission and preserving the rest. The intent is stored on
  // leads.metadata for routing/display. recompute_lead_score (at the end) folds
  // fit_profile into the score. Runs for every channel_type that sends form_answers.
  const intent  = normalizeIntent(parsed.intent)
  const fitDims = extractFitDimensions(intent, parsed.form_answers)
  if (Object.keys(fitDims).length > 0 || intent) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing       = existingLead as any
    const currentProfile = (existing?.fit_profile ?? {}) as Record<string, unknown>
    const currentMeta    = (existing?.metadata ?? {}) as Record<string, unknown>
    const leadUpdate: Record<string, unknown> = {}
    if (Object.keys(fitDims).length > 0) leadUpdate.fit_profile = { ...currentProfile, ...fitDims }
    if (intent)                          leadUpdate.metadata    = { ...currentMeta, intent }
    const { error: fitErr } = await db.from('leads').update(leadUpdate).eq('id', leadId)
    if (fitErr) {
      console.error(JSON.stringify({ service: 'intake-submit', public_id: publicId, lead_id: leadId, error: 'fit_profile_update_failed', detail: fitErr.message }))
    }
  }

  // ── Submission + enrollment + notifications ──────────────────────────────────
  // Two dedup layers: the lead is unique per (tenant_id, email) above; here a
  // SECOND layer dedups the *submission* per (lead_id, channel_id) — but ONLY for
  // lead_magnet & event. Contact-form/manychat/manual keep one submission per submit.
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

      // ── FASE 2: distinct lead-magnet engagement (lead_magnet only) ────────────
      // Count distinct lead_magnet channels this lead has submitted (including the one
      // just inserted): 2nd → second_lm, 3rd → third_lm, otherwise none. The FIRST form
      // (any type) is rewarded by form_baseline on lead creation, so the 1st LM scores
      // no extra event here. Re-submitting the same LM lands in already_submitted (no
      // event). dedup_key makes each tier fire at most once per lead.
      if (channelType === 'lead_magnet') {
        const lmCount = await countDistinctLeadMagnetSubmissions(db, leadId)
        const tier =
          lmCount === 2 ? LM_ENGAGEMENT.second :
          lmCount === 3 ? LM_ENGAGEMENT.third  : null
        if (tier) {
          const { error: lmEvErr } = await db.from('lead_events').insert({
            lead_id: leadId, tenant_id: tenantId, type: tier.type,
            description: tier.description, points: tier.points, dedup_key: tier.type,
          })
          if (lmEvErr) {
            console.error(JSON.stringify({ service: 'intake-submit', public_id: publicId, lead_id: leadId, error: 'lm_engagement_insert_failed', detail: lmEvErr.message }))
          }
        }
      }

      // ── FASE 3: event registration scores as a committed action ───────────────
      if (channelType === 'event') {
        // event_submission (+20) scoring signal — parallel to contact_us_question. No
        // dedup_key: each DISTINCT event the lead registers to scores. Re-registering the
        // SAME event lands in already_submitted above (no new event). Independent of the
        // event_submission Telegram notification below.
        const { error: evScoreErr } = await db.from('lead_events').insert({
          lead_id: leadId, tenant_id: tenantId, type: 'event_submission',
          description: `Registro a evento: ${channelName}`, points: 20,
        })
        if (evScoreErr) {
          console.error(JSON.stringify({ service: 'intake-submit', public_id: publicId, lead_id: leadId, error: 'event_submission_insert_failed', detail: evScoreErr.message }))
        }

        // Telegram notification (unchanged).
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

  // ── FASE 3: recompute score from fit_profile + events (idempotent) ────────────
  // Engagement-event inserts above already trigger recompute, but this final call
  // also covers fit-only submissions (no event fired) and guarantees a consistent end
  // state. recompute_lead_score is a no-op for frozen (post-funnel) leads.
  const { error: recomputeErr } = await db.rpc('recompute_lead_score', { p_lead_id: leadId })
  if (recomputeErr) {
    console.error(JSON.stringify({ service: 'intake-submit', public_id: publicId, lead_id: leadId, error: 'recompute_failed', detail: recomputeErr.message }))
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
