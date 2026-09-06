import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { recordAiUsage } from '@/lib/services/ai-usage'
import { parseSourceDomains, MAX_SOURCE_DOMAINS } from '../source-domains'
import type { TenantContext } from '@/lib/auth/tenant-context'

// De dónde salen las fuentes de una newsletter.
//
// Antes se las pedíamos al cliente: una caja de texto en Ajustes donde tenía
// que escribir hostnames a mano. Era el paso que más gente iba a abandonar, y
// además el que peor podía resolver — un agente inmobiliario no sabe (ni tiene
// por qué) qué dominios sirven de fuente verificable para su mercado. Y sin
// esa lista, generar con IA estaba bloqueado: la feature entera dependía de
// una tarea confusa hecha por quien menos contexto tenía.
//
// Ahora se generan solas la primera vez que el tenant genera una edición con
// IA, a partir de lo que el CRM YA sabe de él: las zonas principales y
// secundarias de "Tu negocio" y su descripción. El modelo propone las fuentes
// de ESE mercado —estadística oficial, portales, hipotecas, prensa local— y se
// guardan en `tenants.newsletter_source_domains`, que sigue siendo la llave de
// todo lo demás. Cero pasos para el usuario.
//
// La allowlist no deja de ser lo que hace el sistema verificable por
// construcción: lo que cambia es QUIÉN la escribe, no que exista.

const MODEL = 'claude-sonnet-5'

/**
 * El suelo: fuentes que valen en cualquier mercado del mundo.
 *
 * Existe para que NUNCA se acabe con la lista vacía. Si el modelo falla, si el
 * tenant no declaró zonas todavía, o si lo que propone no sobrevive a la
 * normalización, con esto se puede generar igual — con menos color local, pero
 * con datos citables.
 *
 * Deliberadamente institucional: organismos que publican series de vivienda,
 * tipos y demografía en abierto. Las fuentes de un país concreto (NAR y Redfin
 * en EE. UU., el INE e Idealista en España) NO van aquí: las pone el modelo
 * según dónde opere la agencia, que es lo que evita que un tenant de Barcelona
 * reciba una lista pensada para Virginia.
 *
 * Aquí NO va prensa. Reuters y AP estaban en esta lista y tumbaron la primera
 * generación real con un 400: `allowed_domains` se valida contra lo que el
 * rastreador de Anthropic puede leer, y los grandes diarios lo bloquean por
 * robots.txt. Un organismo público no lo hace nunca — por eso el suelo, que es
 * la parte que no puede fallar, es sólo institucional.
 */
export const GLOBAL_SOURCE_DOMAINS: readonly string[] = [
  'oecd.org',
  'imf.org',
  'worldbank.org',
  'bis.org',
  'tradingeconomics.com',
]

const TOOL_NAME = 'propose_sources'

/** El esquema del tool use. Escrito a mano, como el resto del repo. */
function toolSchema() {
  return {
    type: 'object' as const,
    properties: {
      domains: {
        type: 'array',
        minItems: 8,
        maxItems: 48,
        items: {
          type: 'string',
          description: 'Un hostname, sin protocolo ni ruta. Ej: "nar.realtor", "ine.es".',
        },
      },
    },
    required: ['domains'],
    additionalProperties: false,
  }
}

