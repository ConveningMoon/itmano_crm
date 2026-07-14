'use server'

import { revalidatePath } from 'next/cache'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { requireWriteAccess } from '@/lib/auth/guards'
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

// ─── Bootstrap: crear los 3 correos de una secuencia vacía con IA ─────────────
// Solo disponible cuando la secuencia NO tiene pasos. Genera los 3 correos en
// una sola llamada (con el PDF del lead magnet como contexto si se sube) y los
// inserta como pasos 0/1/2 con los delays según el tipo de canal:
//   - lead_magnet / formulario / otros: 0h · +3 días · +10 días
//   - event: 0h · hasta 1 día antes del evento · +2 días (= 1 día después)
// Los correos quedan editables como cualquier paso del composer.

const MAX_BOOTSTRAP_PDF_BYTES = 10 * 1024 * 1024 // 10 MB

const SEQUENCE_TOOL: Anthropic.Tool = {
  name: 'compose_sequence',
  description: 'Return exactly three personal emails for an automated follow-up sequence.',
  input_schema: {
    type: 'object',
    properties: {
      emails: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            subject: {
              type: 'string',
              description: 'A short, personal subject line — like something a friend would write. May include {{customer_name}}.',
            },
            body: {
              type: 'string',
              description: 'The full email body as plain text. Blank lines separate paragraphs. No HTML, no markdown, no bullet lists. Do NOT include a signature or sign-off name. Do NOT mention unsubscribing.',
            },
          },
          required: ['subject', 'body'],
        },
        description: 'Exactly 3 emails, in send order.',
      },
    },
    required: ['emails'],
  },
}

// Arco narrativo de los 3 correos según el tipo de canal.
const SEQUENCE_ARC: Record<'lead_magnet' | 'event' | 'generic', string[]> = {
  lead_magnet: [
    'EMAIL 1 (sent immediately after the person requests the material): warmly hand over the resource as if you were sharing it with a friend. If a download link appears in the context, include it as a plain URL on its own line. Mention one genuinely intriguing thing they will find inside — specific, not generic.',
    'EMAIL 2 (sent 3 days later): follow up naturally. Reference something concrete and interesting from the material, add one fresh thought or question it raises, and invite a reply in a low-key way. It must feel like a person who keeps thinking about the topic, not a scheduled blast.',
    'EMAIL 3 (sent 10 days after the second): a warm, unhurried check-in. Bring a new angle or curiosity related to the topic — something that makes them think — and leave the door open to talk, without asking for anything.',
  ],
  event: [
    'EMAIL 1 (sent immediately after registering): a warm, personal confirmation. Show genuine anticipation for meeting them, mention practical details if provided, and one specific reason the event will be worth their time.',
    'EMAIL 2 (sent 1 day before the event): a friendly "see you tomorrow" note. Build real anticipation with one concrete, curiosity-sparking detail of what will happen — never a formal reminder template.',
    'EMAIL 3 (sent 1 day after the event): warm thanks for coming (written so it also reads naturally if they could not make it), share one highlight or reflection, and keep the relationship open.',
  ],
  generic: [
    'EMAIL 1 (sent immediately after they reach out): a warm personal welcome that acknowledges why they got in touch and makes them feel heard by a real person.',
    'EMAIL 2 (sent 3 days later): share one genuinely interesting thought, story or insight related to their interest — something with substance that sparks curiosity.',
    'EMAIL 3 (sent 10 days after the second): a relaxed check-in with a fresh angle on the topic. Keep the connection alive without asking for anything.',
  ],
}

function bootstrapPrompt(params: {
  kind:        'lead_magnet' | 'event' | 'generic'
  language:    'es' | 'en' | 'pt'
  channelName: string | null
  description: string
  hasPdf:      boolean
  agentName:   string | null
}): string {
  const context: string[] = []
  if (params.agentName)   context.push(`You are writing as: ${params.agentName} (a real-estate agent)`)
  if (params.channelName) context.push(`This sequence belongs to: "${params.channelName}"`)
  if (params.hasPdf)      context.push('The attached PDF is the exact material the person requested — read it and use its real content to make the emails specific.')
  if (params.description) context.push(`Description from the author:\n${params.description}`)

  return [
    'Write THREE personal emails for an automated follow-up sequence. Each email goes to one person who recently interacted with a real-estate agent.',
    '',
    `Context:\n${context.map(c => `- ${c}`).join('\n')}`,
    '',
    'The three emails and their timing:',
    ...SEQUENCE_ARC[params.kind].map(a => `- ${a}`),
    '',
    'CRITICAL — these must NOT look like sales, marketing or promotional emails in any way:',
    '- Write exactly like a real person writing to someone they know — warm, natural, human, as if typed by hand in a normal email client.',
    '- NO marketing language, NO hype, NO salesy phrasing, NO "click here", NO urgency tricks.',
    '- NO bullet lists, NO headings, NO ALL-CAPS, NO emojis. Just flowing prose in short paragraphs separated by blank lines.',
    '- At the same time: NOT generic or bland. Each email must contain at least one specific, concrete detail or idea that creates real curiosity and makes the person want to keep reading. Avoid filler like "espero que estés bien" as the whole substance.',
    '- The three emails must feel like a continuing conversation from the same person, not three isolated templates.',
    `- ${LANGUAGE_RULES[params.language]}`,
    '- Each email: 2 to 4 short paragraphs. Greet naturally using {{customer_name}}.',
    '- Do NOT write a signature or sign-off name at the end of any email — it is appended automatically.',
    '- Do NOT mention unsubscribing.',
    '',
    'Call the compose_sequence tool with the three emails in send order.',
  ].join('\n')
}

