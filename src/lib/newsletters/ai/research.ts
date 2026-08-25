import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { MAX_SOURCE_DOMAINS } from '../source-domains'

// Paso 1 del pipeline: investigar el mercado de la agencia con la herramienta
// de servidor `web_search`, restringida a la allowlist del tenant.
//
// Por qué la allowlist va en la HERRAMIENTA y no en el prompt: un prompt que
// pide "usa fuentes fiables" es una súplica que el modelo puede ignorar sin
// que nadie se entere. `allowed_domains` es un cierre — lo que no está ahí no
// se encuentra, así que no se puede citar. Esa es toda la diferencia entre
// "una newsletter escrita con IA" y "una newsletter verificable".
//
// Este paso NO produce la edición. Produce el dossier del que el paso 2 redacta.

const MODEL = 'claude-sonnet-5'

/** Tope de búsquedas por generación. Acota el gasto y el tiempo de respuesta. */
const MAX_SEARCHES = 6

export interface ResearchFinding {
  claim:         string
  url:           string
  publisher:     string
  published_at?: string
}

export interface NewsletterDossier {
  topic:    string
  /**
   * Por qué el tema le importa a los clientes de esta agencia. Es contexto
   * para el redactor del paso 2, NO contenido publicable: a diferencia de
   * `findings`, no lleva URL, así que ninguna cifra que traiga se puede
   * verificar. Lo que se publica sale de los bloques del paso 2, que sí
   * exigen fuente.
   */
  summary:  string
  findings: ResearchFinding[]
  /** Búsquedas realizadas CON ÉXITO. Alimenta el ledger de costos. */
  searches: number
  /** Códigos de error de las búsquedas que fallaron (`collectSearchErrors`). */
  searchErrors: string[]
  /** Texto crudo de la respuesta, para depurar cuando el JSON no parsee. */
  rawText:  string
}

/**
 * Cuántas búsquedas se hicieron de verdad.
 *
 * Un bloque de resultado trae `content` como LISTA cuando la búsqueda fue bien
 * y como OBJETO cuando falló. Se cuentan sólo las que fueron bien: una búsqueda
 * fallida no se factura, y contarla inflaría el presupuesto del tenant.
 */
export function extractSearchCount(content: unknown[]): number {
  if (!Array.isArray(content)) return 0
  return content.filter(b => {
    if (!b || typeof b !== 'object') return false
    const block = b as { type?: unknown; content?: unknown }
    return block.type === 'web_search_tool_result' && Array.isArray(block.content)
  }).length
}

/**
 * Los códigos de error de las búsquedas que fallaron.
 *
 * Las herramientas de servidor NO lanzan: el error llega con HTTP 200 dentro
 * del propio bloque. Sin mirar aquí, un fallo total de búsqueda parecería
 * simplemente "no encontré nada" y acabaría en una newsletter sin datos.
 */
export function collectSearchErrors(content: unknown[]): string[] {
  if (!Array.isArray(content)) return []
  const codes: string[] = []
  for (const b of content) {
    if (!b || typeof b !== 'object') continue
    const block = b as { type?: unknown; content?: unknown }
    if (block.type !== 'web_search_tool_result') continue
    if (Array.isArray(block.content)) continue
    const err = block.content as { error_code?: unknown } | null
    if (err && typeof err.error_code === 'string') codes.push(err.error_code)
  }
  return codes
}

/**
 * Distingue un fallo real de la herramienta de que el modelo, simplemente, no
 * buscó.
 *
 * `searches === 0` por sí solo no basta: el modelo puede decidir no buscar
 * porque el tema no lo necesitaba, y eso no es un fallo — el orquestador ya
 * rechaza un dossier sin hallazgos. Pero si además hay `searchErrors` (la
 * herramienta respondió con `error_code`, p. ej. `max_uses_exceeded`), el
 * modelo casi siempre igual devuelve el JSON pedido con `findings: []` porque
 * el prompt le exige responder siempre con ese objeto — así que el `text` no
 * queda vacío y el fallo de infraestructura se disfrazaría de "no había
 * nada". Uno hay que verlo; el otro no.
 */
export function assertSearchInfraOk(searches: number, searchErrors: string[]): void {
  if (searches === 0 && searchErrors.length > 0) {
    throw new Error(`La búsqueda web falló: ${searchErrors.join(', ')}`)
  }
}

