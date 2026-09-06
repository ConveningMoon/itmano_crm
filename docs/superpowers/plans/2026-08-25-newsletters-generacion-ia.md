# Newsletters — Plan 2: generación con IA

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un tenant pueda pedir una edición de newsletter a la IA sobre el mercado de su agencia, recibirla como borrador con cada dato respaldado por una fuente citable, y generar su portada — sin que nada se publique solo.

**Architecture:** Dos pasos separados con Claude Sonnet 5. El primero investiga con la herramienta de servidor `web_search`, restringida por `allowed_domains` a una allowlist de fuentes que define el mercado de esa agencia, y devuelve un dossier con URLs. El segundo redacta sobre ese dossier, sin acceso a la web, con salida estructurada que se valida contra el `NewsletterContentSchema` que ya existe. La portada se genera después, cuando ya hay titular, reutilizando el Estudio con un formato apaisado nuevo.

**Tech Stack:** `@anthropic-ai/sdk` ^0.110.0 · `claude-sonnet-5` · herramienta de servidor `web_search_20260209` · zod · Next.js 16.2 · Vitest.

**Spec:** `docs/superpowers/specs/2026-08-24-newsletters-design.md` — §5 (pipeline de IA) es la sección que este plan implementa.

**Plan anterior:** `docs/superpowers/plans/2026-08-24-newsletters-fundamentos.md`, completo y en producción. Este plan se apoya en lo que dejó: `NewsletterContentSchema`, `publishBlockers`, el data layer, el editor y las server actions.

## Global Constraints

- **Nunca commits directos a `main`.** Este trabajo va en una rama `feat/newsletters-ia`.
- **Prohibido firmar como IA** en cualquier commit: nada de `Co-Authored-By: Claude`, "generated with", ni emojis.
- **Commits en español**, convencionales, cortos, un cambio lógico cada uno.
- **Migraciones: sandbox primero** (`xpaixcowvyksgluazwzn`), producción después y **preguntando antes** (`kvmjlrvlnhiarrqxulkr` tiene datos reales de un cliente). Usar el conector MCP que exige `project_id` explícito; el conector sin sufijo apunta a producción.
- **El modelo es `claude-sonnet-5`.** Decisión tomada con números en el spec §10: las alternativas más baratas ahorran ~$0,19 por edición y costarían perder `allowed_domains` server-side. No lo cambies.
- **La IA nunca publica.** Todo lo que genere nace con `status = 'draft'`.
- **`assertAiWithinLimit` va ANTES de gastar**, en cada paso que llame a un modelo. Es el orden que ya respeta `src/lib/studio/generate.ts`.
- **Toda lista de columnas de un `.select()` se arma con `columns()`** de `src/lib/supabase/columns.ts`.
- **Server Actions devuelven** `{ ok: true, data }` o `{ ok: false, error }`. Nunca lanzan. Validan con zod.
- **Copy en español neutro latino**, sin emojis, "inversión" nunca "costo/precio/pago".
- **TypeScript strict**: nada de `any` sin un comentario `// reason:` en la línea ANTERIOR al `eslint-disable-next-line`, que a su vez va justo encima de la línea del `any`.
- Tras cada tarea: `npx tsc --noEmit` y `npm run lint`.

## Lo que la referencia actual de la API obliga, y el spec no sabía

Verificado contra la guía vigente de la Claude API. Estos cuatro puntos aparecen en las tareas donde tocan, pero conviene leerlos juntos:

1. **El tipo de la herramienta es `web_search_20260209`**, no `web_search_20250305`. La variante nueva trae filtrado dinámico y **ejecuta código por debajo**: no declares `code_execution` en el mismo `tools`, porque un segundo entorno de ejecución confunde al modelo.
2. **Los errores de herramienta de servidor no lanzan.** Llegan con HTTP 200 dentro de un bloque `web_search_tool_result`. En éxito, su `content` es una **lista**; en error, un **objeto** con `error_code`. Hay que ramificar por eso antes de indexar, o revienta con un error de tipo que no dice nada.
3. **`allowed_domains` y `blocked_domains` son excluyentes.** De 1 a 64 hostnames planos, subdominios incluidos. Se rechazan IPs, TLD desnudos, nombres de una sola etiqueta y `localhost`.
4. **Sonnet 5**: `thinking` solo admite `{ type: 'adaptive' }` — `budget_tokens` devuelve 400. No admite prefill de asistente. Para salidas largas, streaming con `.finalMessage()`.

---

### Task 1: Validación de la allowlist de dominios

Puro y client-safe. El modal de generación lo usa para avisar antes de gastar, y el servidor para no mandar a la API una lista que va a rechazar.

