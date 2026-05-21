import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CORS_HEADERS, corsOptions } from '@/app/api/intake/cors'

export function OPTIONS() {
  return corsOptions()
}

// ── UTM → traffic_source ──────────────────────────────────────────────────────
// Values must match the check constraint on leads.traffic_source.

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

// ── Handler ───────────────────────────────────────────────────────────────────
// Accepts text/plain bodies (sendBeacon) so the request is treated as a simple
// CORS request — no preflight triggered. Body is JSON-serialised text.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> }
) {
  const { publicId } = await params

  // Parse text/plain body as JSON
  let payload: Record<string, unknown>
  try {
    const raw = await request.text()
    payload = JSON.parse(raw)
  } catch {
    // Beacon payloads can't be retried by the browser — return 200 always
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  const utms        = (typeof payload.utms === 'object' && payload.utms !== null)
    ? payload.utms as Record<string, string>
    : {}
  const visitorId   = typeof payload.visitor_id === 'string' ? payload.visitor_id : null
  const url         = typeof payload.url         === 'string' ? payload.url        : null
  const referrer    = typeof payload.referrer    === 'string' ? payload.referrer   : null
  const userAgent   = typeof payload.user_agent  === 'string' ? payload.user_agent : null
  const screenSize  = payload.screen_size ?? null

  if (!visitorId) {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  const db = createAdminClient()

  const { data: channel } = await db
    .from('acquisition_channels')
    .select('id, tenant_id')
    .eq('public_id', publicId)
    .eq('active', true)
    .maybeSingle()

  // Don't error on unknown channels — the beacon can't retry
  if (!channel) {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  await db.from('channel_page_views').insert({
    channel_id:          channel.id,
    tenant_id:           channel.tenant_id,
    visitor_fingerprint: visitorId,
    traffic_source:      resolveTrafficSource(utms),
    utm_data:            { ...utms, url, referrer, user_agent: userAgent, screen_size: screenSize },
  })

  return new Response(null, { status: 200, headers: CORS_HEADERS })
}
