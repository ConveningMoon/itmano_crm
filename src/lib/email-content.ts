import { z } from 'zod'

// Contenido de un correo creado en el CRM (composer). Vive en
// email_sequence_steps.body_json y purchase_email_templates.body_json, y viaja
// por las server actions de envío one-off. El HTML final NUNCA se guarda: lo
// compila el servidor en cada envío/preview (email-render.ts).
//
// Los correos se redactan como un mensaje personal (estilo "correo de un
// amigo"): un único cuerpo de texto libre, sin párrafos estructurados, sin
// botón CTA. La firma NO vive aquí — se configura por agente en Configuración
// → Email y se agrega automáticamente al final.
//
// Este módulo NO es server-only a propósito: el composer (client) necesita el
// tipo y el schema para validar antes de enviar; el renderer sí es server-only.

export const EMAIL_CONTENT_VERSION = 1 as const

export const EmailContentSchema = z.object({
  v:    z.literal(EMAIL_CONTENT_VERSION),
  body: z.string().trim().min(1, 'El correo necesita un mensaje').max(8000),
})

export type EmailContent = z.infer<typeof EmailContentSchema>

// Merge tags disponibles en asunto y cuerpo (doble llave — la resolución la
// hace el CRM al enviar, NO Resend).
export const MERGE_TAGS = [
  { tag: '{{customer_name}}', label: 'Nombre del lead' },
  { tag: '{{agent_name}}',    label: 'Nombre del agente' },
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
