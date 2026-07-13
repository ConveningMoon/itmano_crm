'use server'

import Anthropic from '@anthropic-ai/sdk'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import type { EmailContent } from '@/lib/email-content'
import { EmailContentSchema, EMAIL_CONTENT_VERSION } from '@/lib/email-content'

// ── "Generar con IA" — borrador de correo para el composer ───────────────────
// Genera el contenido (asunto + cuerpo) que prellena el composer. NUNCA envía
// nada: el humano revisa, edita y guarda. Espejo del patrón de
// properties/ai-actions.ts (tool use forzado, thinking off, coerción defensiva).
//
// El correo debe leerse como un mensaje personal escrito a mano, NO como un
// correo de ventas/marketing. El usuario aporta varios campos (objetivo, tono,
// idea, puntos) para que la IA produzca el correo ideal.

// Convención del proyecto (id vigente verificado contra el skill de la Claude API).
const MODEL = 'claude-sonnet-5'

export type EmailAiPurpose =
  | 'lead_magnet_delivery'
  | 'nurture'
  | 'purchase_start'
  | 'purchase_pre_close'
  | 'purchase_completed'
  | 'one_off'

export interface EmailAiInput {
  purpose:   EmailAiPurpose
  language:  'es' | 'en' | 'pt'
  // Campos que aporta el usuario para guiar a la IA.
  objective: string           // objetivo del correo
  tone:      string           // tono del mensaje
  idea:      string           // idea general / qué se quiere decir
  keyPoints?: string          // puntos a incluir (opcional)
  length:    'short' | 'medium'
  // Contexto (ya scoped al tenant).
  agentName?:     string
  tenantName?:    string
  leadFirstName?: string
}

export interface EmailAiDraft {
  subject: string
  body:    string
}

export type EmailAiResult =
  | { ok: true; draft: EmailAiDraft }
  | { ok: false; error: string }

const COMPOSE_TOOL: Anthropic.Tool = {
  name: 'compose_email',
  description: 'Return the subject and body for one personal email.',
  input_schema: {
    type: 'object',
    properties: {
      subject: {
        type: 'string',
        description: 'A short, personal subject line — like something a friend would write. May include {{customer_name}}.',
      },
      body: {
        type: 'string',
        description: 'The full email body as plain text. Use blank lines to separate paragraphs and single newlines for line breaks. No HTML, no markdown, no bullet lists. Do NOT include a signature or sign-off name (it is added automatically). Do NOT mention unsubscribing.',
      },
    },
    required: ['subject', 'body'],
  },
}

const PURPOSE_LABEL: Record<EmailAiPurpose, string> = {
  lead_magnet_delivery: 'The recipient just requested a downloadable resource; this email delivers it',
  nurture:              'A follow-up email keeping in touch with a real-estate lead',
  purchase_start:       'The person just started an active home-purchase process',
  purchase_pre_close:   'A friendly reminder shortly before the closing date',
  purchase_completed:   'The home purchase was completed — warm congratulations',
  one_off:              'A personal one-off email to a specific person',
}

const LANGUAGE_RULES: Record<'es' | 'en' | 'pt', string> = {
  es: 'Write in NEUTRAL LATIN AMERICAN SPANISH — no regional idioms, no "vosotros". For money always use "inversión", never "precio", "costo", "pago" or "cargo".',
  en: 'Write in natural US English.',
  pt: 'Write in BRAZILIAN PORTUGUESE.',
}

const LENGTH_RULES: Record<'short' | 'medium', string> = {
  short:  'Keep it short: 2 to 3 brief paragraphs.',
  medium: 'Medium length: 3 to 5 short paragraphs.',
}

