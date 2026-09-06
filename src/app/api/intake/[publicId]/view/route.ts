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
    console.warn(JSON.stringify({ service: 'intake-view', public_id: publicId, result: 'noop', reason: 'body_not_json' }))
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
    console.warn(JSON.stringify({ service: 'intake-view', public_id: publicId, result: 'noop', reason: 'missing_visitor_id' }))
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
    console.warn(JSON.stringify({ service: 'intake-view', public_id: publicId, result: 'noop', reason: 'channel_not_found_or_inactive' }))
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  // Dedup de vista única: si este mismo visitante (fingerprint estable en
  // localStorage) ya registró una vista de este canal en las últimas 24h, no
  // insertamos otra fila. Así, abrir/recargar el link repetidamente en el mismo
  // navegador cuenta como una sola visita (las métricas ya cuentan visitantes
  // distintos, esto además evita inflar la tabla con recargas y reintentos).
  const dedupSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: recentView } = await db
    .from('channel_page_views')
    .select('id')
    .eq('channel_id', channel.id)
    .eq('visitor_fingerprint', visitorId)
    .gte('created_at', dedupSince)
    .limit(1)
    .maybeSingle()
  if (recentView) {
    console.log(JSON.stringify({ service: 'intake-view', public_id: publicId, channel_id: channel.id, result: 'deduped' }))
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  // Surface insert failures (RLS / validation / schema) — they were being swallowed,
  // which is one reason a visit may not register. We still return 200 (beacon).
  const { error: insertError } = await db.from('channel_page_views').insert({
    channel_id:          channel.id,
    tenant_id:           channel.tenant_id,
    visitor_fingerprint: visitorId,
    traffic_source:      resolveTrafficSource(utms),
    utm_data:            { ...utms, url, referrer, user_agent: userAgent, screen_size: screenSize },
  })

  if (insertError) {
    console.error(JSON.stringify({
      service: 'intake-view', public_id: publicId, channel_id: channel.id,
      result: 'insert_failed', code: insertError.code, detail: insertError.message,
    }))
  } else {
    console.log(JSON.stringify({ service: 'intake-view', public_id: publicId, channel_id: channel.id, result: 'inserted' }))
  }

  return new Response(null, { status: 200, headers: CORS_HEADERS })
}