// Desenvuelve el valor `emails` de la tool, tolerando el doble-encoding que el
// modelo produce a veces: el array directo, un string JSON de un array, o un
// string JSON de un objeto `{ emails: [...] }` (anidado a cualquier nivel).
function unwrapEmails(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) return value
  if (depth > 4) return value
  if (typeof value === 'string') {
    try {
      return unwrapEmails(JSON.parse(value), depth + 1)
    } catch {
      return value
    }
  }
  if (value && typeof value === 'object' && 'emails' in (value as Record<string, unknown>)) {
    return unwrapEmails((value as Record<string, unknown>).emails, depth + 1)
  }
  return value
}

export type SequenceBootstrapResult =
  | { ok: true; created: number }
  | { ok: false; error: string }

export async function generateSequenceSteps(formData: FormData): Promise<SequenceBootstrapResult> {
  const ctx    = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: 'La generación con IA no está configurada (falta ANTHROPIC_API_KEY).' }
  }

  const sequenceId  = (formData.get('sequenceId') as string) || ''
  const description = ((formData.get('description') as string) || '').trim()
  const eventDate   = ((formData.get('eventDate') as string) || '').trim()
  const file        = formData.get('file')
  if (!sequenceId) return { ok: false, error: 'Secuencia inválida.' }
  if (description.length > 3000) return { ok: false, error: 'La descripción es demasiado larga (máx. 3000 caracteres).' }

  const supabase = createAdminClient()

  // Secuencia scoped al tenant del caller.
  let seqQ = supabase.from('email_sequences').select('id, tenant_id, language, agent_id').eq('id', sequenceId)
  if (ctx.tenant_id) seqQ = seqQ.eq('tenant_id', ctx.tenant_id)
  const { data: seq } = await seqQ.maybeSingle()
  if (!seq) return { ok: false, error: 'Secuencia no encontrada' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = seq as any
  const tenantId = s.tenant_id as string
  const language = (['es', 'en', 'pt'].includes(s.language as string) ? s.language : 'es') as 'es' | 'en' | 'pt'

  // Solo para secuencias vacías — este flujo crea los pasos 0/1/2 desde cero.
  const { count } = await supabase
    .from('email_sequence_steps')
    .select('id', { count: 'exact', head: true })
    .eq('sequence_id', sequenceId)
  if ((count ?? 0) > 0) return { ok: false, error: 'La secuencia ya tiene pasos. Este flujo solo aplica a secuencias vacías.' }

  // Canal asociado → tipo de flujo.
  const { data: channel } = await supabase
    .from('acquisition_channels')
    .select('name, channel_type')
    .eq('email_sequence_id', sequenceId)
    .limit(1)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ch = channel as any
  const channelType = (ch?.channel_type as string | undefined) ?? null
  const kind: 'lead_magnet' | 'event' | 'generic' =
    channelType === 'lead_magnet' ? 'lead_magnet'
    : channelType === 'event'     ? 'event'
    : 'generic'

  // Validación de inputs + delays por tipo.
  let pdfBytes: Buffer | null = null
  if (kind === 'lead_magnet' && file instanceof File && file.size > 0) {
    if (file.type !== 'application/pdf') return { ok: false, error: 'El material debe ser un PDF.' }
    if (file.size > MAX_BOOTSTRAP_PDF_BYTES) return { ok: false, error: 'El PDF supera el límite de 10 MB.' }
    pdfBytes = Buffer.from(await file.arrayBuffer())
  }
  if (kind === 'lead_magnet' && !pdfBytes && !description) {
    return { ok: false, error: 'Sube el PDF del lead magnet o describe su contenido.' }
  }
  if (kind !== 'lead_magnet' && !description) {
    return { ok: false, error: 'Describe de qué trata para que la IA escriba los correos.' }
  }

  let delays: [number, number, number]
  if (kind === 'event') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      return { ok: false, error: 'Indica la fecha del evento.' }
    }
    // Correo 2: 1 día antes del evento. delay_hours es relativo al correo
    // anterior (enviado al suscribirse), así que se calcula desde hoy — si un
    // lead se suscribe más tarde, el delay se puede ajustar editando el paso.
    const eventMs  = new Date(`${eventDate}T09:00:00`).getTime()
    const targetMs = eventMs - 24 * 3600 * 1000
    const hours    = Math.round((targetMs - Date.now()) / 3600 / 1000)
    if (hours < 1) return { ok: false, error: 'La fecha del evento debe ser al menos 2 días en el futuro.' }
    delays = [0, hours, 48]
  } else {
    delays = [0, 72, 240] // inmediato · +3 días · +10 días
  }

  // Nombre del agente (contexto para la IA).
  let agentName: string | null = null
  if (s.agent_id) {
    const { data: ag } = await supabase.from('agents').select('name').eq('id', s.agent_id).maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agentName = ((ag as any)?.name as string | undefined) ?? null
  }

  // ── Generación ───────────────────────────────────────────────────────────────
  const prompt = bootstrapPrompt({
    kind, language,
    channelName: (ch?.name as string | undefined) ?? null,
    description,
    hasPdf: !!pdfBytes,
    agentName,
  })

  let emailsRaw: unknown
  try {
    const anthropic = new Anthropic()
    const userContent: Anthropic.ContentBlockParam[] = []
    if (pdfBytes) {
      userContent.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: pdfBytes.toString('base64') },
      })
    }
    userContent.push({ type: 'text', text: prompt })

    const message = await anthropic.messages.create({
      model: MODEL,
      // Amplio: el doble-encoding ocasional del modelo (emails como string JSON)
      // casi duplica los tokens de salida; con holgura evitamos truncar.
      max_tokens: 16000,
      thinking: { type: 'disabled' },
      tools: [SEQUENCE_TOOL],
      tool_choice: { type: 'tool', name: 'compose_sequence' },
      messages: [{ role: 'user', content: userContent }],
    })

    const block = message.content.find(b => b.type === 'tool_use')
    if (!block || block.type !== 'tool_use') {
      return { ok: false, error: 'La IA no devolvió los correos. Intenta de nuevo.' }
    }
    emailsRaw = (block.input as Record<string, unknown>).emails
  } catch (e) {
    console.error(JSON.stringify({ service: 'ai-sequence-bootstrap', error: e instanceof Error ? e.message : 'unknown' }))
    return { ok: false, error: 'No se pudieron generar los correos con IA. Intenta más tarde.' }
  }

  // El modelo a veces devuelve `emails` como string JSON doble-encodado
  // (p. ej. `{"emails": "{\"emails\":[...]}"}` o `"[...]"`) en vez de un array.
  // Lo desenvolvemos de forma tolerante antes de validar.
  emailsRaw = unwrapEmails(emailsRaw)

  // ── Coerción + validación de los 3 correos ───────────────────────────────────
  if (!Array.isArray(emailsRaw) || emailsRaw.length < 3) {
    return { ok: false, error: 'La IA devolvió un resultado incompleto. Intenta de nuevo.' }
  }
  const drafts: Array<{ subject: string; content: EmailContent }> = []
  for (const raw of emailsRaw.slice(0, 3)) {
    const r = raw as Record<string, unknown>
    const subject = typeof r.subject === 'string' ? r.subject.trim().slice(0, 200) : ''
    const body    = typeof r.body === 'string' ? r.body.trim().slice(0, 8000) : ''
    const parsed  = EmailContentSchema.safeParse({ v: EMAIL_CONTENT_VERSION, body })
    if (!subject || !parsed.success) {
      return { ok: false, error: 'Uno de los correos generados está incompleto. Intenta de nuevo.' }
    }
    drafts.push({ subject, content: parsed.data })
  }

  // ── Insertar los 3 pasos ─────────────────────────────────────────────────────
  const rows = drafts.map((d, i) => ({
    sequence_id:        sequenceId,
    tenant_id:          tenantId,
    step_order:         i,
    delay_hours:        delays[i],
    subject:            d.subject,
    body_json:          d.content,
    resend_template_id: null,
    active:             true,
  }))

  const { error: insertErr } = await supabase.from('email_sequence_steps').insert(rows)
  if (insertErr) return { ok: false, error: insertErr.message }

  revalidatePath('/emails')
  revalidatePath('/emails/[id]', 'page')
  return { ok: true, created: rows.length }
}
