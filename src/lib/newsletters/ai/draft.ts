import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import {
  NewsletterContentSchema, NewsletterSourceSchema, NEWSLETTER_CONTENT_VERSION,
  type NewsletterContent, type NewsletterSource,
} from '../content'
import type { NewsletterDossier, ResearchFinding } from './research'
import { AiSpentError, type AiSpend } from './spend'

// Paso 2: redactar la edición a partir del dossier, SIN acceso a la web.
//
// Separado del paso 1 por dos razones. La de fondo: quien redacta no debe poder
// traerse un dato nuevo que nadie verificó — si no está en el dossier, no entra
// en la newsletter. Y una de la API: la salida estructurada y las citas de
// documento son mutuamente excluyentes (devuelve 400 si se combinan).
//
// La forma se pide con FORCED TOOL USE, no con salida estructurada
// (`output_config.format`): se probó primero con salida estructurada y la API
// la rechazó dos veces — `minItems` distinto de 0/1 primero, `oneOf` después,
// que es justo lo que necesita el union discriminado de bloques. El
// `input_schema` de una herramienta sí admite ambos, y es el mismo patrón que
// ya usa `carousels/copy.ts` en este repo.
//
// Y DESPUÉS, igual que si fuera salida estructurada, se valida con el mismo
// zod que usa el editor. Doble red: el modelo produce la forma, zod la
// verifica. El esquema JSON se escribe a mano, como ya hace carousels/copy.ts
// — el repo no tiene conversor de zod a JSON Schema y no merece uno por esto.

const MODEL = 'claude-sonnet-5'

export interface DraftResult {
  title:     string
  dek:       string
  content:   NewsletterContent
  sources:   NewsletterSource[]
  dataAsOf:  string | null
  usage:     { input: number; output: number }
}

/** Lo que identifica a la fuente: el medio, y si no lo dio, el hostname. */
function sourceTitleFor(f: ResearchFinding): string {
  const publisher = (f.publisher ?? '').trim()
  if (publisher) return publisher.slice(0, 300)
  try {
    return new URL(f.url).hostname.replace(/^www\./, '').slice(0, 300)
  } catch {
    return ''
  }
}

/**
 * Los hallazgos del dossier son las fuentes de la edición.
 *
 * Los ids son `s1`, `s2`… y son los que los bloques citan en `sourceIds`. Se
 * generan aquí y se le dan al modelo hechos: si los inventara él, citaría ids
 * que no existen y `publishBlockers` bloquearía la edición entera.
 *
 * Doble red también aquí, no sólo en `content`: se sanea (recortar a los
 * máximos del esquema) y LUEGO se valida con `NewsletterSourceSchema` — el
 * mismo esquema que usará `parseNewsletterSources` al releer de la base. Sin
 * esto, una fuente que hoy "parece" válida (pasa el regex laxo de URL, pero
 * no es una URL bien formada; o trae un publisher larguísimo) sobrevive aquí
 * y se descarta en silencio la próxima vez que se lea — dejando huérfano al
 * bloque `stat` que la citaba, y `publishBlockers` reportando una fuente
 * "inexistente" sobre una edición recién generada.
 *
 * El id se asigna DESPUÉS de filtrar: hay que numerar sobre las fuentes que
 * sobreviven, nunca sobre el índice del hallazgo original — si la segunda de
 * tres se descarta, las dos que quedan tienen que ser `s1` y `s2`, no `s1` y
 * `s3`, porque esos ids son justo los que ve el prompt.
 *
 * Se DEDUPLICA por URL, conservando el primer hallazgo. Tres cifras sacadas del
 * mismo artículo son tres hallazgos legítimos, pero una sola fuente: sin esto,
 * la sección "Fuentes" de la página pública lista el mismo enlace tres veces y
 * parece que la edición se apoya en más material del que tiene.
 *
 * Y `title` NO es la afirmación. El esquema (§3.4) define `title` como el
 * título de la FUENTE; el dossier no trae título de artículo, así que se usa lo
 * que sí la identifica —el medio y, si no lo dio, el hostname—. La afirmación
 * ya vive en el bloque que la cita: repetirla aquí convertía la lista de
 * fuentes en una lista de frases sueltas.
 */
