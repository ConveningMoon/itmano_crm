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

  if (type === 'contact_us') {
    // message already reads "Nueva pregunta de <nombre>: <texto>"
    return `📬 <b>Contact Us</b>\n${body || name}\n<a href="${url}">Ver lead</a>`
  }

  if (type === 'email_replied') {
    return `💬 <b>Email respondido</b>\n${name}\n${body || 'Sin contenido'}\n<a href="${url}">Ver lead</a>`
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

// ── Recipient resolution ──────────────────────────────────────────────────────
// Returns unique, non-null chat_ids to send to.
// Lead-linked notifications: agent's chat_id (if set) + owner's chat_id.
// Admin notifications (agent_id null): owner's chat_id only.
// Deduped so the owner isn't messaged twice if agent IS the owner.

async function resolveChatIds(
  db: ReturnType<typeof createAdminClient>,
  tenantId: string,
  agentId: string | null,
): Promise<string[]> {
  const chatIds: string[] = []

  // 1. Agent's chat_id (only when notification is lead-linked)
  if (agentId) {
    const { data: agentRow } = await db
      .from('agents')
      .select('user_id')
      .eq('id', agentId)
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (agentRow as any)?.user_id as string | null | undefined
    if (userId) {
      const { data: agentProfile } = await db
        .from('user_profiles')
        .select('telegram_chat_id')
        .eq('id', userId)
        .maybeSingle()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const agentChatId = ((agentProfile as any)?.telegram_chat_id as string | null)?.trim() || null
      if (agentChatId) chatIds.push(agentChatId)
    }
  }

  // 2. Owner's chat_id (always; deduped against agent's if they're the same person)
  const { data: ownerProfile } = await db
    .from('user_profiles')
    .select('telegram_chat_id')
    .eq('tenant_id', tenantId)
    .eq('role', 'agent_owner')
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ownerChatId = ((ownerProfile as any)?.telegram_chat_id as string | null)?.trim() || null
  if (ownerChatId && !chatIds.includes(ownerChatId)) chatIds.push(ownerChatId)

  return chatIds
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

  // Fetch notification — only process undelivered rows (idempotent); include agent_id
  const { data: notif } = await db
    .from('notifications')
    .select('id, type, lead_id, agent_id, message, tenant_id, telegram_sent')
    .eq('id', notificationId)
    .eq('telegram_sent', false)
    .maybeSingle()

  if (!notif) {
    console.log(JSON.stringify({ service: 'notifications-dispatch', path: 'not_found_or_sent', notification_id: notificationId }))
    return new Response(null, { status: 200 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const n = notif as any

  // Fetch lead + resolve chat_ids in parallel
  const [leadResult, chatIds] = await Promise.all([
    n.lead_id
      ? db
          .from('leads')
          .select('first_name, last_name, current_score, acquisition_channel_id')
          .eq('id', n.lead_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    resolveChatIds(db, n.tenant_id, n.agent_id ?? null),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lead = (leadResult as any).data

  // No chat_ids — mark sent=true to prevent infinite pending state
  if (chatIds.length === 0) {
    console.log(JSON.stringify({
      service:         'notifications-dispatch',
      path:            'no_chat_ids',
      notification_id: n.id,
      tenant_id:       n.tenant_id,
      agent_id:        n.agent_id ?? null,
    }))
    await db
      .from('notifications')
      .update({ telegram_sent: true, telegram_sent_at: new Date().toISOString() })
      .eq('id', n.id)
    return new Response(null, { status: 200 })
  }

  // Resolve channel name for hot_lead (extra query only when needed)
  let channelName = ''
  if (n.type === 'hot_lead' && lead?.acquisition_channel_id) {
    const { data: channel } = await db
      .from('acquisition_channels')
      .select('name')
      .eq('id', lead.acquisition_channel_id)
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    channelName = (channel as any)?.name ?? ''
  }

  const text = buildMessage(
    n.type,
    lead?.first_name ?? '',
    lead?.last_name  ?? '',
    n.lead_id        ?? n.id,
    {
      score:       lead?.current_score,
      channelName,
      question:    n.message,
      message:     n.message,
    }
  )

  // Send to all recipients; mark sent if at least one delivery succeeded.
  // Partial failure logs the error but doesn't block the other recipient.
  let anySuccess = false
  for (const chatId of chatIds) {
    const result = await sendTelegramMessage(chatId, text)
    if (result.ok) {
      anySuccess = true
      console.log(JSON.stringify({
        service:         'notifications-dispatch',
        path:            'sent',
        notification_id: n.id,
        type:            n.type,
        chat_id_suffix:  chatId.slice(-4),
      }))
    } else {
      console.error(JSON.stringify({
        service:         'notifications-dispatch',
        path:            'telegram_failed',
        notification_id: n.id,
        type:            n.type,
        chat_id_suffix:  chatId.slice(-4),
        error:           result.error,
      }))
    }
  }

  if (anySuccess) {
    await db
      .from('notifications')
      .update({ telegram_sent: true, telegram_sent_at: new Date().toISOString() })
      .eq('id', n.id)
  }
  // If all sends failed: leave telegram_sent=false for future retry sweep (Phase 5)

  return new Response(null, { status: 200 })
}
