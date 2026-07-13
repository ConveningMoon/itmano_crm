import { z } from 'zod'

// Contenido estructurado de un correo creado en el CRM (composer).
// Vive en email_sequence_steps.body_json y purchase_email_templates.body_json,
// y viaja por las server actions de envío one-off. El HTML final NUNCA se
// guarda: lo compila el servidor en cada envío/preview (email-render.ts).
//
// Este módulo NO es server-only a propósito: el composer (client) necesita el
// tipo y el schema para validar antes de enviar; el renderer sí es server-only.

export const EMAIL_CONTENT_VERSION = 1 as const

export const EmailCtaSchema = z.object({
  label: z.string().trim().min(1, 'El botón necesita un texto').max(80),
  url:   z.string().trim().url('URL inválida').refine(
    u => /^https?:\/\//i.test(u),
    'La URL debe empezar con http:// o https://',
  ),
})

export const EmailContentSchema = z.object({
  v:          z.literal(EMAIL_CONTENT_VERSION),
  paragraphs: z.array(z.string().trim().min(1).max(2000))
                .min(1, 'El correo necesita al menos un párrafo')
                .max(12),
  cta:        EmailCtaSchema.nullable(),
  include_signature: z.boolean(),
})

export type EmailCta     = z.infer<typeof EmailCtaSchema>
export type EmailContent = z.infer<typeof EmailContentSchema>

// Merge tags disponibles en asunto y párrafos (doble llave — la resolución la
// hace el CRM al enviar, NO Resend; la triple llave era del flujo de templates).
export const MERGE_TAGS = [
  { tag: '{{customer_name}}',    label: 'Nombre del lead' },
  { tag: '{{agent_name}}',       label: 'Nombre del agente' },
  { tag: '{{agent_email}}',      label: 'Email del agente' },
  { tag: '{{lead_magnet_name}}', label: 'Nombre del lead magnet' },
] as const

/**
 * Parse defensivo de un body_json leído de la DB. Devuelve null si la fila no
 * tiene contenido CRM válido (el caller decide caer al template legacy).
 */
export function parseEmailContent(raw: unknown): EmailContent | null {
  if (raw == null) return null
  const parsed = EmailContentSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}
