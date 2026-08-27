import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { MAX_SOURCE_DOMAINS, urlIsAllowed } from '../source-domains'
import { AiSpentError, type AiSpend } from './spend'

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

/**
 * Tope de búsquedas por generación. Está aquí por COSTE, no por capricho.
 *
 * Cada resultado de búsqueda se reenvía en cada turno interno del modelo, así
 * que el gasto crece más que linealmente con este número: con 5–6 búsquedas una
 * edición salía por ~$0,60 contra un presupuesto Growth de $30/mes compartido
 * con TODA la IA del tenant. Con 4 el material sigue sobrando —6 búsquedas
 * dejaban 13 fuentes y la edición usa un puñado— y la factura baja de golpe.
 * Subirlo otra vez es una decisión de precio, no de calidad.
 */
const MAX_SEARCHES = 4

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
  /**
   * Tokens reales de esta llamada. Sin esto el llamador no puede facturar el
   * costo de la investigación — sólo el de las búsquedas — y Anthropic sí
   * cobra estos tokens aunque el ledger los registre en cero.
   */
  usage: { input: number; output: number }
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
 * Los dominios que el rastreador de Anthropic NO puede leer, sacados del error.
 *
 * `allowed_domains` se valida ANTES de inferir: si uno solo de la lista bloquea
 * al rastreador, la llamada entera vuelve con un 400 y este mensaje —
 *
 *   The following domains are not accessible to our user agent:
 *   ['apnews.com', 'nytimes.com', 'pilotonline.com', ...]
 *
 * — sin cobrar nada. Es el fallo que tumbó la primera generación real: la lista
 * automática traía prensa que bloquea a los rastreadores de IA por robots.txt,
 * que es lo normal en los grandes diarios.
 *
 * Devolver los nombres permite podarlos y reintentar en vez de rendirse. Y hay
 * que poder hacerlo en caliente: qué sitio bloquea al rastreador cambia con el
 * tiempo, así que una lista curada a mano se pudre sola.
 */
export function parseInaccessibleDomains(error: unknown): string[] {
  const mensaje =
    typeof error === 'string' ? error
    : error instanceof Error ? error.message
    : ''
  if (!mensaje.includes('not accessible to our user agent')) return []

  // Los nombres van entre comillas dentro de un array estilo Python.
  const lista = mensaje.slice(mensaje.indexOf('not accessible to our user agent'))
  const encontrados = lista.match(/['"]([a-z0-9.-]+\.[a-z]{2,})['"]/gi) ?? []
  const limpios = encontrados
    .map(m => m.replace(/['"]/g, '').trim().toLowerCase())
    .filter(Boolean)
  return [...new Set(limpios)]
}

/**
 * Investiga y devuelve el dossier. Lanza si no hay nada utilizable — el
 * llamador lo convierte en `{ ok: false }`; aquí no se decide cómo se muestra.
 *
 * Todo fallo POSTERIOR a la respuesta de la API sale como `AiSpentError` con el
 * gasto ya causado, para que el orquestador lo registre antes de rendirse. Los
 * anteriores (sin fuentes declaradas) salen como `Error` a secas: no costaron.
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

  // A partir de aquí Anthropic YA cobró esta llamada, así que todo fallo se
  // lanza con el gasto encima: el orquestador lo registra antes de rendirse.
  const spend: AiSpend = {
    usage:    { input: response.usage.input_tokens, output: response.usage.output_tokens },
    searches,
  }

  if (!text) {
    const detalle = errores.length ? ` (${errores.join(', ')})` : ''
    throw new AiSpentError(`La investigación no devolvió nada${detalle}.`, spend)
  }

  // El modelo responde con el JSON pedido incluso cuando la búsqueda falló
  // por completo (el prompt le exige responder siempre), así que `text` no
  // vacío no es garantía de que hubo búsqueda real. Sin esto, un fallo total
  // de la herramienta se ve idéntico a que el modelo decidiera no buscar.
  try {
    assertSearchInfraOk(searches, errores)
  } catch (e) {
    throw new AiSpentError(e instanceof Error ? e.message : 'La búsqueda web falló.', spend)
  }

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
        // Dos filtros distintos. Un hallazgo sin URL no sirve para nada aquí:
        // el paso 2 no podría citarlo y publishBlockers acabaría bloqueando la
        // edición. Y uno con una URL FUERA de la allowlist es peor que inútil:
        // la búsqueda estaba cerrada, pero el JSON lo escribe el modelo, así
        // que un dominio ajeno sólo puede venir de una alucinación o de un
        // `topic` redactado para inducirla — y acabaría publicado con la marca
        // del cliente encima.
        .filter(f => f.claim && urlIsAllowed(f.url, args.domains))
    : []

  return {
    topic:    String(parsed?.topic ?? args.topic ?? '').trim(),
    summary:  String(parsed?.summary ?? '').trim(),
    findings,
    searches,
    searchErrors: errores,
    rawText:  text.slice(0, 4000),
    usage: spend.usage,
  }
}