function buildPrompt(args: {
  brandName: string
  description: string | null
  areas: string[]
  secondaryAreas: string[]
}): string {
  const zonas = [...args.areas, ...args.secondaryAreas].filter(Boolean)
  return [
    `Trabajo con ${args.brandName}, una agencia inmobiliaria.`,
    zonas.length > 0
      ? ` Opera en: ${zonas.join(', ')}.`
      : ' No tengo sus zonas declaradas, así que asume un alcance nacional e internacional.',
    args.description ? ` Así se describe: ${args.description}` : '',
    '\n\nNecesito la lista de SITIOS WEB que una búsqueda automática puede consultar',
    ' como fuente verificable para escribir una newsletter de mercado inmobiliario',
    ' dirigida a los clientes de esa agencia.',
    '\n\nIncluye, en este orden de prioridad:',
    '\n1. Estadística oficial y organismos públicos del PAÍS donde opera (institutos',
    ' de estadística, catastro/registro, banco central, agencias de vivienda).',
    '\n2. Los portales inmobiliarios y fuentes de datos de mercado más usados en ese país.',
    '\n3. Fuentes de hipotecas y tipos de interés de ese país.',
    '\n4. Prensa que cubra vivienda y economía de esa zona, pero SOLO medios de',
    ' acceso abierto.',
    '\n5. Alguna referencia internacional de mercado inmobiliario.',
    '\n\nUNA REGLA QUE TUMBA TODO SI FALLA: los grandes diarios de pago y la mayoría',
    ' de cadenas de prensa (The New York Times, The Wall Street Journal, Reuters, AP,',
    ' y los periódicos locales de grupos grandes) BLOQUEAN a los rastreadores',
    ' automáticos en su robots.txt. Si incluyes uno solo, la busqueda entera se',
    ' rechaza y no se genera nada. Ante la duda, pon el organismo oficial y no el',
    ' periódico.',
    '\n\nReglas estrictas:',
    '\n- Devuelve HOSTNAMES, no URLs: "nar.realtor", no "https://www.nar.realtor/research".',
    '\n- Sin "www.".',
    '\n- Sólo sitios que existan de verdad y publiquen contenido accesible. No inventes dominios.',
    '\n- Nada de blogs personales, foros, redes sociales ni agregadores de contenido ajeno.',
    '\n- Nada de sitios de la competencia directa de la agencia.',
  ].join('')
}

/**
 * Le pide al modelo las fuentes propias de ese mercado. Devuelve [] si algo
 * falla: el llamador ya tiene el suelo global, así que un fallo aquí degrada
 * la calidad de la lista, nunca impide generar.
 */
async function proposeDomains(args: {
  brandName: string
  description: string | null
  areas: string[]
  secondaryAreas: string[]
}): Promise<{ domains: string[]; usage: { input: number; output: number } | null }> {
  try {
    const client = new Anthropic()
    const res = await client.messages.create({
      model:       MODEL,
      max_tokens:  1500,
      tools:       [{
        name: TOOL_NAME,
        description: 'Devuelve las fuentes web consultables para el mercado de esta agencia.',
        input_schema: toolSchema(),
      }],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages:    [{ role: 'user', content: buildPrompt(args) }],
    })

    const usage = { input: res.usage.input_tokens, output: res.usage.output_tokens }
    const bloque = res.content.find(b => b.type === 'tool_use')
    if (!bloque || bloque.type !== 'tool_use') return { domains: [], usage }

    const crudo = (bloque.input as { domains?: unknown } | null)?.domains
    // La misma puerta de normalización que todo lo demás: lo que el modelo
    // proponga pasa por `parseSourceDomains` o no entra. Un dominio inventado
    // con forma válida sigue siendo posible — pero un dominio que no existe no
    // devuelve resultados de búsqueda, así que se queda en ruido inofensivo,
    // no en una cita falsa.
    return { domains: parseSourceDomains(crudo).domains, usage }
  } catch {
    return { domains: [], usage: null }
  }
}

const SOURCE_COLUMNS = columns('tenants', ['newsletter_source_domains'])

export interface EnsureResult {
  domains: string[]
  /** true cuando esta llamada las generó y guardó (la primera vez del tenant). */
  generated: boolean
}

/**
 * La allowlist del tenant, generándola si todavía no tiene.
 *
 * Idempotente por construcción: si la fila ya trae dominios se devuelven tal
 * cual y no se gasta un token. Sólo la PRIMERA generación con IA del tenant
 * paga esta llamada, y es barata (sin búsqueda web, ~1.500 tokens de salida).
 *
 * El gasto se registra en el ledger como `newsletter_sources` para que aparezca
 * en el panel de uso igual que el resto: nada que cueste dinero puede quedar
 * fuera de ahí.
 */
