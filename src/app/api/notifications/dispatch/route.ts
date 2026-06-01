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
  opts: { score?: number | null; channelName?: string; question?: string; message?: string }
): string {
  const name = `${firstName} ${lastName}`.trim() || 'Lead'
  const url  = `${APP_URL}/leads/${leadId}`
  const body = opts.message?.trim() || ''

  // Lead-linked notifications (have a live lead → include a "Ver lead" link)
  if (type === 'hot_lead') {
    const score       = opts.score ?? '?'
    const channelLine = opts.channelName ? `\nFuente: ${opts.channelName}` : ''
    return `🔥 <b>Lead caliente</b>\n${name} alcanzó score ${score}/100${channelLine}\n<a href="${url}">Ver lead</a>`
  }

  if (type === 'contact_form_question') {
    const excerpt = opts.question?.trim() || 'Sin mensaje adicional'
    return `📬 <b>Nuevo contacto con pregunta</b>\n${name}\n"${excerpt}"\n<a href="${url}">Ver lead</a>`
  }

  // Self-contained notifications (no live lead → message body carries everything)
  if (type === 'lead_deleted') {
    return `🗑️ <b>Lead eliminado</b>\n${body || name}`
  }
  if (type === 'event_added') {
    return `📅 <b>Nuevo evento</b>\n${body}`
  }
  if (type === 'event_deleted') {
    return `🗑️ <b>Evento archivado</b>\n${body}`
  }
  if (type === 'lm_added') {
    return `📄 <b>Nuevo lead magnet</b>\n${body}`
  }
  if (type === 'lm_deleted') {
    return `🗑️ <b>Lead magnet archivado</b>\n${body}`
  }

  return `📋 <b>Nueva notificación</b>\n${body || name}`
}

// ── Handler ───────────────────────────────────────────────────────────────────
// Called by the pg_net webhook trigger (notify_telegram_on_insert) after every
// notifications INSERT. Always returns 200 so the pg_net queue stays clean.

export async function POST(request: NextRequest) {
  // Verify webhook secret — trim guards against copy-paste whitespace in env/Vault
  const secret = process.env.NOTIFICATIONS_WEBHOOK_SECRET?.trim()
  if (!secret) {
    console.error(JSON.stringify({ service: 'notifications-dispatch', path: 'no_secret' }))
    return new Response(null, { status: 200 })
  }
  const received = request.headers.get('authorization')?.trim()
  const expected = `Bearer ${secret}`
  if (received !== expected) {
    console.warn(JSON.stringify({ service: 'notifications-dispatch', path: 'secret_mismatch', received_length: received?.length ?? 0, expected_length: expected.length }))
    return new Response(null, { status: 200 })
  }

  // Parse body
  let notificationId: string
  try {
    const body = await request.json()
    if (typeof body.notification_id !== 'string' || !body.notification_id) throw new Error()
    notificationId = body.notification_id
  } catch {
    console.warn(JSON.stringify({ service: 'notifications-dispatch', path: 'invalid_body' }))
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
    console.log(JSON.stringify({ service: 'notifications-dispatch', path: 'not_found_or_sent', notification_id: notificationId }))
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

  const lead   = leadResult.data
  const profile = profileResult.data

  // Trim chat_id to guard against whitespace artifacts
  const chatId = profile?.telegram_chat_id?.trim() || null

  // No chat_id — mark sent=true to prevent infinite pending state
  if (!chatId) {
    console.log(JSON.stringify({
      service:         'notifications-dispatch',
      path:            'no_chat_id',
      notification_id: notif.id,
      tenant_id:       notif.tenant_id,
    }))
    await db
      .from('notifications')
      .update({ telegram_sent: true, telegram_sent_at: new Date().toISOString() })
      .eq('id', notif.id)
    return new Response(null, { status: 200 })
  }

  // Resolve channel name for hot_lead (extra query only when needed)
  let channelName = ''
  if (notif.type === 'hot_lead' && lead?.acquisition_channel_id) {
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
      message:     notif.message,
    }
  )

  const result = await sendTelegramMessage(chatId, text)

  if (result.ok) {
    await db
      .from('notifications')
      .update({ telegram_sent: true, telegram_sent_at: new Date().toISOString() })
      .eq('id', notif.id)
    console.log(JSON.stringify({
      service:         'notifications-dispatch',
      path:            'sent',
      notification_id: notif.id,
      type:            notif.type,
    }))
  } else {
    // Leave telegram_sent=false — future retry sweep (Phase 5)
    console.error(JSON.stringify({
      service:         'notifications-dispatch',
      path:            'telegram_failed',
      notification_id: notif.id,
      type:            notif.type,
      error:           result.error,
    }))
  }

  return new Response(null, { status: 200 })
}
