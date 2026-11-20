import { NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { withHeartbeat } from '@/lib/ops/heartbeat'
import { createAdminClient } from '@/lib/supabase/admin'
import { resendForAccount } from '@/lib/resend'
import { buildAuthEmails, hookSecretForSvix, type SendEmailHookPayload } from '@/lib/auth/send-email-hook'
import { quotaErrorKind } from '@/lib/email/quota'

// Send Email Hook de Supabase Auth (fase 3 del plan SaaS). Supabase llama aquí
// en vez de usar su SMTP cada vez que necesita mandar un Magic Link (u otro
// correo de Auth). Es un sistema externo: por eso es un route handler.
//
// Contrato (https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook):
//   · Firma Standard Webhooks (webhook-id / -timestamp / -signature) con el
//     secreto del hook, "v1,whsec_…", en SEND_EMAIL_HOOK_SECRET.
//   · 200 = enviado. Cualquier otro status hace fallar el login con un 5xx,
//     que la pantalla de login ya explica ("problema temporal del correo").
//
// Los correos salen SIEMPRE por la cuenta de Resend de ITMANO: son de la
// plataforma, no de un tenant, y su cuota es la que se vigila en el panel.

const AUTH_EMAIL_FROM_DEFAULT = 'ITMANO <acceso@mail.itmano.com>'

function hookError(status: number, message: string) {
  return NextResponse.json({ error: { http_code: status, message } }, { status })
}

async function handler(request: Request): Promise<Response> {
  const rawSecret = process.env.SEND_EMAIL_HOOK_SECRET?.trim()
  if (!rawSecret) {
    console.error(JSON.stringify({ service: 'auth-send-email', error: 'hook_secret_missing' }))
    return hookError(500, 'El hook de correo no está configurado.')
  }

  const body = await request.text()
  let payload: SendEmailHookPayload
  let hookId: string
  try {
    const headers = Object.fromEntries(request.headers)
    payload = new Webhook(hookSecretForSvix(rawSecret)).verify(body, headers) as SendEmailHookPayload
    hookId = request.headers.get('webhook-id') ?? request.headers.get('svix-id') ?? ''
  } catch {
    return hookError(401, 'Firma inválida.')
  }

  const action = payload.email_data?.email_action_type ?? 'unknown'
  const db = createAdminClient()
  const log = (row: { ok: boolean; resend_email_id?: string | null; error?: string | null }) =>
    db.from('auth_email_sends').insert({
      action_type:     action,
      user_id:         payload.user?.id ?? null,
      resend_email_id: row.resend_email_id ?? null,
      ok:              row.ok,
      error:           row.error?.slice(0, 500) ?? null,
    }).then(({ error }) => {
      if (error) console.error(JSON.stringify({ service: 'auth-send-email', error: 'log_insert_failed', detail: error.message }))
    })

  const emails = buildAuthEmails(payload)
  if (emails.length === 0) {
    // Avisos de Auth (`*_notification`) que nadie activó: no hay plantilla.
    console.warn(JSON.stringify({ service: 'auth-send-email', warning: 'action_not_sent', action }))
    return NextResponse.json({})
  }

  const from = process.env.AUTH_EMAIL_FROM?.trim() || AUTH_EMAIL_FROM_DEFAULT
  const client = resendForAccount('itmano')
  for (const [i, email] of emails.entries()) {
    // Idempotente por entrega del hook: un reintento de Supabase con el mismo
    // webhook-id no manda el correo dos veces.
    const { data, error } = await client.emails.send(
      { from, to: email.to, subject: email.subject, html: email.html, text: email.text },
      hookId ? { idempotencyKey: `auth/${hookId}/${i}` } : undefined,
    )
    if (error || !data?.id) {
      const message = error?.message ?? 'Resend no devolvió id'
      await log({ ok: false, error: message })
      console.error(JSON.stringify({ service: 'auth-send-email', error: 'send_failed', action, quota: quotaErrorKind(error), detail: message }))
      return hookError(500, 'No se pudo enviar el correo de acceso.')
    }
    await log({ ok: true, resend_email_id: data.id })
  }

  return NextResponse.json({})
}

export const POST = withHeartbeat('webhook:auth-email', handler)
