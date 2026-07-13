'use server'

import Anthropic from '@anthropic-ai/sdk'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import type { EmailContent } from '@/lib/email-content'
import { EmailContentSchema, EMAIL_CONTENT_VERSION } from '@/lib/email-content'

// ── "Generar con IA" — borrador de correo para el composer ───────────────────
// Genera el contenido estructurado (asunto + párrafos + CTA opcional) que
// prellena el composer. NUNCA envía nada: el humano revisa, edita y guarda.
// Espejo del patrón de properties/ai-actions.ts (tool use forzado, thinking
// off, coerción defensiva del output).

// Convención del proyecto (misma que ai-property-intake; id vigente verificado
// contra el skill de la Claude API).
const MODEL = 'claude-sonnet-5'

export type EmailAiPurpose =
  | 'lead_magnet_delivery'
  | 'nurture'
  | 'purchase_start'
  | 'purchase_pre_close'
  | 'purchase_completed'
  | 'one_off'

export interface EmailAiInput {
  purpose:         EmailAiPurpose
  language:        'es' | 'en' | 'pt'
  brief:           string
  leadMagnetName?: string
  agentName?:      string
  tenantName?:     string
  leadFirstName?:  string
}

export interface EmailAiDraft {
  subject:           string
  paragraphs:        string[]
  cta:               { label: string; url: string } | null
  include_signature: boolean
}

export type EmailAiResult =
  | { ok: true; draft: EmailAiDraft }
  | { ok: false; error: string }

const COMPOSE_TOOL: Anthropic.Tool = {
  name: 'compose_email',
  description: 'Return the structured content for one marketing/CRM email.',
  input_schema: {
    type: 'object',
    properties: {
      subject: {
        type: 'string',
        description: 'Email subject line. May include merge tags like {{customer_name}}.',
      },
      paragraphs: {
        type: 'array',
        items: { type: 'string' },
        description: '2 to 5 short paragraphs of plain text (no HTML, no markdown). May include merge tags.',
      },
      cta: {
        type: ['object', 'null'],
        properties: {
          label: { type: 'string', description: 'Button text (short).' },
          url:   { type: 'string', description: 'The exact http(s) URL provided in the brief. Never invent one.' },
        },
        required: ['label', 'url'],
        description: 'Call-to-action button. MUST be null unless the brief explicitly provides a URL.',
      },
      include_signature: {
        type: 'boolean',
        description: 'Whether to end with the agent signature (name + email). Usually true.',
      },
    },
    required: ['subject', 'paragraphs', 'cta', 'include_signature'],
  },
}

const PURPOSE_LABEL: Record<EmailAiPurpose, string> = {
  lead_magnet_delivery: 'Delivery email for a downloadable lead magnet the lead just requested',
  nurture:              'Nurture email in an automated follow-up sequence for a real-estate lead',
  purchase_start:       'Milestone email: the lead just STARTED an active home-purchase process with the agency',
  purchase_pre_close:   'Milestone email: reminder shortly BEFORE the closing date of the purchase',
  purchase_completed:   'Milestone email: the home purchase was COMPLETED (congratulations + next steps)',
  one_off:              'One-off personal email from the agent to a specific lead',
}

const LANGUAGE_RULES: Record<'es' | 'en' | 'pt', string> = {
  es: 'Write in NEUTRAL LATIN AMERICAN SPANISH — no regional idioms, no "vosotros". For money always use "inversión", never "precio", "costo", "pago" or "cargo".',
  en: 'Write in natural US English.',
  pt: 'Write in BRAZILIAN PORTUGUESE.',
}

function buildPrompt(input: EmailAiInput): string {
  const context: string[] = []
  if (input.tenantName)     context.push(`Real-estate team / brand: ${input.tenantName}`)
  if (input.agentName)      context.push(`Agent (sender): ${input.agentName}`)
  if (input.leadMagnetName) context.push(`Lead magnet: ${input.leadMagnetName}`)
  if (input.leadFirstName)  context.push(`Recipient first name: ${input.leadFirstName}`)

  return [
    `Write the content for this email: ${PURPOSE_LABEL[input.purpose]}.`,
    '',
    context.length > 0 ? `Context:\n${context.map(c => `- ${c}`).join('\n')}\n` : '',
    `Brief from the user (follow it):\n${input.brief.trim()}`,
    '',
    'Rules:',
    `- ${LANGUAGE_RULES[input.language]}`,
    '- Tone: premium, strategic, calm, trustworthy real-estate voice. No hype, no marketing-speak, NO emojis, no exclamation stacking.',
    '- 2 to 5 short paragraphs of PLAIN TEXT (no HTML, no markdown, no bullet lists).',
    '- Personalization: use the merge tags {{customer_name}}, {{agent_name}} and {{lead_magnet_name}} (double braces) where natural — e.g. greet with {{customer_name}}. Do NOT use any other tag.',
    '- cta: set it ONLY if the brief explicitly provides an http(s) URL; copy that URL exactly. Otherwise cta must be null. NEVER invent a URL.',
    '- Do NOT mention unsubscribing (an unsubscribe footer is added automatically).',
    '- Do NOT write a signature inside the paragraphs — set include_signature to true instead (the system appends the agent name + email).',
    '',
    'Call the compose_email tool with the result.',
  ].join('\n')
}

export async function generateEmailDraft(input: EmailAiInput): Promise<EmailAiResult> {
  // Cualquier usuario autenticado del CRM puede generar borradores (guardar
  // sigue gateado por las actions correspondientes).
  await getCurrentTenantContext()

  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: 'La generación con IA no está configurada (falta ANTHROPIC_API_KEY).' }
  }

  const brief = input.brief?.trim()
  if (!brief) return { ok: false, error: 'Describe brevemente el correo que necesitas.' }
  if (brief.length > 2000) return { ok: false, error: 'El brief es demasiado largo (máx. 2000 caracteres).' }

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
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map(x => x.trim()) : []

  const subject    = str(toolInput.subject)
  const paragraphs = arr(toolInput.paragraphs).slice(0, 12)
  if (!subject || paragraphs.length === 0) {
    return { ok: false, error: 'El borrador generado está incompleto. Intenta de nuevo con un brief más específico.' }
  }

  let cta: EmailAiDraft['cta'] = null
  if (toolInput.cta && typeof toolInput.cta === 'object') {
    const c = toolInput.cta as Record<string, unknown>
    const label = str(c.label)
    const url   = str(c.url)
    if (label && url && /^https?:\/\/\S+$/i.test(url)) cta = { label, url }
  }

  // Validación final con el mismo schema del composer — si la IA devolvió algo
  // fuera de rango (párrafos > 2000 chars, etc.) se recorta o se rechaza aquí.
  const content: EmailContent = {
    v: EMAIL_CONTENT_VERSION,
    paragraphs: paragraphs.map(p => p.slice(0, 2000)),
    cta,
    include_signature: toolInput.include_signature !== false,
  }
  const parsed = EmailContentSchema.safeParse(content)
  if (!parsed.success) {
    return { ok: false, error: 'El borrador generado no es válido. Intenta de nuevo.' }
  }

  return {
    ok: true,
    draft: {
      subject: subject.slice(0, 200),
      paragraphs: parsed.data.paragraphs,
      cta: parsed.data.cta,
      include_signature: parsed.data.include_signature,
    },
  }
}
