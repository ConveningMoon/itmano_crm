import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTelegramMessage } from '@/lib/services/telegram'

// Solicitudes de plataforma (migración 057): el formulario de contacto de la
// landing y el soporte del CRM ya no salen por email — se guardan en
// platform_requests y el super_admin las gestiona en /solicitudes. El aviso
// inmediato va por Telegram al chat del super_admin (user_profiles con
// role='super_admin' y telegram_chat_id configurado).

export type PlatformRequestKind = 'contact' | 'support' | 'page'

export interface NewPlatformRequest {
  kind:            PlatformRequestKind
  tenant_id?:      string | null
  tenant_name?:    string | null
  requester_name?: string | null
  requester_email: string
  requester_role?: string | null
  company?:        string | null
  category?:       string | null
  subject?:        string | null
  message:         string
  metadata?:       Record<string, unknown>
}

async function superAdminChatIds(db: ReturnType<typeof createAdminClient>): Promise<string[]> {
  const { data } = await db
    .from('user_profiles')
    .select('telegram_chat_id')
    .eq('role', 'super_admin')
  return [...new Set(
    ((data ?? []) as { telegram_chat_id: string | null }[])
      .map(r => r.telegram_chat_id?.trim())
      .filter((id): id is string => !!id)
  )]
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.itmano.com'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildTelegramText(req: NewPlatformRequest): string {
  const SNIPPET = 300
  const snippet = req.message.length > SNIPPET ? `${req.message.slice(0, SNIPPET)}…` : req.message
  const lines: string[] = []
  if (req.kind === 'contact') {
    lines.push('📥 <b>Nuevo contacto en la landing</b>')
    lines.push(esc([req.requester_name, req.company].filter(Boolean).join(' · ') || req.requester_email))
    lines.push(esc(req.requester_email))
  } else if (req.kind === 'page') {
    lines.push('🎨 <b>Solicitud de creación de página</b>')
    if (req.tenant_name) lines.push(esc(req.tenant_name))
    lines.push(esc(req.requester_email))
  } else {
    lines.push(req.category === 'ai_capacity'
      ? '🤖 <b>Solicitud de más capacidad de IA</b>'
      : '🛟 <b>Nueva solicitud de soporte</b>')
    if (req.tenant_name) lines.push(esc(req.tenant_name))
    lines.push(esc(`${req.requester_email}${req.requester_role ? ` · ${req.requester_role}` : ''}`))
  }
  if (req.subject) lines.push(`<b>${esc(req.subject)}</b>`)
  lines.push(`"${esc(snippet)}"`)
  lines.push(`<a href="${APP_URL}/solicitudes">Ver solicitudes</a>`)
  return lines.join('\n')
}

// Inserta la solicitud y avisa por Telegram (best-effort: un fallo de Telegram
// no invalida la solicitud ya guardada).
export async function createPlatformRequest(
  req: NewPlatformRequest,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = createAdminClient()

  const { error } = await db.from('platform_requests').insert({
    kind:            req.kind,
    tenant_id:       req.tenant_id ?? null,
    tenant_name:     req.tenant_name ?? null,
    requester_name:  req.requester_name ?? null,
    requester_email: req.requester_email,
    requester_role:  req.requester_role ?? null,
    company:         req.company ?? null,
    category:        req.category ?? null,
    subject:         req.subject ?? null,
    message:         req.message,
    metadata:        req.metadata ?? {},
  })

  if (error) {
    console.error(JSON.stringify({ service: 'platform-requests', error: 'insert_failed', detail: error.message }))
    return { ok: false, error: 'No pudimos registrar tu solicitud. Inténtalo de nuevo en unos minutos.' }
  }

  try {
    const chatIds = await superAdminChatIds(db)
    const text = buildTelegramText(req)
    for (const chatId of chatIds) {
      await sendTelegramMessage(chatId, text)
    }
  } catch (err) {
    console.error(JSON.stringify({ service: 'platform-requests', error: 'telegram_failed', detail: String(err) }))
  }

  return { ok: true }
}
