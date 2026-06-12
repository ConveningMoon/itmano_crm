import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleContactSubmission } from '@/lib/services/handle-contact-submission'

// ── Contact Us webhook (generic / backup) ────────────────────────────────────────
// Shared-secret endpoint in the `x-contact-secret` header. Kept as a backup/
// alternative to the native Webflow webhook (which validates an HMAC signature).
// Both endpoints share handleContactSubmission. No CORS: server-to-server only.

const SubmitSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name:  z.string().max(100).optional().default(''),
  email:      z.string().email().transform(s => s.toLowerCase().trim()),
  phone:      z.string().max(30).optional(),
  message:    z.string().min(1).max(2000), // the Contact Us question — required
  language:   z.enum(['es', 'en', 'pt']).optional().default('es'),
})

function err(message: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> }
) {
  const { publicId } = await params

  const received = request.headers.get('x-contact-secret')?.trim()

  const db = createAdminClient()

  // ── Resolve channel (needed to read its per-channel secret) ───────────────────
  const { data: channel } = await db
    .from('acquisition_channels')
    .select('id, name, tenant_id, channel_type, agent_id, metadata')
    .eq('public_id', publicId)
    .eq('active', true)
    .maybeSingle()

  if (!channel) return err('Channel not found', 404)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ch = channel as any

  // ── Shared-secret auth ──────────────────────────────────────────────────────
  // Effective secret = per-channel metadata.contact_secret, else the global env
  // var. The existing Contact Us has no per-channel secret → env fallback (unchanged).
  const channelSecret = (ch.metadata?.contact_secret as string | undefined)?.trim()
  const effectiveSecret = channelSecret || process.env.CONTACT_WEBHOOK_SECRET?.trim()
  if (!effectiveSecret) {
    console.error(JSON.stringify({ service: 'contact-submit', path: 'no_secret', public_id: publicId }))
    return err('Server not configured', 500)
  }
  if (received !== effectiveSecret) {
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

  try {
    const result = await handleContactSubmission({
      db,
      channel:    { id: ch.id, tenant_id: ch.tenant_id, name: ch.name, agent_id: ch.agent_id ?? null },
      first_name: parsed.first_name,
      last_name:  parsed.last_name,
      email:      parsed.email,
      phone:      parsed.phone,
      message:    parsed.message,
      language:   parsed.language,
    })
    return NextResponse.json(result.duplicate ? { ok: true, duplicate: true } : { ok: true })
  } catch (e) {
    console.error(JSON.stringify({ service: 'contact-submit', public_id: publicId, error: e instanceof Error ? e.message : 'unknown' }))
    return err('Submission failed', 500)
  }
}