export async function ensureSourceDomains(
  ctx: TenantContext,
  tenant: { name: string; description: string | null; areas: string[]; secondaryAreas: string[] },
): Promise<EnsureResult> {
  const tenantId = ctx.tenant_id
  if (!tenantId) return { domains: [], generated: false }

  const db = createAdminClient()
  const { data } = await db
    .from('tenants').select(SOURCE_COLUMNS).eq('id', tenantId).maybeSingle()
  // reason: el cliente de Supabase no está tipado en este repo; columns() ya
  // validó la lista contra el esquema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existentes = parseSourceDomains((data as any)?.newsletter_source_domains).domains
  if (existentes.length > 0) return { domains: existentes, generated: false }

  const propuestas = await proposeDomains({
    brandName:      tenant.name,
    description:    tenant.description,
    areas:          tenant.areas,
    secondaryAreas: tenant.secondaryAreas,
  })

  if (propuestas.usage) {
    // Best-effort, como el resto del ledger: no poder anotar el gasto no puede
    // tumbar la generación que el usuario está esperando.
    try {
      await recordAiUsage({
        tenantId,
        userId:  ctx.user_id,
        feature: 'newsletter_sources',
        model:   MODEL,
        usage:   { input_tokens: propuestas.usage.input, output_tokens: propuestas.usage.output },
        metadata: { propuestas: propuestas.domains.length },
      })
    } catch { /* ver arriba */ }
  }

  // Las propuestas del mercado PRIMERO y el suelo global después: si la lista
  // se trunca en MAX_SOURCE_DOMAINS, lo que sobra tiene que ser lo genérico,
  // no lo local — que es lo único que el suelo no puede aportar.
  const { domains } = parseSourceDomains([...propuestas.domains, ...GLOBAL_SOURCE_DOMAINS])
  const finales = domains.slice(0, MAX_SOURCE_DOMAINS)

  const { error } = await db
    .from('tenants').update({ newsletter_source_domains: finales }).eq('id', tenantId)
  if (error) {
    // Se devuelven igual: la generación de ESTA edición puede seguir. Lo que se
    // pierde es no tener que repetir la propuesta la próxima vez.
    console.error('[newsletter-sources] no se pudieron guardar:', error.message)
    return { domains: finales, generated: false }
  }

  return { domains: finales, generated: true }
}

/**
 * Quita dominios de la allowlist guardada y devuelve la lista resultante.
 *
 * La usa el orquestador cuando la API rechaza la búsqueda por dominios que su
 * rastreador no puede leer: se podan, se guarda la lista limpia y se reintenta.
 * Guardar es lo que hace que el problema se arregle UNA vez y no en cada
 * generación — y es necesario porque qué sitio bloquea al rastreador cambia con
 * el tiempo, así que ninguna lista curada a mano aguanta.
 */
export async function pruneSourceDomains(
  tenantId: string,
  remove: string[],
): Promise<string[]> {
  const fuera = new Set(remove.map(d => d.trim().toLowerCase()).filter(Boolean))
  if (fuera.size === 0) return []

  const db = createAdminClient()
  const { data } = await db
    .from('tenants').select(SOURCE_COLUMNS).eq('id', tenantId).maybeSingle()
  // reason: el cliente de Supabase no está tipado en este repo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actuales = parseSourceDomains((data as any)?.newsletter_source_domains).domains
  const restantes = actuales.filter(d => !fuera.has(d))
  if (restantes.length === actuales.length) return actuales

  const { error } = await db
    .from('tenants').update({ newsletter_source_domains: restantes }).eq('id', tenantId)
  if (error) console.error('[newsletter-sources] no se pudo podar:', error.message)
  return restantes
}