**Files:**
- Create: `src/lib/newsletters/source-domains.ts`
- Test: `tests/newsletters/source-domains.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `MAX_SOURCE_DOMAINS` (número, 64), `normalizeDomain(raw: string): string | null`, `parseSourceDomains(raw: unknown): { domains: string[]; rejected: string[] }`, `canGenerateWithAi(domains: string[] | null): boolean`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// tests/newsletters/source-domains.test.ts
import { describe, it, expect } from 'vitest'
import {
  MAX_SOURCE_DOMAINS, normalizeDomain, parseSourceDomains, canGenerateWithAi,
} from '@/lib/newsletters/source-domains'

describe('normalizeDomain', () => {
  it('acepta un hostname normal y lo deja en minusculas', () => {
    expect(normalizeDomain('NAR.realtor')).toBe('nar.realtor')
    expect(normalizeDomain('fred.stlouisfed.org')).toBe('fred.stlouisfed.org')
  })

  it('quita el esquema, la ruta y los espacios', () => {
    expect(normalizeDomain('  https://www.idealista.com/precios/  ')).toBe('www.idealista.com')
    expect(normalizeDomain('http://ine.es')).toBe('ine.es')
  })

  it('rechaza lo que la herramienta rechaza', () => {
    expect(normalizeDomain('192.168.1.1')).toBeNull()   // IP
    expect(normalizeDomain('8.8.8.8')).toBeNull()       // IP
    expect(normalizeDomain('com')).toBeNull()           // TLD desnudo
    expect(normalizeDomain('localhost')).toBeNull()     // una sola etiqueta
    expect(normalizeDomain('intranet')).toBeNull()      // una sola etiqueta
    expect(normalizeDomain('')).toBeNull()
    expect(normalizeDomain('   ')).toBeNull()
  })
})

describe('parseSourceDomains', () => {
  it('separa lo valido de lo rechazado y deduplica', () => {
    const r = parseSourceDomains(['nar.realtor', 'NAR.realtor', '10.0.0.1', 'zillow.com'])
    expect(r.domains).toEqual(['nar.realtor', 'zillow.com'])
    expect(r.rejected).toEqual(['10.0.0.1'])
  })

  it('trunca en el maximo que admite la herramienta', () => {
    const muchos = Array.from({ length: 80 }, (_, i) => `fuente${i}.example.com`)
    expect(parseSourceDomains(muchos).domains).toHaveLength(MAX_SOURCE_DOMAINS)
  })

  it('devuelve vacio ante basura, sin lanzar', () => {
    expect(parseSourceDomains(null)).toEqual({ domains: [], rejected: [] })
    expect(parseSourceDomains('nar.realtor')).toEqual({ domains: [], rejected: [] })
    expect(parseSourceDomains({})).toEqual({ domains: [], rejected: [] })
  })
})

describe('canGenerateWithAi', () => {
  it('sin dominios declarados no se puede generar', () => {
    expect(canGenerateWithAi(null)).toBe(false)
    expect(canGenerateWithAi([])).toBe(false)
  })

  it('con al menos uno, si', () => {
    expect(canGenerateWithAi(['nar.realtor'])).toBe(true)
  })
})
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run tests/newsletters/source-domains.test.ts`
Esperado: FAIL — no se resuelve `@/lib/newsletters/source-domains`.

- [ ] **Step 3: Escribir la implementación**

```ts
// src/lib/newsletters/source-domains.ts

// La allowlist de fuentes de un tenant: los dominios que la búsqueda web puede
// consultar al generar una newsletter.
//
// Es lo que hace el sistema verificable POR CONSTRUCCIÓN y no por instrucción:
// un dato que no esté en estas fuentes no se encuentra, así que no se puede
// citar. Un prompt que pida "usa fuentes fiables" es una súplica; esto es un
// cierre.
//
// Puro y client-safe: el modal lo usa para avisar ANTES de gastar, y el
// servidor para no mandar a la API una lista que va a rechazar igualmente.

/** Tope de la herramienta `web_search`: de 1 a 64 hostnames. */
export const MAX_SOURCE_DOMAINS = 64

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/

/**
 * Deja un hostname como lo quiere la herramienta, o null si no sirve.
 *
 * Acepta que el usuario pegue una URL entera —es lo que hace cualquiera— y se
 * queda con el host. Rechaza exactamente lo que rechaza la API: IPs, TLD
 * desnudos y nombres de una sola etiqueta como `localhost`.
 */
export function normalizeDomain(raw: string): string | null {
  let v = raw.trim().toLowerCase()
  if (!v) return null

  // Si pegaron una URL, quedarse con el host.
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  v = v.split('/')[0]
  v = v.split('?')[0]
  v = v.split('#')[0]
  v = v.replace(/:\d+$/, '')   // puerto
  v = v.replace(/\.$/, '')     // punto final del FQDN

  if (!v) return null
  if (IPV4.test(v)) return null
  if (!v.includes('.')) return null          // una sola etiqueta
  if (!/^[a-z0-9.-]+$/.test(v)) return null
  if (v.startsWith('.') || v.includes('..')) return null

  // Cada etiqueta debe tener contenido y la última (el TLD) ser alfabética.
  const labels = v.split('.')
  if (labels.some(l => l.length === 0)) return null
  if (!/^[a-z]{2,}$/.test(labels[labels.length - 1])) return null

  return v
}

/** Normaliza una lista, deduplica conservando el orden, y trunca al tope. */
export function parseSourceDomains(raw: unknown): { domains: string[]; rejected: string[] } {
  if (!Array.isArray(raw)) return { domains: [], rejected: [] }

  const domains: string[] = []
  const rejected: string[] = []
  const vistos = new Set<string>()

  for (const item of raw) {
    if (typeof item !== 'string') continue
    const norm = normalizeDomain(item)
    if (!norm) {
      if (item.trim()) rejected.push(item.trim())
      continue
    }
    if (vistos.has(norm)) continue
    vistos.add(norm)
    domains.push(norm)
  }

  return { domains: domains.slice(0, MAX_SOURCE_DOMAINS), rejected }
}

/**
 * Sin fuentes declaradas NO se genera.
 *
 * Deliberado: generar sin allowlist significaría buscar en toda la web, que es
 * justo lo que este diseño existe para impedir. Es preferible un botón
 * deshabilitado con su motivo que una newsletter citando un blog cualquiera.
 */
export function canGenerateWithAi(domains: string[] | null): boolean {
  return Array.isArray(domains) && domains.length > 0
}
```

- [ ] **Step 4: Ejecutar el test para verificar que pasa**

Run: `npx vitest run tests/newsletters/source-domains.test.ts`
Esperado: PASS, 8 tests.

- [ ] **Step 5: Verificar tipos y lint**

Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**

```bash
git add src/lib/newsletters/source-domains.ts tests/newsletters/source-domains.test.ts
git commit -m "feat(newsletters): validacion de la allowlist de fuentes"
```

---

### Task 2: Contabilidad de la IA — features nuevas y coste de búsqueda

Antes de gastar hay que saber registrar el gasto. Si esto va después, las primeras generaciones no aparecen en el presupuesto.

**Files:**
- Modify: `src/lib/services/ai-usage.ts` (tipo `AiFeature` línea ~10, `AI_FEATURE_LABELS` línea ~14, constantes de coste ~línea 28)
- Test: `tests/newsletters/ai-cost.test.ts`

**Interfaces:**
- Consumes: `computeCostUsd`, `recordAiUsage` de `@/lib/services/ai-usage`.
- Produces: valores nuevos de `AiFeature`: `newsletter_research`, `newsletter_draft`, `newsletter_cover`. Constante `WEB_SEARCH_UNIT_COST_USD` (0.01). Función `webSearchCostUsd(searches: number): number`.

- [ ] **Step 1: Leer el archivo antes de tocarlo**

