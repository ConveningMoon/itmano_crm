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

/**
 * Los topes de longitud, en UN solo sitio.
 *
 * Existen como constante y no como literales dentro de cada `text(...)` porque
 * hay un segundo consumidor: el `input_schema` de la herramienta con la que la
 * IA redacta (`ai/draft.ts` -> `editionToolSchema`). Ese esquema es lo unico que
 * le dice al modelo cuanto cabe; mientras no lo declaro, el modelo no tenia
 * forma de respetar el limite y una edicion entera se perdia por un `value` de
 * 41 caracteres DESPUES de haber pagado la investigacion. Un tope duplicado a
 * mano es exactamente como los dos lados vuelven a separarse.
 *
 * `statValue` son 80 y no 40: la IA produce el dato CON su contexto -"48 dias
 * (frente a 37 el ano anterior)"- y eso es un dato mejor que "48 dias". El
 * limite viejo lo dejaba pasar por los pelos y rechazaba el siguiente. Subirlo
 * es mas laxo, asi que ningun contenido ya guardado deja de validar: no hay
 * migracion ni riesgo para las ediciones vivas.
 */
export const CONTENT_LIMITS = {
  heading:          200,
  paragraph:        4000,
  listItem:         400,
  quote:            600,
  quoteAttribution: 160,
  callout:          600,
  statLabel:        80,
  statValue:        80,
  imageAlt:         200,
  imageCaption:     300,
  /** No son del bloque sino de la fila, pero los produce la misma herramienta. */
  editionTitle:     200,
  editionDek:       400,
} as const

const HeadingBlock = z.object({
  type: z.literal('heading'),
  level: z.union([z.literal(2), z.literal(3)]),
  text: text(CONTENT_LIMITS.heading, 'El encabezado no puede quedar vacío.', `El encabezado es demasiado largo (máximo ${CONTENT_LIMITS.heading} caracteres).`),
})
const ParagraphBlock = z.object({
  type: z.literal('paragraph'),
  text: text(CONTENT_LIMITS.paragraph, 'El párrafo no puede quedar vacío.', 'El párrafo es demasiado largo (máximo 4.000 caracteres).'),
  sourceIds: z.array(z.string()).max(8, 'Un párrafo cita como máximo 8 fuentes.').optional(),
})
const ListBlock = z.object({
  type: z.literal('list'), style: z.enum(['bullet', 'number']),
  items: z.array(text(CONTENT_LIMITS.listItem, 'Ningún elemento de la lista puede quedar vacío.', `Un elemento de la lista es demasiado largo (máximo ${CONTENT_LIMITS.listItem} caracteres).`))
    .min(1, 'La lista necesita al menos un elemento.')
    .max(20, 'La lista admite como máximo 20 elementos.'),
})
const ImageBlock = z.object({
  type: z.literal('image'),
  url: z.string().url('La imagen necesita una URL válida: súbela o pega su dirección completa.'),
  alt: text(CONTENT_LIMITS.imageAlt, 'La imagen necesita un texto alternativo que describa lo que muestra.', `El texto alternativo es demasiado largo (máximo ${CONTENT_LIMITS.imageAlt} caracteres).`),
  caption: z.string().trim().max(CONTENT_LIMITS.imageCaption, `El pie de imagen es demasiado largo (máximo ${CONTENT_LIMITS.imageCaption} caracteres).`).optional(),
})
const QuoteBlock = z.object({
  type: z.literal('quote'),
  text: text(CONTENT_LIMITS.quote, 'La cita no puede quedar vacía.', `La cita es demasiado larga (máximo ${CONTENT_LIMITS.quote} caracteres).`),
  attribution: z.string().trim().max(CONTENT_LIMITS.quoteAttribution, `La atribución de la cita es demasiado larga (máximo ${CONTENT_LIMITS.quoteAttribution} caracteres).`).optional(),
})
const CalloutBlock = z.object({
  type: z.literal('callout'), tone: z.enum(['info', 'warning']),
  text: text(CONTENT_LIMITS.callout, 'El aviso no puede quedar vacío.', `El aviso es demasiado largo (máximo ${CONTENT_LIMITS.callout} caracteres).`),
})
// El único bloque cuyas fuentes son OBLIGATORIAS: un dato numérico sin respaldo
// es exactamente lo que este sistema existe para impedir.
const StatBlock = z.object({
  type: z.literal('stat'),
  label: text(CONTENT_LIMITS.statLabel, 'El dato necesita una etiqueta que diga qué mide.', `La etiqueta del dato es demasiado larga (máximo ${CONTENT_LIMITS.statLabel} caracteres).`),
  value: text(CONTENT_LIMITS.statValue, 'El dato necesita un valor.', `El valor del dato es demasiado largo (máximo ${CONTENT_LIMITS.statValue} caracteres).`),
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

/**
 * Cómo se nombra una fuente en la sección "Fuentes".
 *
 * Vive aquí —y no en render.ts— porque la página pública y la vista previa del
 * editor tienen que decir exactamente lo mismo, y render.ts es `server-only`:
 * el editor no puede importarlo. Todo lo demás de esa vista previa es una copia
 * deliberada; esto no, porque es justo donde se separaron.
 *
 * Colapsa cuando los dos valores coinciden. Una fuente generada con IA no trae
 * título de artículo, así que `title` ES el medio (ver `sourcesFromFindings`) y
 * la etiqueta salía como "NAR — NAR" en el 100% de las ediciones generadas. Una
 * fuente subida a mano sí tiene título propio, y ahí "Título — Medio" es lo
 * correcto: la comparación es por valor, no por origen.
 */
export function sourceLabel(source: Pick<NewsletterSource, 'title' | 'publisher'>): string {
  const title     = source.title.trim()
  const publisher = (source.publisher ?? '').trim()
  if (!publisher || publisher === title) return title
  return `${title} — ${publisher}`
}
