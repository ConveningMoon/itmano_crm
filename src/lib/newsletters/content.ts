import { z } from 'zod'

// Contenido de una edición de newsletter. Vive en newsletter_editions.content.
// El HTML final NUNCA se guarda: lo compila el servidor en cada render
// (newsletters/render.ts) — mismo contrato que email-content.ts.
//
// Se guardan BLOQUES y no HTML porque esta página es pública, la sirve `anon`, y
// el texto puede venir de una IA: con HTML habría que sanear en cada render y
// una fuga es XSS en el escaparate del cliente. Con bloques no hay nada que
// sanear.
//
// Este módulo NO es server-only a propósito: el editor (client) necesita el
// schema para validar antes de guardar.

export const NEWSLETTER_CONTENT_VERSION = 1 as const

const text = (max: number) => z.string().trim().min(1).max(max)

const HeadingBlock = z.object({
  type: z.literal('heading'), level: z.union([z.literal(2), z.literal(3)]), text: text(200),
})
const ParagraphBlock = z.object({
  type: z.literal('paragraph'), text: text(4000), sourceIds: z.array(z.string()).max(8).optional(),
})
const ListBlock = z.object({
  type: z.literal('list'), style: z.enum(['bullet', 'number']),
  items: z.array(text(400)).min(1).max(20),
})
const ImageBlock = z.object({
  type: z.literal('image'), url: z.string().url(), alt: text(200), caption: z.string().trim().max(300).optional(),
})
const QuoteBlock = z.object({
  type: z.literal('quote'), text: text(600), attribution: z.string().trim().max(160).optional(),
})
const CalloutBlock = z.object({
  type: z.literal('callout'), tone: z.enum(['info', 'warning']), text: text(600),
})
// El único bloque cuyas fuentes son OBLIGATORIAS: un dato numérico sin respaldo
// es exactamente lo que este sistema existe para impedir.
const StatBlock = z.object({
  type: z.literal('stat'), label: text(80), value: text(40),
  sourceIds: z.array(z.string()).min(1).max(8),
})

export const NewsletterBlockSchema = z.discriminatedUnion('type', [
  HeadingBlock, ParagraphBlock, ListBlock, ImageBlock, QuoteBlock, CalloutBlock, StatBlock,
])

export const NewsletterContentSchema = z.object({
  v:      z.literal(NEWSLETTER_CONTENT_VERSION),
  blocks: z.array(NewsletterBlockSchema).min(1, 'La edición necesita al menos un bloque').max(200),
})

export const NewsletterSourceSchema = z.object({
  id:           z.string().trim().min(1).max(40),
  url:          z.string().url(),
  title:        text(300),
  publisher:    z.string().trim().max(160).default(''),
  published_at: z.string().trim().max(30).optional(),
  accessed_at:  z.string().trim().max(30),
})

export type NewsletterBlock   = z.infer<typeof NewsletterBlockSchema>
export type NewsletterContent = z.infer<typeof NewsletterContentSchema>
export type NewsletterSource  = z.infer<typeof NewsletterSourceSchema>

/** Parse defensivo de un `content` leído de la DB. null si la fila no es usable. */
export function parseNewsletterContent(raw: unknown): NewsletterContent | null {
  if (raw == null) return null
  const parsed = NewsletterContentSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

/** Parse defensivo de `sources`. Descarta las filas rotas en vez de tirar todo. */
export function parseNewsletterSources(raw: unknown): NewsletterSource[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(r => NewsletterSourceSchema.safeParse(r))
    .filter((r): r is { success: true; data: NewsletterSource } => r.success)
    .map(r => r.data)
}