Run: `sed -n '1,60p' src/lib/services/ai-usage.ts`

Fíjate en cómo está declarado el tipo `AiFeature`, cómo `IMAGE_UNIT_COST_USD` documenta su porqué, y cómo `computeCostUsd` deriva el coste por tokens.

- [ ] **Step 2: Escribir el test que falla**

```ts
// tests/newsletters/ai-cost.test.ts
import { describe, it, expect } from 'vitest'
import { webSearchCostUsd, WEB_SEARCH_UNIT_COST_USD, AI_FEATURE_LABELS } from '@/lib/services/ai-usage'

describe('coste de la busqueda web', () => {
  it('cobra por busqueda, a 10 USD el millar', () => {
    expect(WEB_SEARCH_UNIT_COST_USD).toBe(0.01)
    expect(webSearchCostUsd(0)).toBe(0)
    expect(webSearchCostUsd(6)).toBeCloseTo(0.06, 10)
  })

  it('nunca devuelve negativo aunque le pasen basura', () => {
    expect(webSearchCostUsd(-3)).toBe(0)
  })
})

describe('etiquetas de las features nuevas', () => {
  it('las tres de newsletters tienen etiqueta en espanol', () => {
    expect(AI_FEATURE_LABELS.newsletter_research).toBe('Newsletters · Investigación')
    expect(AI_FEATURE_LABELS.newsletter_draft).toBe('Newsletters · Redacción')
    expect(AI_FEATURE_LABELS.newsletter_cover).toBe('Newsletters · Portada')
  })
})
```

- [ ] **Step 3: Ejecutar el test para verificar que falla**

Run: `npx vitest run tests/newsletters/ai-cost.test.ts`
Esperado: FAIL — `webSearchCostUsd` no existe.

- [ ] **Step 4: Añadir las tres features al tipo y a las etiquetas**

En el tipo `AiFeature` de `src/lib/services/ai-usage.ts`, añade los tres valores nuevos siguiendo la forma que ya tenga la unión. Y en `AI_FEATURE_LABELS`:

```ts
  newsletter_research: 'Newsletters · Investigación',
  newsletter_draft:    'Newsletters · Redacción',
  newsletter_cover:    'Newsletters · Portada',
```

- [ ] **Step 5: Añadir el coste de búsqueda**

Junto a `IMAGE_UNIT_COST_USD`, con el mismo estilo de comentario:

```ts
// Costo por búsqueda de la herramienta `web_search`: la API la factura aparte
// de los tokens, a 10 USD por cada 1.000 búsquedas. Igual que con las imágenes,
// el ledger guarda un costo por UNIDAD porque no se deriva del usage de tokens.
export const WEB_SEARCH_UNIT_COST_USD = 0.01

/** Lo que cuestan N búsquedas web. Nunca negativo. */
export function webSearchCostUsd(searches: number): number {
  if (!Number.isFinite(searches) || searches <= 0) return 0
  return searches * WEB_SEARCH_UNIT_COST_USD
}
```

- [ ] **Step 6: Ejecutar el test para verificar que pasa**

Run: `npx vitest run tests/newsletters/ai-cost.test.ts`
Esperado: PASS, 3 tests.

- [ ] **Step 7: Verificar que no rompiste el panel de uso**

Run: `npx tsc --noEmit && npm run lint && npm run test:unit`
Esperado: todo en verde. `AI_FEATURE_LABELS` lo consume `src/components/dashboard/ai-usage-panel.tsx`; si `tsc` se queja ahí, es que la unión y el mapa se separaron.

- [ ] **Step 8: Commit**

```bash
git add src/lib/services/ai-usage.ts tests/newsletters/ai-cost.test.ts
git commit -m "feat(newsletters): contabiliza la IA de newsletters y la busqueda web"
```

---

### Task 3: Paso 1 del pipeline — investigación con búsqueda restringida

**Files:**
- Create: `src/lib/newsletters/ai/research.ts`
- Test: `tests/newsletters/research-parse.test.ts`

**Interfaces:**
- Consumes: `MAX_SOURCE_DOMAINS` de Task 1; `webSearchCostUsd` de Task 2.
- Produces:
  - `interface ResearchFinding { claim: string; url: string; publisher: string; published_at?: string }`
  - `interface NewsletterDossier { topic: string; summary: string; findings: ResearchFinding[]; searches: number; rawText: string }`
  - `researchMarket(args: { topic: string | null; language: string; market: string; areas: string[]; domains: string[]; brandName: string }): Promise<NewsletterDossier>`
  - `extractSearchCount(content: unknown[]): number`
  - `collectSearchErrors(content: unknown[]): string[]`

- [ ] **Step 1: Escribir el test de los parsers, que es lo probable que se rompa**

El test cubre las funciones puras que leen la respuesta de la API. La llamada en sí no se prueba con mocks: probaría el mock, no el código.

```ts
// tests/newsletters/research-parse.test.ts
import { describe, it, expect } from 'vitest'
import { extractSearchCount, collectSearchErrors } from '@/lib/newsletters/ai/research'

// Forma real de un bloque de resultado con ÉXITO: `content` es una LISTA.
const bloqueOk = {
  type: 'web_search_tool_result',
  tool_use_id: 'srvtoolu_1',
  content: [
    { type: 'web_search_result', title: 'Informe', url: 'https://nar.realtor/a' },
    { type: 'web_search_result', title: 'Otro',    url: 'https://nar.realtor/b' },
  ],
}

// Forma real de un bloque con ERROR: `content` es un OBJETO. Llega con HTTP 200,
// no como excepcion.
const bloqueError = {
  type: 'web_search_tool_result',
  tool_use_id: 'srvtoolu_2',
  content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' },
}

describe('extractSearchCount', () => {
  it('cuenta un bloque de exito por busqueda realizada', () => {
    expect(extractSearchCount([bloqueOk])).toBe(1)
    expect(extractSearchCount([bloqueOk, bloqueOk, bloqueOk])).toBe(3)
  })

  it('no cuenta los bloques de error: una busqueda fallida no se factura', () => {
    expect(extractSearchCount([bloqueOk, bloqueError])).toBe(1)
  })

  it('ignora los bloques que no son de busqueda', () => {
    expect(extractSearchCount([{ type: 'text', text: 'hola' }, bloqueOk])).toBe(1)
  })

  it('devuelve 0 ante basura, sin lanzar', () => {
    expect(extractSearchCount([])).toBe(0)
    expect(extractSearchCount([null, undefined, 'x', 42])).toBe(0)
  })
})

describe('collectSearchErrors', () => {
  it('saca los codigos de error de los bloques fallidos', () => {
    expect(collectSearchErrors([bloqueOk, bloqueError])).toEqual(['max_uses_exceeded'])
  })

  it('no confunde una lista de resultados con un error', () => {
    expect(collectSearchErrors([bloqueOk])).toEqual([])
  })

  it('devuelve vacio ante basura', () => {
    expect(collectSearchErrors([null, 'x', {}])).toEqual([])
  })
})
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run tests/newsletters/research-parse.test.ts`
Esperado: FAIL — el módulo no existe.

