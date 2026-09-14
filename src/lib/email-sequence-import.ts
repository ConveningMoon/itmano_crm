import { z } from 'zod'

export const MAX_EMAIL_IMPORT_BYTES = 1_000_000
export const MAX_EMAILS_PER_IMPORT = 100
export const MAX_TAG_SEQUENCES_PER_IMPORT = 200
export const MAX_ALL_TAG_EMAIL_IMPORT_BYTES = 5_000_000
export const MAX_SEND_AT_HOURS = 8_760

const ImportedEmailSchema = z.object({
  send_at_hours: z.number().int().min(0).max(MAX_SEND_AT_HOURS),
  subject:       z.string().trim().min(1).max(200),
  body:          z.string().trim().min(1).max(8_000),
}).strict()

const EmailImportDocumentSchema = z.object({
  emails: z.array(ImportedEmailSchema).min(1).max(MAX_EMAILS_PER_IMPORT),
}).strict()

const TagSequenceImportSchema = z.object({
  tag_slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  language: z.enum(['es', 'en', 'pt']),
  emails: z.array(ImportedEmailSchema).min(1).max(MAX_EMAILS_PER_IMPORT),
}).strict()

const AllTagSequenceImportDocumentSchema = z.object({
  sequences: z.array(TagSequenceImportSchema).min(1).max(MAX_TAG_SEQUENCES_PER_IMPORT),
}).strict()

export type ImportedEmail = z.infer<typeof ImportedEmailSchema>
export type ImportedTagSequence = z.infer<typeof TagSequenceImportSchema>

export interface ImportSkip {
  sendAtHours: number
  subject:     string
  reason:      string
}

export type ParseEmailImportResult =
  | { ok: true; emails: ImportedEmail[]; skipped: ImportSkip[] }
  | { ok: false; error: string }

export type ParseAllTagSequenceImportResult =
  | { ok: true; sequences: ImportedTagSequence[]; skipped: Array<ImportSkip & { tagSlug: string; language: string }> }
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

export function parseAllTagSequenceImport(raw: string): ParseAllTagSequenceImportResult {
  if (new TextEncoder().encode(raw).byteLength > MAX_ALL_TAG_EMAIL_IMPORT_BYTES) {
    return { ok: false, error: 'El archivo supera el límite de 5 MB.' }
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'El archivo no contiene JSON válido.' }
  }

  const parsed = AllTagSequenceImportDocumentSchema.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const block = typeof issue.path[1] === 'number' ? `Bloque ${issue.path[1] + 1}` : 'JSON'
    return { ok: false, error: `${block}: el documento no respeta la estructura requerida.` }
  }

  const combinations = new Set<string>()
  const skipped: Array<ImportSkip & { tagSlug: string; language: string }> = []
  const sequences: ImportedTagSequence[] = []

  for (const sequence of parsed.data.sequences) {
    const key = `${sequence.tag_slug}|${sequence.language}`
    if (combinations.has(key)) {
      return { ok: false, error: `La combinación ${sequence.tag_slug} + ${sequence.language} está repetida.` }
    }
    combinations.add(key)

    const sorted = [...sequence.emails].sort((a, b) => a.send_at_hours - b.send_at_hours)
    const hours = new Set<number>()
    const emails: ImportedEmail[] = []
    for (const email of sorted) {
      if (hours.has(email.send_at_hours)) {
        skipped.push({
          tagSlug: sequence.tag_slug,
          language: sequence.language,
          sendAtHours: email.send_at_hours,
          subject: email.subject,
          reason: `Otra entrada del mismo bloque ya usa la hora ${email.send_at_hours}.`,
        })
        continue
      }
      hours.add(email.send_at_hours)
      emails.push(email)
    }
    if (emails.length === 0) {
      return { ok: false, error: `${sequence.tag_slug} + ${sequence.language} no contiene emails importables.` }
    }
    sequences.push({ ...sequence, emails })
  }

  return { ok: true, sequences, skipped }
}

export function buildAllTagSequencesPrompt(input: {
  tags: Array<{ slug: string; name: string; description: string | null; languages: string[] }>
}): string {
  const catalog = input.tags.map(tag =>
    `- ${tag.slug}: ${tag.name}${tag.description ? ` — ${tag.description}` : ''}. Idiomas: ${tag.languages.join(', ')}`,
  ).join('\n')

  return `Redacta todos los emails automáticos por etiqueta para el CRM inmobiliario ITMANO.

Contexto:
- Cada secuencia empieza cuando se aplica su etiqueta al lead.
- Genera un bloque independiente por cada combinación etiqueta + idioma de este catálogo:
${catalog}
- Tono: personal, profesional, calmado, concreto y útil; debe sentirse como un correo escrito por una persona, no como una campaña genérica.

Devuelve ÚNICAMENTE JSON válido, sin markdown, comentarios ni texto antes o después, con esta estructura exacta:
{
  "sequences": [
    {
      "tag_slug": "slug-exacto-del-catalogo",
      "language": "es",
      "emails": [
        {
          "send_at_hours": 0,
          "subject": "Asunto del correo",
          "body": "Cuerpo en texto plano con saltos de línea"
        }
      ]
    }
  ]
}

Reglas obligatorias:
1. Incluye exactamente un bloque por cada combinación del catálogo. Copia tag_slug y language literalmente.
2. send_at_hours es un entero de horas acumuladas desde que se aplica esa etiqueta; 0 significa envío inmediato.
3. Dentro de cada bloque, ordena por send_at_hours, no repitas horas y deja al menos 1 hora entre emails. Distintas etiquetas sí pueden usar la misma hora.
4. Genera como máximo ${MAX_EMAILS_PER_IMPORT} emails por bloque y ninguno después de ${MAX_SEND_AT_HOURS} horas.
5. subject debe tener entre 1 y 200 caracteres. body debe tener entre 1 y 8000 caracteres.
6. Escribe body como texto plano. No incluyas HTML, markdown, firma ni enlace de baja; el CRM los agrega.
7. Puedes usar {{customer_name}} y {{agent_name}} exactamente con doble llave. No inventes otras variables.
8. No agregues campos distintos de sequences, tag_slug, language, emails, send_at_hours, subject y body.
9. Evita promesas no verificables, presión artificial, hype y datos específicos que no estén en este contexto.

Antes de generar, pregunta al usuario por el contexto comercial que falte. Cuando ya lo tengas, responde sólo con el JSON completo.`
}
