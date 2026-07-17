'use server'

import { z } from 'zod'
import { createPlatformRequest } from '@/lib/services/platform-requests'

// El formulario de la landing es anónimo, así que no puede salir por Resend
// con un remitente propio: se registra como platform_request (kind='contact')
// en el CRM — el super_admin lo gestiona en /solicitudes y recibe el aviso
// por Telegram al instante.

const contactSchema = z.object({
  name:    z.string().trim().min(2, 'Ingresa tu nombre.').max(120),
  email:   z.string().trim().email('Ingresa un email válido.').max(200),
  company: z.string().trim().max(160).optional().or(z.literal('')),
  message: z.string().trim().min(10, 'Cuéntanos un poco más — mínimo 10 caracteres.').max(4000),
  // Honeypot: campo oculto para humanos. Si llega con contenido, es un bot —
  // respondemos ok sin registrar nada para no darle señal.
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

  return createPlatformRequest({
    kind:            'contact',
    requester_name:  name,
    requester_email: email.toLowerCase(),
    company:         company || null,
    message,
  })
}