- [ ] **Step 3: Leer cómo el repo llama a Claude hoy**

Run: `sed -n '1,20p' src/lib/carousels/copy.ts && sed -n '140,175p' src/lib/carousels/copy.ts`

Fíjate en la construcción del cliente, el `MODEL`, y cómo lee `response.content`. Copia ese estilo.

- [ ] **Step 4: Escribir la implementación**

```ts
// src/lib/newsletters/ai/research.ts
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
  summary:  string
  findings: ResearchFinding[]
  /** Búsquedas realizadas CON ÉXITO. Alimenta el ledger de costos. */
  searches: number
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
    `\n{"topic":"el tema en una frase","summary":"por qué le importa a los clientes de esta agencia, 2-3 frases",`,
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
    rawText:  text.slice(0, 4000),
  }
}
```

- [ ] **Step 5: Ejecutar el test para verificar que pasa**

Run: `npx vitest run tests/newsletters/research-parse.test.ts`
Esperado: PASS, 7 tests.

- [ ] **Step 6: Verificar tipos y lint**

Run: `npx tsc --noEmit && npm run lint`
Esperado: sin errores. Si `tsc` se queja del tipo de `tools`, comprueba la versión del SDK: `web_search_20260209` necesita `@anthropic-ai/sdk` reciente. Si el tipo no existe en la versión instalada, **párate y dímelo** en vez de castear a `any`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/newsletters/ai/research.ts tests/newsletters/research-parse.test.ts
git commit -m "feat(newsletters): investigacion con busqueda restringida por mercado"
```

---

### Task 4: Paso 2 del pipeline — redacción estructurada

**Files:**
- Create: `src/lib/newsletters/ai/draft.ts`
- Test: `tests/newsletters/draft-shape.test.ts`

**Interfaces:**
- Consumes: `NewsletterDossier`, `ResearchFinding` de Task 3; `NewsletterContentSchema`, `NewsletterSourceSchema`, `NEWSLETTER_CONTENT_VERSION` de `@/lib/newsletters/content`.
- Produces:
  - `interface DraftResult { title: string; dek: string; content: NewsletterContent; sources: NewsletterSource[]; dataAsOf: string | null; usage: { input: number; output: number } }`
  - `sourcesFromFindings(findings: ResearchFinding[]): NewsletterSource[]`
  - `draftEdition(args: { dossier: NewsletterDossier; language: string; brandName: string; voice: string | null }): Promise<DraftResult>`

- [ ] **Step 1: Escribir el test**

```ts
// tests/newsletters/draft-shape.test.ts
import { describe, it, expect } from 'vitest'
import { sourcesFromFindings } from '@/lib/newsletters/ai/draft'
import { NewsletterSourceSchema } from '@/lib/newsletters/content'

describe('sourcesFromFindings', () => {
  it('convierte hallazgos en fuentes validas para el esquema', () => {
    const fuentes = sourcesFromFindings([
      { claim: 'El precio medio subio 4%', url: 'https://nar.realtor/a', publisher: 'NAR', published_at: '2026-08-01' },
      { claim: 'El inventario cayo 9%',    url: 'https://redfin.com/b',  publisher: 'Redfin' },
    ])
    expect(fuentes).toHaveLength(2)
    for (const f of fuentes) {
      expect(NewsletterSourceSchema.safeParse(f).success).toBe(true)
    }
  })

  it('da ids estables y distintos, que es lo que los bloques citan', () => {
    const fuentes = sourcesFromFindings([
      { claim: 'a', url: 'https://nar.realtor/a', publisher: 'NAR' },
      { claim: 'b', url: 'https://nar.realtor/b', publisher: 'NAR' },
    ])
    expect(fuentes[0].id).not.toBe(fuentes[1].id)
    expect(new Set(fuentes.map(f => f.id)).size).toBe(2)
  })

  it('descarta el hallazgo sin url en vez de fabricar una', () => {
    const fuentes = sourcesFromFindings([
      { claim: 'sin respaldo', url: '', publisher: 'X' },
      { claim: 'con respaldo', url: 'https://ine.es/x', publisher: 'INE' },
    ])
    expect(fuentes).toHaveLength(1)
    expect(fuentes[0].url).toBe('https://ine.es/x')
  })

  it('rellena accessed_at con la fecha de hoy', () => {
    const hoy = new Date().toISOString().slice(0, 10)
    const [f] = sourcesFromFindings([{ claim: 'a', url: 'https://ine.es/x', publisher: 'INE' }])
    expect(f.accessed_at).toBe(hoy)
  })

  it('devuelve vacio ante una lista vacia', () => {
    expect(sourcesFromFindings([])).toEqual([])
  })
})
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run tests/newsletters/draft-shape.test.ts`
Esperado: FAIL — el módulo no existe.

- [ ] **Step 3: Escribir la implementación**

```ts
// src/lib/newsletters/ai/draft.ts
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
```

- [ ] **Step 4: Ejecutar el test para verificar que pasa**

Run: `npx vitest run tests/newsletters/draft-shape.test.ts`
Esperado: PASS, 5 tests.

- [ ] **Step 5: Verificar tipos y lint**

Run: `npx tsc --noEmit && npm run lint`
Esperado: sin errores. Si `output_config` no existe en el tipo de `messages.stream`, comprueba la versión del SDK y **párate a decírmelo**: no lo castees a `any` ni uses el `output_format` antiguo, que está obsoleto.

- [ ] **Step 6: Commit**

```bash
git add src/lib/newsletters/ai/draft.ts tests/newsletters/draft-shape.test.ts
git commit -m "feat(newsletters): redaccion estructurada sobre el dossier"
```

---

### Task 5: Orquestador y server action

**Files:**
- Create: `src/lib/newsletters/ai/generate.ts`
- Modify: `src/app/(dashboard)/newsletters/actions.ts`
- Test: `tests/newsletters/generate-guard.test.ts`

**Interfaces:**
- Consumes: `researchMarket` (Task 3), `draftEdition` (Task 4), `canGenerateWithAi` + `parseSourceDomains` (Task 1), `webSearchCostUsd` + `recordAiUsage` (Task 2), `assertAiWithinLimit` de `@/lib/services/ai-limit`.
- Produces: `generateNewsletterDraft(args): Promise<GeneratedDraft>` en `ai/generate.ts`, y la server action `generateEditionWithAi(input: unknown)` en `actions.ts`, que devuelve `{ ok: true, data: { id } } | { ok: false, error: string }`.

- [ ] **Step 1: Escribir el test del orden de los gates**

Lo que importa aquí es que no se gaste nada antes de comprobar el presupuesto y la allowlist.

```ts
// tests/newsletters/generate-guard.test.ts
import { describe, it, expect } from 'vitest'
import { canGenerateWithAi } from '@/lib/newsletters/source-domains'

describe('puertas antes de gastar', () => {
  it('sin allowlist no se genera', () => {
    expect(canGenerateWithAi(null)).toBe(false)
    expect(canGenerateWithAi([])).toBe(false)
  })

  it('con allowlist se puede intentar', () => {
    expect(canGenerateWithAi(['nar.realtor', 'redfin.com'])).toBe(true)
  })
})
```

- [ ] **Step 2: Ejecutar el test**

Run: `npx vitest run tests/newsletters/generate-guard.test.ts`
Esperado: PASS (usa código de Task 1, ya existente). Sirve de red para el orquestador.

- [ ] **Step 3: Escribir el orquestador**

```ts
// src/lib/newsletters/ai/generate.ts
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { assertAiWithinLimit } from '@/lib/services/ai-limit'
import { recordAiUsage, webSearchCostUsd } from '@/lib/services/ai-usage'
import { parseSourceDomains, canGenerateWithAi } from '../source-domains'
import { researchMarket } from './research'
import { draftEdition } from './draft'
import type { NewsletterContent, NewsletterSource } from '../content'
import type { TenantContext } from '@/lib/auth/tenant-context'

// Orquesta los dos pasos y deja el rastro en el ledger de IA.
//
// Orden deliberado, el mismo de studio/generate.ts: validar → gate de IA →
// investigar → redactar. El gate va ANTES de gastar un solo token.

const MODEL = 'claude-sonnet-5'

// Columnas verificadas contra el esquema real: `tenants` NO tiene `market` ni
// `brand_voice`. El mercado se deriva de las zonas declaradas (migración 087) y
// la voz sale de `description`, que es la descripción libre de la agencia que
// se edita en Ajustes → Tu negocio.
const TENANT_COLUMNS = columns('tenants', [
  'name', 'description', 'newsletter_source_domains',
  'primary_areas', 'secondary_areas', 'currency',
])

export interface GeneratedDraft {
  title:    string
  dek:      string
  content:  NewsletterContent
  sources:  NewsletterSource[]
  dataAsOf: string | null
  /** Trazabilidad: qué se pidió, con qué fuentes y cuánto costó. */
  aiRun: {
    model:    string
    topic:    string | null
    domains:  string[]
    searches: number
    at:       string
  }
}

export async function generateNewsletterDraft(args: {
  ctx:      TenantContext
  topic:    string | null
  language: string
}): Promise<{ ok: true; data: GeneratedDraft } | { ok: false; error: string }> {
  const { ctx } = args
  if (!ctx.tenant_id) return { ok: false, error: 'Selecciona un tenant primero.' }

  const db = createAdminClient()
  const { data: tenantRow } = await db
    .from('tenants').select(TENANT_COLUMNS).eq('id', ctx.tenant_id).maybeSingle()

  // reason: el cliente de Supabase no está tipado en este repo; columns() ya
  // validó la lista contra el esquema, que es lo que el cast podría esconder.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = tenantRow as any
  if (!tenant) return { ok: false, error: 'No se pudo leer la configuración de la agencia.' }

  const { domains } = parseSourceDomains(tenant.newsletter_source_domains)
  if (!canGenerateWithAi(domains)) {
    return {
      ok: false,
      error: 'Todavía no hay fuentes declaradas para tu mercado. Configúralas en Ajustes → Tu negocio antes de generar.',
    }
  }

  // El gate de presupuesto, ANTES de gastar nada.
  const blocked = await assertAiWithinLimit(ctx)
  if (blocked) return blocked

  const brandName = String(tenant.name ?? 'la agencia')
  const areas     = Array.isArray(tenant.primary_areas) ? (tenant.primary_areas as string[]) : []
  const secundarias = Array.isArray(tenant.secondary_areas) ? (tenant.secondary_areas as string[]) : []
  // El "mercado" de la agencia son sus zonas declaradas: es el dato que ya
  // existe y el que de verdad acota la búsqueda.
  const market = [...areas, ...secundarias].join(', ')
  // La descripción libre de la agencia hace de guía de voz: es lo que el propio
  // tenant escribió sobre sí mismo.
  const voice = typeof tenant.description === 'string' && tenant.description.trim()
    ? tenant.description.trim()
    : null

  // ── Paso 1: investigar ────────────────────────────────────────────────────
  let dossier
  try {
    dossier = await researchMarket({
      topic: args.topic, language: args.language, market, areas, domains, brandName,
    })
  } catch (e) {
    const detalle = e instanceof Error ? e.message : 'error desconocido'
    return { ok: false, error: `No se pudo investigar el mercado: ${detalle}` }
  }

  // Se registra el costo de la búsqueda AUNQUE la redacción falle después: esas
  // búsquedas ya se facturaron.
  await recordAiUsage({
    tenantId: ctx.tenant_id,
    userId:   ctx.user_id,
    feature:  'newsletter_research',
    model:    MODEL,
    usage:    { input_tokens: 0, output_tokens: 0 },
    costUsdOverride: webSearchCostUsd(dossier.searches),
    metadata: { searches: dossier.searches, domains: domains.length, topic: dossier.topic },
  })

  if (dossier.findings.length === 0) {
    return {
      ok: false,
      error: 'La búsqueda no encontró datos respaldables en tus fuentes. Prueba con otro tema o añade más fuentes.',
    }
  }

  // ── Paso 2: redactar ──────────────────────────────────────────────────────
  let draft
  try {
    draft = await draftEdition({ dossier, language: args.language, brandName, voice })
  } catch (e) {
    const detalle = e instanceof Error ? e.message : 'error desconocido'
    return { ok: false, error: `No se pudo redactar la edición: ${detalle}` }
  }

  await recordAiUsage({
    tenantId: ctx.tenant_id,
    userId:   ctx.user_id,
    feature:  'newsletter_draft',
    model:    MODEL,
    usage:    { input_tokens: draft.usage.input, output_tokens: draft.usage.output },
    metadata: { topic: dossier.topic, sources: draft.sources.length },
  })

  return {
    ok: true,
    data: {
      title:    draft.title,
      dek:      draft.dek,
      content:  draft.content,
      sources:  draft.sources,
      dataAsOf: draft.dataAsOf,
      aiRun: {
        model:    MODEL,
        topic:    args.topic,
        domains,
        searches: dossier.searches,
        at:       new Date().toISOString(),
      },
    },
  }
}
```

- [ ] **Step 4: Verificar los nombres reales de las columnas del tenant**

Run: `grep -n "market\|primary_areas\|brand_voice" src/lib/supabase/database.types.ts | head -6`

`columns('tenants', [...])` fallará en `tsc` si alguno no existe con ese nombre. Si el perfil de negocio usa otros nombres (mira `src/lib/data/business-profile.ts`), usa los reales y dilo en el informe. **No inventes columnas.**

- [ ] **Step 5: Añadir la server action**

En `src/app/(dashboard)/newsletters/actions.ts`, siguiendo el patrón de las que ya hay (con su `guard()` de plan y su forma de retorno):

```ts
const GenerateInput = z.object({
  channelId: z.string().uuid(),
  topic:     z.string().trim().max(200).nullable(),
  language:  z.enum(SUPPORTED_LANGUAGE_CODES as [string, ...string[]]),
})

/**
 * Genera una edición con IA y la guarda como BORRADOR.
 *
 * La IA nunca publica: devuelve el id para que el editor lo abra y una persona
 * decida. La portada se elige después — por eso entra con la de la serie o con
 * el marcador que el CoverPicker sustituye.
 */
export async function generateEditionWithAi(input: unknown): Promise<Result<{ id: string }>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }

  const parsed = GenerateInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  // Mismo control de propiedad que crear una edición a mano.
  const canal = await requireChannelWriteAccess(g, parsed.data.channelId)
  if (!canal.ok) return canal

  const generado = await generateNewsletterDraft({
    ctx:      g.ctx,
    topic:    parsed.data.topic,
    language: parsed.data.language,
  })
  if (!generado.ok) return generado

  // ... inserta la fila con status 'draft', ai_generated: true, ai_run:
  // generado.data.aiRun, y los campos del borrador. Reutiliza el mismo camino
  // de inserción que createEdition (slug uniquificado incluido) en vez de
  // duplicarlo: si createEdition no está factorizada, extrae la parte de
  // inserción a una función privada y llámala desde las dos.
}
```

**Sobre la portada:** `cover_image_url` es `NOT NULL`. Esta acción no genera imagen todavía (eso es la Task 7). Usa la portada de la serie si `hosted_page` la tiene, y si no, deja la edición apuntando a un marcador que el `CoverPicker` sustituya — y marca `cover_source: 'ai'` sólo cuando la imagen la haya generado la IA de verdad. Elige la variante que menos mienta sobre el origen y explícala en el informe.

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit && npm run lint && npm run test:unit`