/** Extrae el primer objeto JSON de un texto que puede traer prosa alrededor. */
function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{')
  const end   = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

function buildPrompt(args: {
  topic: string | null; language: string; market: string; areas: string[]; brandName: string
}): string {
  const hoy = new Date().toISOString().slice(0, 10)
  const zonas = args.areas.length ? ` Zonas donde opera: ${args.areas.join(', ')}.` : ''
  const tema = args.topic
    ? ` El tema pedido es: "${args.topic}".`
    : ' Elige tú el tema más útil y actual para los clientes de esa agencia.'

  return [
    `Hoy es ${hoy}. Investigas para ${args.brandName}, una agencia inmobiliaria`,
    args.market ? ` que opera en ${args.market}.` : '.',
    zonas,
    tema,
    ` Usa la búsqueda web para reunir datos concretos y actuales sobre ese mercado.`,
    ` Cada dato numérico que reportes DEBE venir con la URL exacta de donde salió.`,
    ` Si un dato no lo puedes respaldar con una fuente, NO lo reportes: es preferible`,
    ` un informe más corto que uno con cifras que nadie puede comprobar.`,
    ` No inventes cifras bajo ninguna circunstancia.`,
    `\n\nResponde SOLO con un objeto JSON válido, sin markdown y sin texto alrededor:`,
    `\n{"topic":"el tema en una frase","summary":"por qué le importa a los clientes de esta agencia, 2-3 frases, EN TÉRMINOS CUALITATIVOS Y SIN CIFRAS — toda cifra va en findings, que es el único lugar con URL para respaldarla",`,
    `"findings":[{"claim":"el dato concreto, con su cifra","url":"https://...","publisher":"quién lo publica","published_at":"YYYY-MM-DD si se sabe"}]}`,
    `\n\nEscribe el contenido en ${args.language}.`,
  ].join('')
}

/**
 * Investiga y devuelve el dossier. Lanza si no hay nada utilizable — el
 * llamador lo convierte en `{ ok: false }`; aquí no se decide cómo se muestra.
 */
export async function researchMarket(args: {
  topic:     string | null
  language:  string
  market:    string
  areas:     string[]
  domains:   string[]
  brandName: string
}): Promise<NewsletterDossier> {
  if (args.domains.length === 0) {
    throw new Error('Sin fuentes declaradas no se puede investigar.')
  }

  const client = new Anthropic()

  const response = await client.messages.create({
    model:      MODEL,
    max_tokens: 8000,
    // Sonnet 5 sólo admite el modo adaptativo; `budget_tokens` devuelve 400.
    thinking:   { type: 'adaptive' },
    tools: [{
      type: 'web_search_20260209',
      name: 'web_search',
      max_uses: MAX_SEARCHES,
      // De 1 a 64 hostnames. NO se puede combinar con blocked_domains.
      allowed_domains: args.domains.slice(0, MAX_SOURCE_DOMAINS),
    }],
    messages: [{ role: 'user', content: buildPrompt(args) }],
  })

  const content = response.content as unknown[]
  const searches = extractSearchCount(content)
  const errores  = collectSearchErrors(content)

  const text = (response.content as { type: string; text?: string }[])
    .filter(b => b.type === 'text')
    .map(b => b.text ?? '')
    .join('')
    .trim()

  if (!text) {
    const detalle = errores.length ? ` (${errores.join(', ')})` : ''
    throw new Error(`La investigación no devolvió nada${detalle}.`)
  }

  // El modelo responde con el JSON pedido incluso cuando la búsqueda falló
  // por completo (el prompt le exige responder siempre), así que `text` no
  // vacío no es garantía de que hubo búsqueda real. Sin esto, un fallo total
  // de la herramienta se ve idéntico a que el modelo decidiera no buscar.
  assertSearchInfraOk(searches, errores)

  const parsed = extractJson(text)
  const findings: ResearchFinding[] = Array.isArray(parsed?.findings)
    ? (parsed!.findings as unknown[])
        .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
        .map(f => ({
          claim:        String(f.claim ?? '').trim(),
          url:          String(f.url ?? '').trim(),
          publisher:    String(f.publisher ?? '').trim(),
          published_at: typeof f.published_at === 'string' ? f.published_at : undefined,
        }))
        // Un hallazgo sin URL no sirve para nada aquí: el paso 2 no podría
        // citarlo y publishBlockers acabaría bloqueando la edición.
        .filter(f => f.claim && /^https?:\/\//.test(f.url))
    : []

  return {
    topic:    String(parsed?.topic ?? args.topic ?? '').trim(),
    summary:  String(parsed?.summary ?? '').trim(),
    findings,
    searches,
    searchErrors: errores,
    rawText:  text.slice(0, 4000),
  }
}
