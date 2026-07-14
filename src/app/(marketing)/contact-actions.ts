'use server'

import { z } from 'zod'
import { resend } from '@/lib/resend'

const contactSchema = z.object({
  name:    z.string().trim().min(2, 'Ingresa tu nombre.').max(120),
  email:   z.string().trim().email('Ingresa un email válido.').max(200),
  company: z.string().trim().max(160).optional().or(z.literal('')),
  message: z.string().trim().min(10, 'Cuéntanos un poco más — mínimo 10 caracteres.').max(4000),
  // Honeypot: campo oculto para humanos. Si llega con contenido, es un bot —
  // respondemos ok sin enviar nada para no darle señal.
  website: z.string().max(0).optional().or(z.literal('')),
})

export type ContactFormInput = z.input<typeof contactSchema>

export async function submitContactForm(
  input: ContactFormInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = contactSchema.safeParse(input)
  if (!parsed.success) {
    if (parsed.error.issues.some(i => i.path[0] === 'website')) return { ok: true }
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisa los campos del formulario.' }
  }
  const { name, email, company, message, website } = parsed.data
  if (website) return { ok: true }

  const to = process.env.CONTACT_FORM_TO
  const from = process.env.CONTACT_FORM_FROM
  if (!to || !from) {
    console.error(JSON.stringify({ service: 'marketing-contact', error: 'missing_env', detail: 'CONTACT_FORM_TO / CONTACT_FORM_FROM not set' }))
    return { ok: false, error: 'El formulario no está disponible en este momento. Escríbenos directamente a contacto@itmano.com.' }
  }

  const lines = [
    `Nombre: ${name}`,
    `Email: ${email}`,
    company ? `Agencia / empresa: ${company}` : null,
    '',
    'Mensaje:',
    message,
  ].filter((l): l is string => l !== null)

  try {
    const { error } = await resend.emails.send({
      from,
      to,
      replyTo: email,
      subject: `Nuevo contacto en la landing — ${name}${company ? ` · ${company}` : ''}`,
      text: lines.join('\n'),
    })
    if (error) {
      console.error(JSON.stringify({ service: 'marketing-contact', error: 'resend_failed', detail: error.message }))
      return { ok: false, error: 'No pudimos enviar tu mensaje. Inténtalo de nuevo en unos minutos.' }
    }
  } catch (err) {
    console.error(JSON.stringify({ service: 'marketing-contact', error: 'resend_threw', detail: err instanceof Error ? err.message : 'unknown' }))
    return { ok: false, error: 'No pudimos enviar tu mensaje. Inténtalo de nuevo en unos minutos.' }
  }

  return { ok: true }
}