- [ ] **Step 7: Commit**

```bash
git add src/lib/newsletters/ai/generate.ts "src/app/(dashboard)/newsletters/actions.ts" tests/newsletters/generate-guard.test.ts
git commit -m "feat(newsletters): orquestador de generacion con IA"
```

---

### Task 6: Allowlist en Ajustes → Tu negocio

**Files:**
- Modify: la pestaña "Tu negocio" de `src/app/(dashboard)/settings/` (localízala con `grep -rln "Tu negocio" "src/app/(dashboard)/settings/"`)
- Modify: `src/app/(dashboard)/settings/actions.ts`
- Test: `tests/newsletters/source-domains.test.ts` (extender)

**Interfaces:**
- Consumes: `parseSourceDomains`, `MAX_SOURCE_DOMAINS` de Task 1.
- Produces: server action `updateNewsletterSourceDomains(input: unknown)` con la forma `{ ok }` habitual.

- [ ] **Step 1: Leer cómo se edita hoy el perfil de negocio**

Run: `grep -n "export async function" "src/app/(dashboard)/settings/actions.ts" | head -12`

Y mira una acción del perfil de negocio entera, para copiar su validación y su `revalidatePath`.

- [ ] **Step 2: Escribir la server action**

Valida con `parseSourceDomains`, escribe `tenants.newsletter_source_domains`, y **sólo permite editar a `super_admin`** — el resto la ve pero no la cambia, mismo criterio que la pantalla de Scoring. Devuelve en `data` la lista aceptada y las entradas rechazadas, para que la UI pueda decir cuáles no valían y por qué.