export function sourcesFromFindings(findings: ResearchFinding[]): NewsletterSource[] {
  const hoy = new Date().toISOString().slice(0, 10)
  const sources: NewsletterSource[] = []
  const urlsVistas = new Set<string>()
  for (const f of findings) {
    if (!/^https?:\/\//.test(f.url)) continue
    if (urlsVistas.has(f.url)) continue
    urlsVistas.add(f.url)
    const candidato = {
      id:           `s${sources.length + 1}`,
      url:          f.url,
      title:        sourceTitleFor(f),
      publisher:    (f.publisher ?? '').slice(0, 160),
      // Se recorta igual que `title` y `publisher`: el esquema tope la fecha en
      // 30 caracteres, y sin esto una fecha larga no recorta el campo — descarta
      // la fuente ENTERA, que es justo el mecanismo que este saneo introdujo.
      published_at: f.published_at?.slice(0, 30),
      accessed_at:  hoy,
    }
    const validado = NewsletterSourceSchema.safeParse(candidato)
    if (validado.success) sources.push(validado.data)
  }
  return sources
}

/**
 * Esquema del `input` de la herramienta `write_edition`. Espeja
 * `NewsletterContentSchema` de content.ts.
 *
 * Es un `input_schema` de tool use, NO el `schema` de `output_config.format`:
 * la salida estructurada no admite `oneOf` (necesario para el union
 * discriminado de bloques) ni `minItems`/`maxItems` fuera de {0, 1}. El
 * `input_schema` de una herramienta sí admite las dos cosas — verificado
 * contra la API real — así que aquí SÍ llevan sus cotas de verdad (3..40
 * bloques, `sourceIds` con al menos 1 elemento en `stat`). Eso no vuelve
 * redundante a `NewsletterContentSchema`: sigue siendo la red que decide si
 * el contenido es válido PARA ESTE REPO, y la que da el mensaje en español
 * cuando algo no cuadra — el modelo puede respetar la forma y aun así violar
 * una regla que sólo zod conoce (p. ej. los máximos de caracteres por bloque).
 */
export function editionToolSchema(): Anthropic.Tool.InputSchema {
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

/** La herramienta de forced tool use que le arranca la edición al modelo. */
function buildTool(): Anthropic.Tool {
  return {
    name: 'write_edition',
    description: 'Devuelve la edición completa de la newsletter: título, entradilla, fecha de los datos y los bloques de contenido.',
    input_schema: editionToolSchema(),
  }
}

function buildPrompt(args: {
  dossier: NewsletterDossier; language: string; brandName: string; voice: string | null
  sources: NewsletterSource[]
}): string {
  // El listado se arma sobre los HALLAZGOS, no sobre las fuentes: lo que el
  // redactor necesita ver es cada dato con el id que debe citar. Desde que
  // `sourcesFromFindings` deduplica por URL y `title` identifica al medio en vez
  // de repetir la afirmación, una lista de fuentes ya no contiene ninguna cifra
  // y el modelo se quedaría sin material. Dos hallazgos del mismo artículo
  // comparten id, que es exactamente lo que se quiere.
  const idPorUrl = new Map(args.sources.map(s => [s.url, s.id]))
  const listado = args.dossier.findings
    .map(f => {
      const id = idPorUrl.get(f.url)
      return id ? `- ${id}: ${f.claim} — ${f.publisher} (${f.url})` : null
    })
    .filter((l): l is string => l !== null)
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

/**
 * Redacta la edición. Lanza si la salida no valida contra el esquema del repo.
 *
 * Todo fallo posterior a la respuesta del modelo sale como `AiSpentError` con
 * el gasto ya causado; el previo (dossier sin fuentes utilizables) como `Error`
 * a secas, porque no llegó a costar nada.
 */
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
  // petición larga sin stream se arriesga al timeout HTTP del SDK. Con forced
  // tool use el bloque `tool_use` se acumula igual durante el stream;
  // `finalMessage()` lo entrega completo, no hay que reensamblarlo a mano.
  const stream = client.messages.stream({
    model:       MODEL,
    max_tokens:  16000,
    thinking:    { type: 'adaptive' },
    tools:       [buildTool()],
    tool_choice: { type: 'tool', name: 'write_edition' },
    messages:    [{ role: 'user', content: buildPrompt({ ...args, sources }) }],
  })
  const response = await stream.finalMessage()

  // Desde aquí la llamada YA está cobrada: todo fallo sale con su gasto encima
  // para que el orquestador lo registre antes de devolver `{ ok: false }`. La
  // redacción no busca, así que `searches` es 0.
  const spend: AiSpend = {
    usage:    { input: response.usage.input_tokens, output: response.usage.output_tokens },
    searches: 0,
  }

  // El resultado ya no viene en un bloque de texto: viene en `tool_use.input`,
  // y el SDK ya lo entrega como objeto — no hay JSON que parsear a mano.
  const block = response.content.find(b => b.type === 'tool_use')
  if (!block || block.type !== 'tool_use') {
    throw new AiSpentError('La redacción no devolvió el contenido estructurado.', spend)
  }
  const parsed = block.input as Record<string, unknown>

  // La red de zod: aunque el modelo respete el esquema JSON, esto es lo que
  // decide si el contenido es válido PARA ESTE REPO.
  const contenido = NewsletterContentSchema.safeParse({
    v:      NEWSLETTER_CONTENT_VERSION,
    blocks: parsed.blocks,
  })
  if (!contenido.success) {
    throw new AiSpentError(`La redacción no cumple el formato: ${contenido.error.issues[0].message}`, spend)
  }

  const conocidas = new Set(sources.map(s => s.id))
  for (const b of contenido.data.blocks) {
    const ids = b.type === 'stat' ? b.sourceIds : b.type === 'paragraph' ? (b.sourceIds ?? []) : []
    for (const id of ids) {
      if (!conocidas.has(id)) {
        throw new AiSpentError('La redacción citó una fuente que no existe.', spend)
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
    usage: spend.usage,
  }
}
