import 'server-only'
import { resend } from '@/lib/resend'

// Envío de solicitudes internas del CRM a soporte de ITMANO (support@itmano.com):
// el formulario de soporte técnico y la solicitud de más capacidad de IA. A
// diferencia de los correos a leads (que salen del dominio del tenant), estos
// van al buzón interno de ITMANO, así que pueden incluir datos internos (plan,
// gasto de IA en USD) — nunca se muestran al cliente, solo viajan en el correo.

const SUPPORT_TO   = process.env.SUPPORT_FORM_TO   ?? 'support@itmano.com'
const SUPPORT_FROM = process.env.SUPPORT_FORM_FROM ?? process.env.CONTACT_FORM_FROM ?? null

export async function sendSupportEmail(params: {
  subject: string
  lines:   string[]
  replyTo?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!SUPPORT_FROM) {
    console.error(JSON.stringify({ service: 'support-email', error: 'missing_from', detail: 'SUPPORT_FORM_FROM / CONTACT_FORM_FROM not set' }))
    return { ok: false, error: 'El envío no está disponible en este momento. Escríbenos directamente a support@itmano.com.' }
  }

  try {
    const { error } = await resend.emails.send({
      from:    SUPPORT_FROM,
      to:      SUPPORT_TO,
      replyTo: params.replyTo,
      subject: params.subject,
      text:    params.lines.join('\n'),
    })
    if (error) {
      console.error(JSON.stringify({ service: 'support-email', error: 'resend_failed', detail: error.message }))
      return { ok: false, error: 'No pudimos enviar tu solicitud. Inténtalo de nuevo en unos minutos.' }
    }
  } catch (err) {
    console.error(JSON.stringify({ service: 'support-email', error: 'resend_threw', detail: err instanceof Error ? err.message : 'unknown' }))
    return { ok: false, error: 'No pudimos enviar tu solicitud. Inténtalo de nuevo en unos minutos.' }
  }

  return { ok: true }
}