- [ ] **Step 3: Añadir el campo a la pestaña**

Un textarea (una fuente por línea) o un editor de chips, lo que encaje con el resto de esa pestaña. Debe mostrar:
- El contador `n / 64`.
- Las entradas rechazadas, con el motivo ("no puede ser una IP", "falta el dominio").
- Para roles que no son `super_admin`: la lista en solo lectura, con una línea que explique que las fuentes las fija ITMANO.

Copy en español neutro, sin emojis. Explica para qué sirve: *"La IA solo podrá consultar estas fuentes al escribir tus newsletters."*

- [ ] **Step 4: Extender el test con el caso de la UI**

Añade a `tests/newsletters/source-domains.test.ts` un test de que `parseSourceDomains` acepta el formato que produce el textarea (una por línea, con espacios y líneas vacías):

```ts
it('acepta lo que produce un textarea de una fuente por linea', () => {
  const pegado = ['  nar.realtor  ', '', 'https://redfin.com/noticias', '   ', 'no-valido']
  const r = parseSourceDomains(pegado)
  expect(r.domains).toEqual(['nar.realtor', 'redfin.com'])
  expect(r.rejected).toEqual(['no-valido'])
})
```

- [ ] **Step 5: Verificar**

Run: `npx vitest run tests/newsletters/source-domains.test.ts && npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/settings/" tests/newsletters/source-domains.test.ts
git commit -m "feat(newsletters): allowlist de fuentes en ajustes"
```

