import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Contact Us webhook ──────────────────────────────────────────────────────────
// Called server-to-server by Zapier (A&J's Webflow Contact Us form → Zapier → here).
// Auth is a shared secret in the `x-contact-secret` header (Zapier sends it as a
// custom header) — more than the non-guessable public_id alone, since this endpoint
// creates leads. No CORS: there is no browser caller.

const SubmitSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name:  z.string().max(100).optional().default(''),
  email:      z.string().email().transform(s => s.toLowerCase().trim()),
  phone:      z.string().max(30).optional(),
  message:    z.string().min(1).max(2000), // the Contact Us question — required
  language:   z.enum(['es', 'en', 'pt']).optional().default('es'),
})

// Baseline score for a contact-form lead (from the lead scoring model in CLAUDE.md).
// The +20 from the 'contact_us_question' event is applied separately by the
// apply_lead_event_scoring trigger — do NOT hand-adjust the score here.
const CONTACT_BASELINE = 20

function scoreToStatus(score: number): string {
  if (score >= 60) return 'hot'
  if (score >= 35) return 'warm'
  if (score >= 15) return 'nurturing'
  return 'new'
}

function ok(extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ ok: true, ...extra })
}

function err(message: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> }
) {
  const { publicId } = await params

  // ── Shared-secret auth ──────────────────────────────────────────────────────
  const secret = process.env.CONTACT_WEBHOOK_SECRET?.trim()
  if (!secret) {
    console.error(JSON.stringify({ service: 'contact-submit', path: 'no_secret' }))
    return err('Server not configured', 500)
  }
  const received = request.headers.get('x-contact-secret')?.trim()
  if (received !== secret) {
    console.warn(JSON.stringify({ service: 'contact-submit', path: 'secret_mismatch', public_id: publicId }))
    return err('Unauthorized', 401)
  }

  // ── Parse + validate ──────────────────────────────────────────────────────────
  let parsed: z.infer<typeof SubmitSchema>
  try {
    const result = SubmitSchema.safeParse(await request.json())
    if (!result.success) {
      const issues = result.error.issues.map(i => ({ field: i.path.join('.') || '(root)', message: i.message }))
      console.warn(JSON.stringify({ service: 'contact-submit', result: 'validation_failed', public_id: publicId, issues }))
      return NextResponse.json({ ok: false, error: 'Invalid request', issues }, { status: 400 })
    }
    parsed = result.data
  } catch {
    return err('Invalid request', 400)
  }

  const db = createAdminClient()

  // ── Resolve channel ─────────────────────────────────────────────────────────
  const { data: channel } = await db
    .from('acquisition_channels')
    .select('id, name, tenant_id, channel_type')
    .eq('public_id', publicId)
    .eq('active', true)
    .maybeSingle()

  if (!channel) return err('Channel not found', 404)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRow = channel as any
  const tenantId    = channelRow.tenant_id as string
  const channelId   = channelRow.id as string
  const channelName = channelRow.name as string

  // ── Resolve agent — language-based, Melanie (first_buyer) is manual-only ──────
  let agentId: string | null = null
  {
    const { data: agent } = await db
      .from('agents')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('language', parsed.language)
      .neq('specialty', 'first_buyer')
      .limit(1)
      .maybeSingle()
    agentId = agent?.id ?? null
  }
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
    console.error(JSON.stringify({ service: 'contact-submit', public_id: publicId, error: 'no_agent_found' }))
    return err('Configuration error', 500)
  }

  // ── Dedup by (tenant_id, email) — same pattern as intake submit ──────────────
  const { data: existingLead } = await db
    .from('leads')
    .select('id, first_name, last_name, phone, language')
    .eq('tenant_id', tenantId)
    .eq('email', parsed.email)
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
    if (parsed.first_name && parsed.first_name !== existing.first_name) updates.first_name = parsed.first_name
    if (parsed.last_name  && parsed.last_name  !== existing.last_name)  updates.last_name  = parsed.last_name
    if (parsed.phone      && parsed.phone      !== existing.phone)      updates.phone      = parsed.phone
    if (parsed.language   && parsed.language   !== existing.language)   updates.language   = parsed.language
    if (Object.keys(updates).length > 0) {
      await db.from('leads').update(updates).eq('id', leadId)
    }
  } else {
    leadId = crypto.randomUUID()
    const { error: leadError } = await db.from('leads').insert({
      id:                     leadId,
      tenant_id:              tenantId,
      agent_id:               agentId,
      first_name:             parsed.first_name,
      last_name:              parsed.last_name,
      email:                  parsed.email,
      phone:                  parsed.phone ?? null,
      language:               parsed.language,
      status:                 scoreToStatus(CONTACT_BASELINE),
      acquisition_channel_id: channelId,
      traffic_source:         'contact_form',
      peak_score:             CONTACT_BASELINE,
      current_score:          CONTACT_BASELINE,
    })
    if (leadError) {
      console.error(JSON.stringify({ service: 'contact-submit', public_id: publicId, error: leadError.message }))
      return err('Submission failed', 500)
    }
  }

  // ── Always log the question as a scoring event ───────────────────────────────
  // Each question is its own event (dedup_key null). The apply_lead_event_scoring
  // trigger applies the +20 from lead_score_rules and may auto-promote / notify.
  const { error: eventError } = await db.from('lead_events').insert({
    lead_id:     leadId,
    tenant_id:   tenantId,
    type:        'contact_us_question',
    description: parsed.message.slice(0, 2000),
    points:      20,
    metadata:    { channel_id: channelId, source: 'contact_us' },
  })
  if (eventError) {
    console.error(JSON.stringify({ service: 'contact-submit', public_id: publicId, lead_id: leadId, error: 'event_insert_failed', detail: eventError.message }))
  }

  // ── Notify Telegram via the notifications webhook trigger ─────────────────────
  const name = `${parsed.first_name} ${parsed.last_name}`.trim() || 'Lead'
  const { error: notifError } = await db.from('notifications').insert({
    tenant_id: tenantId,
    type:      'contact_us',
    lead_id:   leadId,
    message:   `Nueva pregunta de ${name}: ${parsed.message.slice(0, 100)}`,
  })
  if (notifError) {
    console.error(JSON.stringify({ service: 'contact-submit', public_id: publicId, lead_id: leadId, error: 'notification_insert_failed', detail: notifError.message }))
  }

  console.log(JSON.stringify({
    service:   'contact-submit',
    public_id: publicId,
    lead_id:   leadId,
    tenant_id: tenantId,
    channel:   channelName,
    duplicate,
  }))

  return ok(duplicate ? { duplicate: true } : undefined)
}
