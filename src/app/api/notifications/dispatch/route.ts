import 'server-only'
import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTelegramMessage } from '@/lib/services/telegram'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.itmano.com'

// ── Message formatting ────────────────────────────────────────────────────────

function buildMessage(
  type: string,
  firstName: string,
  lastName: string,
  leadId: string,
  opts: { score?: number | null; channelName?: string; question?: string }
): string {
  const name = `${firstName} ${lastName}`.trim() || 'Lead'
  const url  = `${APP_URL}/leads/${leadId}`

  if (type === 'score_threshold') {
    const score       = opts.score ?? '?'
    const channelLine = opts.channelName ? `\nFuente: ${opts.channelName}` : ''
    return `🔥 <b>Lead caliente</b>\n${name} alcanzó score ${score}/100${channelLine}\n<a href="${url}">Ver lead</a>`
  }

  if (type === 'contact_form_question') {
    const excerpt = opts.question?.trim() || 'Sin mensaje adicional'
    return `📬 <b>Nuevo contacto con pregunta</b>\n${name}\n"${excerpt}"\n<a href="${url}">Ver lead</a>`
  }

  return `📋 <b>Nueva notificación</b>\n${name}\n<a href="${url}">Ver lead</a>`
}

// ── Handler ───────────────────────────────────────────────────────────────────
// Called by the pg_net webhook trigger (notify_telegram_on_insert) after every
// notifications INSERT. Always returns 200 so the pg_net queue stays clean.

export async function POST(request: NextRequest) {
  // Verify webhook secret
  const secret = process.env.NOTIFICATIONS_WEBHOOK_SECRET
  if (!secret) {
    console.error(JSON.stringify({ service: 'notifications-dispatch', error: 'NOTIFICATIONS_WEBHOOK_SECRET not configured' }))
    return new Response(null, { status: 200 })
  }
  const auth = request.headers.get('Authorization')
  if (auth !== `Bearer ${secret}`) {
    console.warn(JSON.stringify({ service: 'notifications-dispatch', result: 'webhook_secret_mismatch' }))
    return new Response(null, { status: 200 })
  }

  // Parse body
  let notificationId: string
  try {
    const body = await request.json()
    if (typeof body.notification_id !== 'string' || !body.notification_id) throw new Error()
    notificationId = body.notification_id
  } catch {
    return new Response(null, { status: 200 })
  }

  const db = createAdminClient()

  // Fetch notification — only process undelivered rows (idempotent)
  const { data: notif } = await db
    .from('notifications')
    .select('id, type, lead_id, message, tenant_id, telegram_sent')
    .eq('id', notificationId)
    .eq('telegram_sent', false)
    .maybeSingle()

  if (!notif) {
    return new Response(null, { status: 200 })
  }

  // Fetch lead and recipient profile in parallel
  const [leadResult, profileResult] = await Promise.all([
    notif.lead_id
      ? db
          .from('leads')
          .select('first_name, last_name, current_score, acquisition_channel_id')
          .eq('id', notif.lead_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from('user_profiles')
      .select('telegram_chat_id')
      .eq('tenant_id', notif.tenant_id)
      .eq('role', 'agent_owner')
      .maybeSingle(),
  ])

  const lead    = leadResult.data
  const profile = profileResult.data

  // No chat_id — mark sent=true to prevent infinite pending state
  if (!profile?.telegram_chat_id) {
    console.log(JSON.stringify({
      service:         'notifications-dispatch',
      notification_id: notif.id,
      result:          'no_telegram_chat_id',
    }))
    await db
      .from('notifications')
      .update({ telegram_sent: true, telegram_sent_at: new Date().toISOString() })
      .eq('id', notif.id)
    return new Response(null, { status: 200 })
  }

  // Resolve channel name for score_threshold (extra query only when needed)
  let channelName = ''
  if (notif.type === 'score_threshold' && lead?.acquisition_channel_id) {
    const { data: channel } = await db
      .from('acquisition_channels')
      .select('name')
      .eq('id', lead.acquisition_channel_id)
      .maybeSingle()
    channelName = channel?.name ?? ''
  }

  const text = buildMessage(
    notif.type,
    lead?.first_name ?? '',
    lead?.last_name  ?? '',
    notif.lead_id    ?? notif.id,
    {
      score:       lead?.current_score,
      channelName,
      question:    notif.message,
    }
  )

  const result = await sendTelegramMessage(profile.telegram_chat_id, text)

  if (result.ok) {
    await db
      .from('notifications')
      .update({ telegram_sent: true, telegram_sent_at: new Date().toISOString() })
      .eq('id', notif.id)
    console.log(JSON.stringify({
      service:         'notifications-dispatch',
      notification_id: notif.id,
      type:            notif.type,
      result:          'sent',
    }))
  } else {
    // Leave telegram_sent=false — future retry sweep (Phase 5)
    console.error(JSON.stringify({
      service:         'notifications-dispatch',
      notification_id: notif.id,
      type:            notif.type,
      result:          'telegram_failed',
      error:           result.error,
    }))
  }

  return new Response(null, { status: 200 })
}