function buildPrompt(input: EmailAiInput): string {
  const context: string[] = []
  if (input.agentName)     context.push(`You are writing as: ${input.agentName}`)
  if (input.tenantName)    context.push(`Real-estate team: ${input.tenantName}`)
  if (input.leadFirstName) context.push(`Recipient first name: ${input.leadFirstName}`)

  const brief: string[] = []
  brief.push(`Objective: ${input.objective.trim()}`)
  brief.push(`Tone: ${input.tone.trim()}`)
  brief.push(`Main idea / what to say: ${input.idea.trim()}`)
  if (input.keyPoints?.trim()) brief.push(`Points to include: ${input.keyPoints.trim()}`)

  return [
    `Write a PERSONAL email. Situation: ${PURPOSE_LABEL[input.purpose]}.`,
    '',
    context.length > 0 ? `Context:\n${context.map(c => `- ${c}`).join('\n')}\n` : '',
    `Brief:\n${brief.map(b => `- ${b}`).join('\n')}`,
    '',
    'CRITICAL — this must NOT look like a sales, marketing, or promotional email:',
    '- Write exactly like a real person writing to someone they know — warm, natural, conversational, as if typed by hand.',
    '- NO marketing language, NO hype, NO salesy phrasing, NO calls-to-action like "click here" or "don\'t miss out".',
    '- NO bullet lists, NO headings, NO ALL-CAPS, NO emojis, NO exclamation stacking. Just flowing prose in short paragraphs.',
    `- ${LANGUAGE_RULES[input.language]}`,
    `- ${LENGTH_RULES[input.length]}`,
    '- Greet the person naturally using {{customer_name}}. You may use {{agent_name}} if it reads naturally, but usually not needed.',
    '- Do NOT write a signature or sign-off name at the end — it is appended automatically.',
    '- Do NOT mention unsubscribing.',
    '',
    'Call the compose_email tool with the subject and body.',
  ].join('\n')
}

export async function generateEmailDraft(input: EmailAiInput): Promise<EmailAiResult> {
  // Cualquier usuario autenticado del CRM puede generar borradores (guardar
  // sigue gateado por las actions correspondientes).
  await getCurrentTenantContext()

  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: 'La generación con IA no está configurada (falta ANTHROPIC_API_KEY).' }
  }

  const objective = input.objective?.trim()
  const idea      = input.idea?.trim()
  if (!objective) return { ok: false, error: 'Indica el objetivo del correo.' }
  if (!idea)      return { ok: false, error: 'Describe la idea general del correo.' }
  if ((input.keyPoints?.length ?? 0) > 2000 || idea.length > 2000 || objective.length > 500) {
    return { ok: false, error: 'Los campos son demasiado largos.' }
  }

  let toolInput: Record<string, unknown>
  try {
    const anthropic = new Anthropic()
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      // Thinking off con tool call forzado (mismo patrón que ai-property-intake).
      thinking: { type: 'disabled' },
      tools: [COMPOSE_TOOL],
      tool_choice: { type: 'tool', name: 'compose_email' },
      messages: [{ role: 'user', content: buildPrompt(input) }],
    })

    const block = message.content.find(b => b.type === 'tool_use')
    if (!block || block.type !== 'tool_use') {
      return { ok: false, error: 'La IA no devolvió un borrador. Intenta de nuevo.' }
    }
    toolInput = block.input as Record<string, unknown>
  } catch (e) {
    console.error(JSON.stringify({ service: 'ai-email-compose', error: e instanceof Error ? e.message : 'unknown' }))
    return { ok: false, error: 'No se pudo generar el borrador con IA. Intenta más tarde.' }
  }

  // ── Coerción defensiva del output de la tool ─────────────────────────────────
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

  const subject = str(toolInput.subject)
  const body    = str(toolInput.body)
  if (!subject || !body) {
    return { ok: false, error: 'El borrador generado está incompleto. Intenta de nuevo con más detalle.' }
  }

  // Validación final con el mismo schema del composer.
  const content: EmailContent = { v: EMAIL_CONTENT_VERSION, body: body.slice(0, 8000) }
  const parsed = EmailContentSchema.safeParse(content)
  if (!parsed.success) {
    return { ok: false, error: 'El borrador generado no es válido. Intenta de nuevo.' }
  }

  return { ok: true, draft: { subject: subject.slice(0, 200), body: parsed.data.body } }
}
