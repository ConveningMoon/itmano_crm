import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import {
  NewsletterContentSchema, NewsletterSourceSchema, NEWSLETTER_CONTENT_VERSION,
  CONTENT_LIMITS,
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
// `input_schema` de una herramienta sí admite ambos.
//
// Y DESPUÉS, igual que si fuera salida estructurada, se valida con el mismo
// zod que usa el editor. Doble red: el modelo produce la forma, zod la
// verifica. El esquema JSON se escribe a mano: el repo no tiene conversor de
// zod a JSON Schema y no merece uno por esto.

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
  // `maxLength` en CADA campo que zod acota, con el número de CONTENT_LIMITS.
  // Es lo único que le dice al modelo cuánto cabe: sin esto respetaba los topes
  // por casualidad, y una edición entera se perdía —después de pagar la
  // investigación— porque un `value` se pasó de largo. Los números salen de la
  // misma constante que usa el zod que lo valida después, para que no puedan
  // separarse.
  const L = CONTENT_LIMITS
  const bloque = {
    type: 'object',
    oneOf: [
      { properties: { type: { const: 'heading' },   level: { enum: [2, 3] },
                      text: { type: 'string', maxLength: L.heading,
                              description: 'Microtitular con su propia tensión, no una etiqueta de sección. "Contexto", "Datos" o "Conclusión" no son encabezados: son índices.' } },
        required: ['type', 'level', 'text'] },
      { properties: { type: { const: 'paragraph' }, text: { type: 'string', maxLength: L.paragraph },
                      sourceIds: { type: 'array', items: { type: 'string' } } },
        required: ['type', 'text'] },
      { properties: { type: { const: 'list' }, style: { enum: ['bullet', 'number'] },
                      items: { type: 'array', items: { type: 'string', maxLength: L.listItem } } },
        required: ['type', 'style', 'items'] },
      { properties: { type: { const: 'quote' }, text: { type: 'string', maxLength: L.quote },
                      attribution: { type: 'string', maxLength: L.quoteAttribution } },
        required: ['type', 'text'] },
      { properties: { type: { const: 'callout' }, tone: { enum: ['info', 'warning'] },
                      text: { type: 'string', maxLength: L.callout } },
        required: ['type', 'tone', 'text'] },
      { properties: { type: { const: 'stat' },
                      label: { type: 'string', maxLength: L.statLabel },
                      value: { type: 'string', maxLength: L.statValue },
                      sourceIds: { type: 'array', items: { type: 'string' } } },
        required: ['type', 'label', 'value'] },
    ],
  }

  return {
    type: 'object',
    properties: {
      title:       { type: 'string', maxLength: L.editionTitle,
                     description: 'Titular de la edición: lo que está en juego, no el nombre del tema. Sujeto y verbo, concreto, sin signos de exclamación y sin prometer nada que el cuerpo no pague.' },
      dek:         { type: 'string', maxLength: L.editionDek,
                     description: 'Entradilla de una o dos frases que da un motivo para seguir leyendo. No repite el titular con otras palabras.' },
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
    `\n5. Sin emojis, sin signos de exclamación, sin promesas de rentabilidad.`,
    `\n6. Entre 4 y 10 bloques. Empieza por un heading de nivel 2.`,
    // Sin esto la edición sale correcta y muerta: informe de mercado, no algo
    // que alguien elija leer. El enganche no se pide con adjetivos ni con
    // signos de exclamación — sale de nombrar lo que el dato le hace a quien
    // lee. Por eso estas reglas van DESPUÉS de las de veracidad y se apoyan en
    // ellas: la tensión tiene que ser la que los hechos ya contienen.
    `\n\nCómo se escribe. Esto es lo que separa una newsletter que se lee de una que se archiva sin abrir:`,
    `\n- Escribes para UNA persona: alguien que está pensando en comprar o vender y no sabe si este mes le conviene. Háblale de tú a tú, en segunda persona.`,
    `\n- Abre por la consecuencia, no por el contexto. La primera frase tiene que dejar claro qué está en juego para quien lee. "En el contexto actual del mercado inmobiliario" es exactamente la frase que hace cerrar el correo.`,
    `\n- Frases cortas. Una idea por párrafo. Verbos concretos y sujetos con nombre.`,
    `\n- Prohibidas las muletillas de informe: "cabe destacar", "es importante mencionar", "en un mundo cada vez más", "sin duda", "en resumen", "como sabemos", "este artículo". Si una frase se puede borrar sin perder información, bórrala.`,
    `\n- Cada cifra viene con su consecuencia: qué significa para quien compra o vende esta semana. Un dato sin consecuencia es relleno.`,
    `\n- Cierra cada sección con algo sin resolver que la siguiente recoge. El lector tiene que tener un motivo para seguir bajando.`,
    `\n- Termina diciendo qué hacer con esto: una acción concreta, no un resumen de lo que ya escribiste.`,
    `\n- Nada de hype ni de clickbait. La tensión sale de lo que los datos implican de verdad, y el cuerpo paga TODO lo que el titular promete. Exagerar un dato para que suene mejor rompe la regla 2.`,
    `\n\nTítulo y encabezados. Un título que nombra el tema es un archivador; uno que nombra lo que está en juego es una noticia:`,
    `\n- Mal: "El mercado inmobiliario en agosto". Bien: "Tu casa ya no compite con las que se vendieron en marzo".`,
    `\n- Prohibidos los títulos de categoría o de una sola palabra: "Mercado", "Tendencias", "Actualidad", "Novedades del sector", "Informe mensual".`,
    `\n- La entradilla no repite el título: promete lo que el lector se lleva si sigue, y deja la respuesta dentro.`,
    `\n- Los encabezados de sección son parte del gancho. Escríbelos como microtitulares, no como etiquetas ("Contexto", "Datos", "Conclusión").`,
    // El tope que de verdad se rompe. Va también en el prompt y no sólo en el
    // esquema: `value` es el campo más estrecho con diferencia y el modelo
    // tiende a meterle el contexto del dato ("48 días, frente a 37 el año
    // anterior"), que es justo lo que lo hace útil. Decirle dónde cortar sale
    // mucho más barato que rechazarle la edición entera después de pagarla.
    `\n7. El "value" de un bloque "stat" no puede pasar de ${CONTENT_LIMITS.statValue} caracteres:`,
    ` la cifra y, si cabe, una comparación breve. El contexto largo va en un párrafo.`,
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
    const ids = (b.type === 'stat' || b.type === 'paragraph') ? (b.sourceIds ?? []) : []
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
