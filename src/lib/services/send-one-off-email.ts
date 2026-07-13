import 'server-only'
import { resend } from '@/lib/resend'
import type { createAdminClient } from '@/lib/supabase/admin'
import { generateUnsubscribeUrl } from '@/lib/services/unsubscribe-url'
import { renderEmail, type EmailLocale } from '@/lib/services/email-render'
import type { EmailContent } from '@/lib/email-content'

const BLOCK_LABEL: Record<string, string> = {
  unsubscribed:   'el lead canceló su suscripción',
  hard_bounce:    'la dirección rebotó (hard bounce)',
  spam_complaint: 'el lead marcó un correo como spam',
}

// Envía un correo puntual (one-off) a un lead individual desde el CRM. A
// diferencia de secuencias/compra, es un envío manual único iniciado por el
// agente. Inserta una fila en email_sends para que el webhook de Resend siga
// atribuyendo clicks/replies al scoring, y un lead_event para el timeline.
export async function sendOneOffEmail(
  db: ReturnType<typeof createAdminClient>,
  params: { leadId: string; tenantId: string; subject: string; content: EmailContent },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { leadId, tenantId, subject, content } = params

  // Lead + agente asignado (para la firma).
  const { data: lead } = await db
    .from('leads')
    .select('id, first_name, email, language, email_blocked, email_blocked_reason, agents (name, email)')
    .eq('id', leadId)
    .maybeSingle()
  if (!lead) return { ok: false, error: 'Lead no encontrado.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const l = lead as any
  if (l.email_blocked) {
    const reason = BLOCK_LABEL[l.email_blocked_reason as string] ?? 'el canal de email está bloqueado'
    return { ok: false, error: `No se puede enviar: ${reason}.` }
  }
  const leadEmail = l.email as string | null
  if (!leadEmail) return { ok: false, error: 'El lead no tiene email.' }

  const agent      = Array.isArray(l.agents) ? l.agents[0] : l.agents
  const agentName  = (agent?.name as string | undefined) ?? ''
  const agentEmail = (agent?.email as string | undefined) ?? ''
  const language   = (['es', 'en', 'pt'].includes(l.language as string) ? l.language : 'es') as EmailLocale

  // Tenant: from address + branding.
  const { data: tenant } = await db
    .from('tenants')
    .select('email_from_address, name, primary_color')
    .eq('id', tenantId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = tenant as any
  const fromAddress = t?.email_from_address as string | null
  if (!fromAddress) {
    return { ok: false, error: 'El equipo no tiene una dirección de envío configurada.' }
  }

  const unsubscribeUrl = generateUnsubscribeUrl(leadId)
  const rendered = renderEmail({
    subject,
    content,
    vars: {
      customer_name:    (l.first_name as string) ?? '',
      agent_name:       agentName,
      agent_email:      agentEmail,
      lead_magnet_name: '',
    },
    branding:       { tenantName: (t?.name as string) ?? '', primaryColor: (t?.primary_color as string) ?? '#1E3A5F' },
    signature:      agentName ? { agentName, agentEmail } : null,
    unsubscribeUrl,
    locale:         language,
  })

  const listUnsubscribeHeaders = {
    'List-Unsubscribe':      `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }

  let resendEmailId: string
  try {
    const { data, error } = await resend.emails.send({
      from:    fromAddress,
      to:      leadEmail,
      headers: listUnsubscribeHeaders,
      subject: rendered.subject,
      html:    rendered.html,
    })
    if (error || !data?.id) {
      return { ok: false, error: `No se pudo enviar el correo: ${error?.message ?? 'Resend no devolvió id'}` }
    }
    resendEmailId = data.id
  } catch (err) {
    return { ok: false, error: `No se pudo enviar el correo: ${err instanceof Error ? err.message : 'error desconocido'}` }
  }

  // email_sends → atribución de clicks/replies por el webhook. Best-effort.
  const { error: sendRowErr } = await db.from('email_sends').insert({
    tenant_id:          tenantId,
    lead_id:            leadId,
    sequence_run_id:    null,
    step_order:         null,
    resend_email_id:    resendEmailId,
    resend_template_id: null,
    send_type:          'one_off',
    subject:            rendered.subject,
    sent_at:            new Date().toISOString(),
  })
  if (sendRowErr) {
    console.error(JSON.stringify({ service: 'send-one-off-email', lead_id: leadId, error: 'email_sends_insert_failed', detail: sendRowErr.message }))
  }

  // Timeline (points 0 — no afecta el scoring).
  await db.from('lead_events').insert({
    lead_id:       leadId,
    tenant_id:     tenantId,
    type:          'manual_email_sent',
    description:   `Email enviado: ${rendered.subject}`,
    points:        0,
    actor_user_id: null,
  })

  return { ok: true }
}
