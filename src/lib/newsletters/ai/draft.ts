import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import {
  NewsletterContentSchema, NEWSLETTER_CONTENT_VERSION,
  type NewsletterContent, type NewsletterSource,
} from '../content'
import type { NewsletterDossier, ResearchFinding } from './research'

// Paso 2: redactar la edición a partir del dossier, SIN acceso a la web.
//
// Separado del paso 1 por dos razones. La de fondo: quien redacta no debe poder
// traerse un dato nuevo que nadie verificó — si no está en el dossier, no entra
// en la newsletter. Y una de la API: la salida estructurada y las citas de
// documento son mutuamente excluyentes (devuelve 400 si se combinan).
//
// La forma se pide con `output_config.format` y DESPUÉS se valida con el mismo
// zod que usa el editor. Doble red: el modelo produce la forma, zod la verifica.
// El esquema JSON se escribe a mano, como ya hace carousels/copy.ts — el repo no
// tiene conversor de zod a JSON Schema y no merece uno por esto.

const MODEL = 'claude-sonnet-5'

export interface DraftResult {
  title:     string
  dek:       string
  content:   NewsletterContent
  sources:   NewsletterSource[]
  dataAsOf:  string | null
  usage:     { input: number; output: number }
}

/**
 * Los hallazgos del dossier son las fuentes de la edición.
 *
 * Los ids son `s1`, `s2`… y son los que los bloques citan en `sourceIds`. Se
 * generan aquí y se le dan al modelo hechos: si los inventara él, citaría ids
 * que no existen y `publishBlockers` bloquearía la edición entera.
 */
export function sourcesFromFindings(findings: ResearchFinding[]): NewsletterSource[] {
  const hoy = new Date().toISOString().slice(0, 10)
  return findings
    .filter(f => /^https?:\/\//.test(f.url))
    .map((f, i) => ({
      id:           `s${i + 1}`,
      url:          f.url,
      title:        f.claim.slice(0, 300),
      publisher:    f.publisher ?? '',
      published_at: f.published_at,
      accessed_at:  hoy,
    }))
}

/** Esquema JSON de la salida. Espeja NewsletterContentSchema de content.ts. */
function outputSchema(): Record<string, unknown> {
  const bloque = {
    type: 'object',
    oneOf: [
      { properties: { type: { const: 'heading' },   level: { enum: [2, 3] }, text: { type: 'string' } },
        required: ['type', 'level', 'text'] },
      { properties: { type: { const: 'paragraph' }, text: { type: 'string' },
                      sourceIds: { type: 'array', items: { type: 'string' } } },
        required: ['type', 'text'] },
      { properties: { type: { const: 'list' }, style: { enum: ['bullet', 'number'] },
                      items: { type: 'array', items: { type: 'string' } } },
        required: ['type', 'style', 'items'] },
      { properties: { type: { const: 'quote' }, text: { type: 'string' }, attribution: { type: 'string' } },
        required: ['type', 'text'] },
      { properties: { type: { const: 'callout' }, tone: { enum: ['info', 'warning'] }, text: { type: 'string' } },
        required: ['type', 'tone', 'text'] },
      { properties: { type: { const: 'stat' }, label: { type: 'string' }, value: { type: 'string' },
                      sourceIds: { type: 'array', items: { type: 'string' }, minItems: 1 } },
        required: ['type', 'label', 'value', 'sourceIds'] },
    ],
  }

  return {
    type: 'object',
    properties: {
      title:       { type: 'string', description: 'Titular de la edición. Concreto, sin signos de exclamación.' },
      dek:         { type: 'string', description: 'Entradilla de una o dos frases.' },
      data_as_of:  { type: ['string', 'null'], description: 'Fecha YYYY-MM-DD a la que se refieren los datos, o null.' },
      blocks:      { type: 'array', items: bloque, minItems: 3, maxItems: 40 },
    },
    required: ['title', 'dek', 'data_as_of', 'blocks'],
    additionalProperties: false,
  }
}

function buildPrompt(args: {
  dossier: NewsletterDossier; language: string; brandName: string; voice: string | null
}): string {
  const fuentes = sourcesFromFindings(args.dossier.findings)
  const listado = fuentes
    .map(f => `- ${f.id}: ${f.title} — ${f.publisher} (${f.url})`)
    .join('\n')

  return [
    `Escribes la newsletter de ${args.brandName}, una agencia inmobiliaria, en ${args.language}.`,
    args.voice ? `\n\nVoz de la agencia: ${args.voice}` : '',
    `\n\nTema: ${args.dossier.topic}`,
    args.dossier.summary ? `\nPor qué importa: ${args.dossier.summary}` : '',
    `\n\nESTOS son los únicos datos verificados de los que dispones, con su id de fuente:\n${listado}`,
    `\n\nReglas que no puedes romper:`,
    `\n1. Todo bloque "stat" DEBE citar en sourceIds al menos un id de la lista de arriba.`,
    `\n2. NO inventes cifras, fechas ni porcentajes que no estén en esa lista.`,
    `\n3. NO cites un id que no aparezca en la lista.`,
    `\n4. Si un dato te falta, escribe la edición sin él. Un texto más corto es preferible a uno con una cifra inventada.`,
    `\n5. Tono sobrio y profesional. Sin emojis. Sin signos de exclamación. Sin promesas de rentabilidad.`,
    `\n6. Entre 4 y 10 bloques. Empieza por un heading de nivel 2.`,
  ].join('')
}

/** Redacta la edición. Lanza si la salida no valida contra el esquema del repo. */
export async function draftEdition(args: {
  dossier:   NewsletterDossier
  language:  string
  brandName: string
  voice:     string | null
}): Promise<DraftResult> {
  const sources = sourcesFromFindings(args.dossier.findings)
  if (sources.length === 0) {
    throw new Error('La investigación no dejó ninguna fuente utilizable.')
  }

  const client = new Anthropic()

  // Streaming: una edición completa puede acercarse al techo de max_tokens y una
  // petición larga sin stream se arriesga al timeout HTTP del SDK.
  const stream = client.messages.stream({
    model:         MODEL,
    max_tokens:    16000,
    thinking:      { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: outputSchema() } },
    messages:      [{ role: 'user', content: buildPrompt(args) }],
  })
  const response = await stream.finalMessage()

  const text = (response.content as { type: string; text?: string }[])
    .filter(b => b.type === 'text')
    .map(b => b.text ?? '')
    .join('')
    .trim()

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error('La redacción no devolvió un JSON válido.')
  }

  // La red de zod: aunque el modelo respete el esquema JSON, esto es lo que
  // decide si el contenido es válido PARA ESTE REPO.
  const contenido = NewsletterContentSchema.safeParse({
    v:      NEWSLETTER_CONTENT_VERSION,
    blocks: parsed.blocks,
  })
  if (!contenido.success) {
    throw new Error(`La redacción no cumple el formato: ${contenido.error.issues[0].message}`)
  }

  const conocidas = new Set(sources.map(s => s.id))
  for (const b of contenido.data.blocks) {
    const ids = b.type === 'stat' ? b.sourceIds : b.type === 'paragraph' ? (b.sourceIds ?? []) : []
    for (const id of ids) {
      if (!conocidas.has(id)) {
        throw new Error('La redacción citó una fuente que no existe.')
      }
    }
  }

  const dataAsOf = typeof parsed.data_as_of === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.data_as_of)
    ? parsed.data_as_of
    : null

  return {
    title:    String(parsed.title ?? '').trim(),
    dek:      String(parsed.dek ?? '').trim(),
    content:  contenido.data,
    sources,
    dataAsOf,
    usage: {
      input:  response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  }
}
