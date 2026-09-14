import { z } from 'zod'

export const MAX_EMAIL_IMPORT_BYTES = 1_000_000
export const MAX_EMAILS_PER_IMPORT = 100
export const MAX_SEND_AT_HOURS = 8_760

const ImportedEmailSchema = z.object({
  send_at_hours: z.number().int().min(0).max(MAX_SEND_AT_HOURS),
  subject:       z.string().trim().min(1).max(200),
  body:          z.string().trim().min(1).max(8_000),
}).strict()

const EmailImportDocumentSchema = z.object({
  emails: z.array(ImportedEmailSchema).min(1).max(MAX_EMAILS_PER_IMPORT),
}).strict()

export type ImportedEmail = z.infer<typeof ImportedEmailSchema>

export interface ImportSkip {
  sendAtHours: number
  subject:     string
  reason:      string
}

export type ParseEmailImportResult =
  | { ok: true; emails: ImportedEmail[]; skipped: ImportSkip[] }
  | { ok: false; error: string }

function issueMessage(issue: z.core.$ZodIssue): string {
  const row = typeof issue.path[1] === 'number' ? issue.path[1] + 1 : null
  const field = issue.path.at(-1)
  const where = row ? `Email ${row}${typeof field === 'string' ? `, ${field}` : ''}` : 'JSON'
  if (issue.code === 'unrecognized_keys') return `${where}: contiene campos no permitidos.`
  if (field === 'send_at_hours') return `${where}: debe ser un entero entre 0 y ${MAX_SEND_AT_HOURS}.`
  if (field === 'subject') return `${where}: debe tener entre 1 y 200 caracteres.`
  if (field === 'body') return `${where}: debe tener entre 1 y 8000 caracteres.`
  if (field === 'emails') return 'JSON: emails debe ser una lista de entre 1 y 100 elementos.'
  return 'El JSON no respeta la estructura requerida.'
}

export function parseEmailImport(raw: string): ParseEmailImportResult {
  if (new TextEncoder().encode(raw).byteLength > MAX_EMAIL_IMPORT_BYTES) {
    return { ok: false, error: 'El archivo supera el límite de 1 MB.' }
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'El archivo no contiene JSON válido.' }
  }

  const parsed = EmailImportDocumentSchema.safeParse(json)
  if (!parsed.success) {
    return { ok: false, error: issueMessage(parsed.error.issues[0]) }
  }

  const sorted = [...parsed.data.emails].sort((a, b) => a.send_at_hours - b.send_at_hours)
  const seen = new Set<number>()
  const emails: ImportedEmail[] = []
  const skipped: ImportSkip[] = []

  for (const email of sorted) {
    if (seen.has(email.send_at_hours)) {
      skipped.push({
        sendAtHours: email.send_at_hours,
        subject:     email.subject,
        reason:      `Otra entrada del archivo ya usa la hora ${email.send_at_hours}.`,
      })
      continue
    }
    seen.add(email.send_at_hours)
    emails.push(email)
  }

  return { ok: true, emails, skipped }
}

export function buildExternalEmailPrompt(input: {
  sequenceName: string
  language:     string
}): string {
  return `Redacta una secuencia de emails para el CRM inmobiliario ITMANO.

Contexto:
- Secuencia/etiqueta: ${input.sequenceName}
- Idioma de todos los correos: ${input.language}
- La secuencia empieza cuando se aplica la etiqueta al lead.
- Tono: personal, profesional, calmado, concreto y útil; debe sentirse como un correo escrito por una persona, no como una campaña genérica.

Devuelve ÚNICAMENTE JSON válido, sin markdown, comentarios ni texto antes o después, con esta estructura exacta:
{
  "emails": [
    {
      "send_at_hours": 0,
      "subject": "Asunto del correo",
      "body": "Cuerpo en texto plano con saltos de línea"
    },
    {
      "send_at_hours": 24,
      "subject": "Segundo asunto",
      "body": "Segundo cuerpo"
    }
  ]
}

Reglas obligatorias:
1. send_at_hours es un número entero de horas acumuladas desde que se aplica la etiqueta; 0 significa envío inmediato.
2. Ordena los emails por send_at_hours ascendente. No repitas horas y deja al menos 1 hora entre dos emails.
3. Genera como máximo ${MAX_EMAILS_PER_IMPORT} emails y no programes ninguno después de ${MAX_SEND_AT_HOURS} horas.
4. subject debe tener entre 1 y 200 caracteres. body debe tener entre 1 y 8000 caracteres.
5. Escribe body como texto plano. No incluyas HTML, markdown, una firma ni un enlace de baja; el CRM agrega la firma y el unsubscribe automáticamente.
6. Puedes usar {{customer_name}} y {{agent_name}} exactamente con doble llave. No inventes otras variables.
7. No agregues campos distintos de emails, send_at_hours, subject y body.
8. Evita promesas no verificables, presión artificial, hype y datos específicos que no estén en este contexto.

Antes de generar, usa la información que te dé el usuario sobre el objetivo de la etiqueta, la situación del lead, la oferta y el CTA. Si falta contexto esencial, pregúntalo primero; cuando ya lo tengas, responde sólo con el JSON.`
}