---

### Task 7: Formato apaisado en el Estudio

El Estudio hoy sólo hace formatos de redes (`1:1`, `4:5`, `9:16`). Una portada de newsletter necesita apaisado. Al añadirlo, el Estudio gana ese formato para todo, no sólo para newsletters.

**Files:**
- Modify: `src/lib/studio/types.ts` (tipo `Aspect`, línea 8)
- Modify: `src/lib/studio/canvas.ts` (`CANVAS`, `allowedZones`, `textBand`)
- Test: `tests/studio/canvas.test.ts` (extender; si no existe, créalo)

**Interfaces:**
- Consumes: nada.
- Produces: `'16:9'` como valor válido de `Aspect`; `CANVAS['16:9'] = { width: 1920, height: 1080 }`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// añadir a tests/studio/canvas.test.ts
import { CANVAS, allowedZones, textBand, resolveZone } from '@/lib/studio/canvas'

describe('formato apaisado 16:9', () => {
  it('tiene lienzo de 1920x1080', () => {
    expect(CANVAS['16:9']).toEqual({ width: 1920, height: 1080 })
  })

  it('admite las mismas zonas que los formatos anchos', () => {
    expect(allowedZones('16:9')).toEqual(['top', 'bottom', 'left'])
  })

  it('la banda de texto cabe dentro del lienzo', () => {
    for (const zona of allowedZones('16:9')) {
      const b = textBand('16:9', zona)
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.y).toBeGreaterThanOrEqual(0)
      expect(b.x + b.width).toBeLessThanOrEqual(CANVAS['16:9'].width)
      expect(b.y + b.height).toBeLessThanOrEqual(CANVAS['16:9'].height)
    }
  })

  it('resolveZone respeta una zona admitida', () => {
    expect(resolveZone('16:9', 'bottom')).toBe('bottom')
  })

  it('no altera la geometria de los formatos existentes', () => {
    expect(CANVAS['1:1']).toEqual({ width: 1080, height: 1080 })
    expect(CANVAS['4:5']).toEqual({ width: 1080, height: 1350 })
    expect(CANVAS['9:16']).toEqual({ width: 1080, height: 1920 })
    expect(allowedZones('9:16')).toEqual(['top', 'bottom'])
  })
})
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run tests/studio/canvas.test.ts`
Esperado: FAIL — `CANVAS['16:9']` es undefined.

- [ ] **Step 3: Añadir el formato**

En `src/lib/studio/types.ts`:

```ts
export type Aspect = '1:1' | '4:5' | '9:16' | '16:9'
```

En `src/lib/studio/canvas.ts`, dentro de `CANVAS`:

```ts
  // Apaisado editorial: portadas de newsletter y previsualización al compartir.
  // 1920x1080 en vez de 1200x630 porque el compositor trabaja a resolución alta
  // y el recorte a la proporción de Open Graph lo hace el navegador.
  '16:9': { width: 1920, height: 1080 },
```

`allowedZones` y `textBand` ya tratan cualquier aspecto que no sea `9:16` como ancho, así que **comprueba si necesitan cambios**: lee las dos funciones y, si el comportamiento por defecto ya da el resultado que el test espera, no toques nada. Si `tsc` señala un `Record<Aspect, …>` incompleto en otro archivo, complétalo ahí — es la red de seguridad haciendo su trabajo.

- [ ] **Step 4: Ejecutar el test**

Run: `npx vitest run tests/studio/canvas.test.ts`
Esperado: PASS.

- [ ] **Step 5: Verificar que el Estudio entero sigue compilando**

Run: `npx tsc --noEmit && npm run lint && npm run test:unit`
Esperado: en verde. Presta atención a cualquier `Record<Aspect, ...>` que ahora esté incompleto.

- [ ] **Step 6: Commit**

```bash
git add src/lib/studio/types.ts src/lib/studio/canvas.ts tests/studio/canvas.test.ts
git commit -m "feat(studio): formato apaisado 16:9"
```

---

### Task 8: Portada generada

**Files:**
- Create: `src/lib/newsletters/ai/cover.ts`
- Modify: `src/app/(dashboard)/newsletters/actions.ts`

**Interfaces:**
- Consumes: el pipeline del Estudio (`src/lib/studio/generate.ts`), `assertAiWithinLimit`, `recordAiUsage` con feature `newsletter_cover`.
- Produces: `generateCover(args: { ctx: TenantContext; title: string; topic: string }): Promise<{ ok: true; url: string } | { ok: false; error: string }>`, y la server action `generateCoverForEdition(editionId: string)`.

- [ ] **Step 1: Leer el pipeline del Estudio**

Run: `sed -n '1,60p' src/lib/studio/generate.ts && grep -n "export async function" src/lib/studio/generate.ts`

Necesitas saber qué función compone una pieza, qué recibe y qué devuelve. **Reutilízala**: no escribas un segundo pipeline de imagen.

- [ ] **Step 2: Averiguar cómo se registra una plantilla**

Run: `grep -n "export async function" src/lib/data/studio-templates.ts && ls src/lib/studio/templates/seed`

Las plantillas viven en la tabla `studio_templates` y se leen con `listTemplates()`/`getTemplate(key)`. Decide —y dilo en el informe— si la plantilla editorial apaisada se siembra con una migración o se crea desde el editor de plantillas del Estudio. Si es migración, es la `108`, se aplica **sólo al sandbox** y se pregunta antes de producción.

- [ ] **Step 3: Escribir `cover.ts`**

Genera la portada **después** del texto, para que la imagen refleje el titular real. Obligaciones:
- `assertAiWithinLimit` antes de gastar.
- `recordAiUsage` con `feature: 'newsletter_cover'` y `costUsdOverride: IMAGE_UNIT_COST_USD`.
- Sube al bucket `newsletter-media` con ruta `${tenant_id}/${uuid}.png`.
- Devuelve `{ ok }`, nunca lanza.

- [ ] **Step 4: Añadir la server action y quitar el "Disponible próximamente"**

En `actions.ts`, `generateCoverForEdition(editionId)` con el mismo `guard()` y `requireChannelWriteAccess`. Al terminar, actualiza la edición con la URL y `cover_source: 'ai'`.

En el `CoverPicker` del editor, el botón de generar deja de estar deshabilitado. Cuando falle, pinta el `error` — no lo tragues, que es el defecto que ya se corrigió una vez en `block-list.tsx`.

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npm run lint && npm run build`

