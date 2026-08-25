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

// Los mensajes van en español neutro, uno por regla, porque el editor los pinta
// TAL CUAL: los bloques recién insertados nacen incompletos a propósito (una
// imagen sin URL, un dato sin fuente) y el primer intento de guardar mostraba
// el mensaje por defecto de zod, en inglés ("Invalid url"), en el primer minuto
// de uso.
const text = (max: number, vacio: string, largo: string) =>
  z.string().trim().min(1, vacio).max(max, largo)

const HeadingBlock = z.object({
  type: z.literal('heading'),
  level: z.union([z.literal(2), z.literal(3)]),
  text: text(200, 'El encabezado no puede quedar vacío.', 'El encabezado es demasiado largo (máximo 200 caracteres).'),
})
const ParagraphBlock = z.object({
  type: z.literal('paragraph'),
  text: text(4000, 'El párrafo no puede quedar vacío.', 'El párrafo es demasiado largo (máximo 4.000 caracteres).'),
  sourceIds: z.array(z.string()).max(8, 'Un párrafo cita como máximo 8 fuentes.').optional(),
})
const ListBlock = z.object({
  type: z.literal('list'), style: z.enum(['bullet', 'number']),
  items: z.array(text(400, 'Ningún elemento de la lista puede quedar vacío.', 'Un elemento de la lista es demasiado largo (máximo 400 caracteres).'))
    .min(1, 'La lista necesita al menos un elemento.')
    .max(20, 'La lista admite como máximo 20 elementos.'),
})
const ImageBlock = z.object({
  type: z.literal('image'),
  url: z.string().url('La imagen necesita una URL válida: súbela o pega su dirección completa.'),
  alt: text(200, 'La imagen necesita un texto alternativo que describa lo que muestra.', 'El texto alternativo es demasiado largo (máximo 200 caracteres).'),
  caption: z.string().trim().max(300, 'El pie de imagen es demasiado largo (máximo 300 caracteres).').optional(),
})
const QuoteBlock = z.object({
  type: z.literal('quote'),
  text: text(600, 'La cita no puede quedar vacía.', 'La cita es demasiado larga (máximo 600 caracteres).'),
  attribution: z.string().trim().max(160, 'La atribución de la cita es demasiado larga (máximo 160 caracteres).').optional(),
})
const CalloutBlock = z.object({
  type: z.literal('callout'), tone: z.enum(['info', 'warning']),
  text: text(600, 'El aviso no puede quedar vacío.', 'El aviso es demasiado largo (máximo 600 caracteres).'),
})
// El único bloque cuyas fuentes son OBLIGATORIAS: un dato numérico sin respaldo
// es exactamente lo que este sistema existe para impedir.
const StatBlock = z.object({
  type: z.literal('stat'),
  label: text(80, 'El dato necesita una etiqueta que diga qué mide.', 'La etiqueta del dato es demasiado larga (máximo 80 caracteres).'),
  value: text(40, 'El dato necesita un valor.', 'El valor del dato es demasiado largo (máximo 40 caracteres).'),
  sourceIds: z.array(z.string())
    .min(1, 'Todo dato necesita al menos una fuente que lo respalde.')
    .max(8, 'Un dato cita como máximo 8 fuentes.'),
})

export const NewsletterBlockSchema = z.discriminatedUnion('type', [
  HeadingBlock, ParagraphBlock, ListBlock, ImageBlock, QuoteBlock, CalloutBlock, StatBlock,
])

export const NewsletterContentSchema = z.object({
  v:      z.literal(NEWSLETTER_CONTENT_VERSION),
  blocks: z.array(NewsletterBlockSchema)
    .min(1, 'La edición necesita al menos un bloque')
    .max(200, 'La edición admite como máximo 200 bloques.'),
})

export const NewsletterSourceSchema = z.object({
  id:           z.string().trim().min(1, 'La fuente necesita un identificador.').max(40, 'El identificador de la fuente es demasiado largo.'),
  url:          z.string().url('La fuente necesita una URL válida, empezando por https://'),
  title:        text(300, 'La fuente necesita un título.', 'El título de la fuente es demasiado largo (máximo 300 caracteres).'),
  publisher:    z.string().trim().max(160, 'El nombre del medio es demasiado largo (máximo 160 caracteres).').default(''),
  published_at: z.string().trim().max(30, 'La fecha de publicación no tiene un formato válido.').optional(),
  accessed_at:  z.string().trim().max(30, 'La fecha de consulta no tiene un formato válido.'),
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
