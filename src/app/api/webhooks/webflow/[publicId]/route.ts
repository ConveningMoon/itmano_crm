import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleContactSubmission } from '@/lib/services/handle-contact-submission'

// ── Native Webflow webhook receiver ───────────────────────────────────────────
// Webflow (Site settings → Forms → Webhooks) POSTs form submissions here and signs
// each request with an HMAC-SHA256 of `${x-webflow-timestamp}:${rawBody}` (hex),
// keyed by the webhook secret. We validate the signature + anti-replay window,
// map Webflow's arbitrary field keys, then delegate to handleContactSubmission.
// Algorithm verified against https://developers.webflow.com/data/docs/working-with-webhooks
// No CORS — Webflow posts server-to-server.

const REPLAY_WINDOW_MS = 5 * 60 * 1000 // 5 minutes (per Webflow docs)

// Form name we process. Submissions from any other form are acknowledged (200)
// but ignored, so Webflow does not retry them. Override via env if needed.
const EXPECTED_FORM_NAME = process.env.WEBFLOW_CONTACT_FORM_NAME ?? 'Contact Us'

function err(message: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status })
}

// First non-empty string value across a set of candidate keys (case-insensitive).
function pick(data: Record<string, unknown>, keys: string[]): string {
  const lower: Record<string, unknown> = {}
  for (const k of Object.keys(data)) lower[k.toLowerCase().trim()] = data[k]
  for (const k of keys) {
    const v = lower[k.toLowerCase().trim()]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number') return String(v)
  }
  return ''
}

function normalizeLanguage(raw: string): 'es' | 'en' | 'pt' {
  const v = raw.toLowerCase().trim()
  if (v.startsWith('en') || v.includes('ingl')) return 'en'
  if (v.startsWith('pt') || v.includes('portug')) return 'pt'
  return 'es'
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> }
) {
  const { publicId } = await params

  // ── Signature config ──────────────────────────────────────────────────────────
  const secret = process.env.WEBFLOW_WEBHOOK_SECRET?.trim()
  if (!secret) {
    console.error(JSON.stringify({ service: 'webflow-webhook', path: 'no_secret', public_id: publicId }))
    return err('Server not configured', 500)
  }

  // ── Raw body (needed for exact HMAC) ──────────────────────────────────────────
  const rawBody   = await request.text()
  const signature = request.headers.get('x-webflow-signature')?.trim() ?? ''
  const timestamp = request.headers.get('x-webflow-timestamp')?.trim() ?? ''

  if (!signature || !timestamp) {
    console.warn(JSON.stringify({ service: 'webflow-webhook', path: 'missing_signature_headers', public_id: publicId }))
    return err('Unauthorized', 401)
  }

  // Anti-replay — reject requests older than the window (timestamp is epoch ms).
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) {
    console.warn(JSON.stringify({ service: 'webflow-webhook', path: 'stale_timestamp', public_id: publicId, timestamp }))
    return err('Unauthorized', 401)
  }

  // HMAC-SHA256 over `${timestamp}:${rawBody}`, hex, timing-safe compare.
  const expected   = createHmac('sha256', secret).update(`${timestamp}:${rawBody}`).digest('hex')
  const sigBuf     = Buffer.from(signature, 'hex')
  const expBuf     = Buffer.from(expected, 'hex')
  const signatureValid = sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)
  if (!signatureValid) {
    console.warn(JSON.stringify({ service: 'webflow-webhook', path: 'signature_mismatch', public_id: publicId }))
    return err('Unauthorized', 401)
  }

  // ── Parse JSON ────────────────────────────────────────────────────────────────
  let body: { triggerType?: string; payload?: { name?: string; data?: Record<string, unknown>; formResponse?: Record<string, unknown> } }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return err('Invalid JSON', 400)
  }

  const payload = body.payload ?? {}

  // Only handle form submissions for the expected form; ack everything else.
  if (body.triggerType && body.triggerType !== 'form_submission') {
    return NextResponse.json({ ok: true, ignored: true, reason: 'trigger_type' })
  }
  if ((payload.name ?? '').trim() !== EXPECTED_FORM_NAME) {
    console.log(JSON.stringify({ service: 'webflow-webhook', path: 'ignored_form', public_id: publicId, form: payload.name }))
    return NextResponse.json({ ok: true, ignored: true, reason: 'form_name' })
  }

  // ── Map Webflow field keys (arbitrary) → our schema ───────────────────────────
  const data = (payload.data ?? payload.formResponse ?? {}) as Record<string, unknown>

  const firstName = pick(data, ['First Name', 'Nombre', 'first_name', 'firstName', 'Name', 'name', 'Full Name', 'Nombre completo'])
  const lastName  = pick(data, ['Last Name', 'Apellido', 'last_name', 'lastName'])
  const email     = pick(data, ['Email', 'email', 'E-mail', 'Correo', 'Correo electrónico', 'Correo electronico'])
  const phone     = pick(data, ['Phone', 'Teléfono', 'Telefono', 'phone', 'Phone Number', 'Telefono celular'])
  const message   = pick(data, ['Message', 'Mensaje', 'message', 'Pregunta', 'Comentarios', 'Comentario', 'How can we help?', '¿Cómo podemos ayudarte?'])
  const langRaw   = pick(data, ['Language', 'Idioma', 'language', 'lang'])

  if (!email || !message) {
    console.warn(JSON.stringify({ service: 'webflow-webhook', path: 'missing_required', public_id: publicId, has_email: !!email, has_message: !!message, keys: Object.keys(data) }))
    return err('Missing required fields (email, message)', 400)
  }

  const db = createAdminClient()

  // ── Resolve channel (must be a contact_form) ──────────────────────────────────
  const { data: channel } = await db
    .from('acquisition_channels')
    .select('id, name, tenant_id, channel_type')
    .eq('public_id', publicId)
    .eq('active', true)
    .maybeSingle()

  if (!channel) return err('Channel not found', 404)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ch = channel as any
  if (ch.channel_type !== 'contact_form') {
    return err('Channel is not a contact form', 404)
  }

  try {
    const result = await handleContactSubmission({
      db,
      channel:    { id: ch.id, tenant_id: ch.tenant_id, name: ch.name },
      first_name: firstName || 'Lead',
      last_name:  lastName,
      email,
      phone:      phone || undefined,
      message,
      language:   normalizeLanguage(langRaw),
    })
    return NextResponse.json(result.duplicate ? { ok: true, duplicate: true } : { ok: true })
  } catch (e) {
    console.error(JSON.stringify({ service: 'webflow-webhook', public_id: publicId, error: e instanceof Error ? e.message : 'unknown' }))
    return err('Submission failed', 500)
  }
}