- [ ] **Step 6: Commit**

```bash
git add src/lib/newsletters/ai/cover.ts "src/app/(dashboard)/newsletters/"
git commit -m "feat(newsletters): portada generada con IA"
```

---

### Task 9: El modal de generación

**Files:**
- Create: `src/app/(dashboard)/newsletters/generate-modal.tsx`
- Modify: `src/app/(dashboard)/newsletters/series-list.tsx`
- Modify: `src/app/(dashboard)/newsletters/nueva/page.tsx`

**Interfaces:**
- Consumes: `generateEditionWithAi` (Task 5), `canGenerateWithAi` (Task 1).
- Produces: la ruta de UI; ningún módulo nuevo que otros consuman.

- [ ] **Step 1: Escribir el modal**

`'use client'`. Campos: serie, tema (opcional, con el texto de ayuda *"Déjalo vacío y la IA propone un tema sobre tu mercado"*), e idioma.

**La allowlist va a la vista**, que es el punto entero: una lista de las fuentes que se van a consultar, con un texto como *"La IA solo podrá citar estas fuentes."* El cliente tiene que ver de dónde va a salir su contenido antes de pedirlo.

Si el tenant no tiene fuentes, el botón de generar sale deshabilitado con el motivo y un enlace a Ajustes → Tu negocio. Nada de dejar que lo pulse para fallar después.

- [ ] **Step 2: Avisar de que tarda**

La generación son dos llamadas al modelo con búsqueda web por medio: decenas de segundos. Deja el botón en estado de carga con un texto que diga qué está pasando ("Investigando en tus fuentes…" → "Redactando…"), imitando cómo el Estudio muestra el progreso de una generación. Sin eso, el usuario pulsa dos veces.

- [ ] **Step 3: Enganchar el botón**

En `series-list.tsx`, junto a "Nueva edición", un botón "Generar con IA". Al terminar con éxito, redirige a `/newsletters/<id>` — el borrador abierto en el editor, con sus fuentes ya cargadas en el panel.

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npm run lint && npm run build`

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/newsletters/"
git commit -m "feat(newsletters): modal de generacion con IA"
```

---

### Task 10: Prueba de extremo a extremo y cierre

**Files:**
- Modify: `docs/superpowers/specs/2026-08-24-newsletters-design.md` (§5, marcar lo implementado y corregir lo que la implementación desmienta)

- [ ] **Step 1: Correr todas las suites, una por vez**

Run, en este orden y nunca en paralelo:
```
npm run test:unit
npm run test:billing
npm run test:rls
npm run test:schema
```

- [ ] **Step 2: Verificar tipos, lint y build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Confirma que las rutas `/nl` siguen saliendo `●` (ISR) y no `ƒ`.

- [ ] **Step 3: Prueba real contra el sandbox**

**Esta es la única prueba que demuestra que el sistema funciona**, porque toca la API de verdad. Cuesta unos 30 céntimos.

1. Declara una allowlist para el tenant del sandbox en Ajustes → Tu negocio.
2. Genera una edición sin dar tema.
3. Comprueba en el borrador que: hay al menos un bloque `stat`, **cada `stat` cita una fuente que existe en el panel**, y las URLs son de dominios de la allowlist. Ábrelas: deben cargar y decir lo que la edición afirma.
4. Genera la portada.
5. Publica y ábrela en `/nl/...`.
6. Comprueba el gasto:

```sql
select feature, model, cost_usd, metadata, created_at
from ai_usage_events
where feature like 'newsletter%'
order by created_at desc limit 5;
```

Esperado: tres filas (`newsletter_research`, `newsletter_draft`, `newsletter_cover`) con costes coherentes.

**Si alguna URL citada no respalda lo que la edición afirma, PÁRATE y dilo.** Es el fallo que todo este diseño existe para impedir, y significaría que el prompt del paso 2 necesita más presión.

- [ ] **Step 4: Corregir el spec con lo aprendido**

El spec §5 se escribió antes de implementar. Si algo resultó distinto —el tipo de la herramienta, la forma de los errores de servidor, cómo se pide la salida estructurada— corrígelo ahí, marcando la corrección como se hizo en el Plan 1. Un spec que miente es peor que no tenerlo.

- [ ] **Step 5: Commit y push**

```bash
git add docs/superpowers/specs/2026-08-24-newsletters-design.md
git commit -m "docs: corrige el spec de IA con lo aprendido al implementarlo"
git push -u origin feat/newsletters-ia
```

- [ ] **Step 6: Avisar a Dylan**

El PR lo abre él, siempre. Si la Task 8 creó la migración `108`, recuérdale que está **sólo en el sandbox** y que hay que declararla en `POR_RAMA_EN_CURSO` de `tests/schema/parity.test.ts` hasta aplicarla a producción.

---

## Lo que este plan NO hace

- **Broadcast**: enviar la edición por email a la lista de suscriptores sigue fuera de alcance, y el copy del formulario sigue sin prometerlo.
- **Traducción automática** de una edición a otros idiomas. `translation_group_id` existe en el esquema desde la 105, sin UI.
- **Propuesta mensual automática por cron**: gastaría IA sin que nadie la pida.
- **Cachear el dossier entre ediciones del mismo mes.** El spec lo menciona como posible; no se hace hasta que haya volumen que lo justifique.
