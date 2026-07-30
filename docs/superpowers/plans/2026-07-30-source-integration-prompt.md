# Prompt de integración copiable para fuentes de adquisición — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar las pantallas de resultado sueltas de los 3 modales de creación de fuentes (Lead Magnet, Evento, Formulario) por un único prompt generado y copiable, y hacerlo siempre accesible desde el perfil de la fuente vía un botón "Ver Opciones de integración".

**Architecture:** Un módulo único (`integration-prompt.ts`) construye el texto del prompt desde datos resueltos en el momento (canal, tenant, catálogo de fit leído en vivo de `lead_score_rules`). Una única función interna en `sources/actions.ts` arma ese prompt y la usan 5 acciones: las 3 de creación y las 2 nuevas (`getIntegrationInfo`, `regenerateContactSecret`). El contrato nunca se escribe dos veces.

**Tech Stack:** Next.js 16 App Router, TypeScript estricto, Supabase (admin client, `lead_score_rules`), Vitest (solo para el módulo puro nuevo + su consulta a `lead_score_rules`), Web Crypto API (`crypto.getRandomValues`) para el secret por canal.

## Global Constraints

- Español neutro latino en todo texto orientado al usuario (labels, botones, el prompt generado en sí). Sin "vosotros". Palabras de dinero: "inversión", nunca "costo"/"precio"/"pago".
- Nunca hardcodear datos de un tenant específico (A&J) en código compartido.
- Toda mutación pasa por `requireWriteAccess(ctx)` salvo lecturas simples ya scoped por tenant.
- `npx tsc --noEmit` y `npm run lint` deben quedar limpios al final de cada task que toque `.ts`/`.tsx`.
- No se crean ni modifican migraciones SQL — todo el estado nuevo vive en la columna `metadata` (jsonb) ya existente de `acquisition_channels`.
- Spec de referencia: `docs/superpowers/specs/2026-07-30-source-integration-prompt-design.md`.

---

### Task 1: Módulo `integration-prompt.ts` — el generador único del contrato

**Files:**
- Modify: `src/lib/services/intake-fit.ts:33` (exportar `FIT_DIMENSIONS`)
- Create: `src/lib/services/integration-prompt.ts`
- Test: `tests/sources/integration-prompt.test.ts`
- Modify: `package.json` (nuevo script `test:sources`)

**Interfaces:**
- Consumes: `FIT_DIMENSIONS: Record<'buy'|'invest'|'sell', readonly string[]>` (exportado de `intake-fit.ts`, ya existente sin `export`).
- Produces: `FitCatalogEntry { dimension: string; matchValue: string; label: string }`, `IntegrationPromptInput { channelType: 'lead_magnet'|'event'|'contact_form'; channelName: string; publicId: string; tenantName: string; baseUrl: string; contactSecret?: string; fitCatalog: FitCatalogEntry[] }`, `buildIntegrationPrompt(input: IntegrationPromptInput): string`, `getFitCatalog(db: ReturnType<typeof createAdminClient>, tenantId: string): Promise<FitCatalogEntry[]>` — usados por Task 2 y Task 5.

- [ ] **Step 1: Exportar `FIT_DIMENSIONS` en `intake-fit.ts`**

En `src/lib/services/intake-fit.ts:33`, cambiar:

```ts
const FIT_DIMENSIONS: Record<FitIntent, readonly string[]> = {
```

por:

```ts
export const FIT_DIMENSIONS: Record<FitIntent, readonly string[]> = {
```

No cambia nada más en el archivo — sigue siendo la única lista de nombres de dimensión reconocidos, ahora también consumida desde fuera.

- [ ] **Step 2: Escribir el test que falla — `buildIntegrationPrompt` (casos puros, sin red)**

Crear `tests/sources/integration-prompt.test.ts`:

````ts
import { describe, it, expect } from 'vitest'
import { buildIntegrationPrompt, type FitCatalogEntry } from '../../src/lib/services/integration-prompt'

const FIT_CATALOG: FitCatalogEntry[] = [
  { dimension: 'timeline',        matchValue: 'under_3_months',          label: 'Compra en <3 meses' },
  { dimension: 'timeline',        matchValue: '3_6_months',              label: 'Compra en 3–6 meses' },
  { dimension: 'financing',       matchValue: 'cash',                    label: 'Pago en efectivo' },
  { dimension: 'budget_tier',     matchValue: 'premium',                 label: 'Presupuesto premium' },
  { dimension: 'agent_status',    matchValue: 'sin_agente',              label: 'Sin agente' },
  { dimension: 'sell_motivation', matchValue: 'alta',                    label: 'Motivación de venta alta' },
  { dimension: 'listing_status',  matchValue: 'no_listado_sin_agente',   label: 'No listado, sin agente' },
]

describe('buildIntegrationPrompt', () => {
  it('contact_form incluye ambos endpoints, el secret y advertencia de CORS', () => {
    const prompt = buildIntegrationPrompt({
      channelType: 'contact_form',
      channelName: 'Contáctanos — Home',
      publicId:    'chn_test123456',
      tenantName:  'A&J Real Estate Group',
      baseUrl:     'https://app.itmano.com',
      contactSecret: 'abc123secret',
      fitCatalog:  FIT_CATALOG,
    })
    expect(prompt).toContain('POST https://app.itmano.com/api/intake/chn_test123456/submit')
    expect(prompt).toContain('POST https://app.itmano.com/api/contact/chn_test123456/submit')
    expect(prompt).toContain('x-contact-secret: abc123secret')
    expect(prompt).toContain('Sin CORS')
    expect(prompt).toContain('A&J Real Estate Group')
    expect(prompt).toContain('¿Usas Webflow?')
    expect(prompt).toContain('POST https://app.itmano.com/api/webhooks/webflow/chn_test123456')
  })

  it('lead_magnet y event NO mencionan la alternativa autenticada ni la nota de Webflow', () => {
    const base = {
      channelName: 'Guía Compradores',
      publicId:    'chn_lm000000001',
      tenantName:  'A&J Real Estate Group',
      baseUrl:     'https://app.itmano.com',
      fitCatalog:  FIT_CATALOG,
    }
    const lm = buildIntegrationPrompt({ ...base, channelType: 'lead_magnet' })
    const ev = buildIntegrationPrompt({ ...base, channelType: 'event' })
    expect(lm).not.toContain('x-contact-secret')
    expect(ev).not.toContain('x-contact-secret')
    expect(lm).not.toContain('Webflow')
    expect(ev).not.toContain('Webflow')
    expect(lm).toContain('secuencia de email')
    expect(ev).toContain('event_submission')
  })

  it('agrupa el catálogo de fit por intención y omite dimensiones sin datos', () => {
    const prompt = buildIntegrationPrompt({
      channelType: 'lead_magnet',
      channelName: 'Guía Compradores',
      publicId:    'chn_lm000000001',
      tenantName:  'A&J Real Estate Group',
      baseUrl:     'https://app.itmano.com',
      fitCatalog:  FIT_CATALOG,
    })
    expect(prompt).toContain('timeline')
    expect(prompt).toContain('under_3_months | 3_6_months')
    expect(prompt).toContain('budget_tier')
    expect(prompt).toContain('sell_motivation')
    expect(prompt).toContain('listing_status')
  })

  it('con fitCatalog vacío, omite la sección de fit sin dejar un encabezado huérfano', () => {
    const prompt = buildIntegrationPrompt({
      channelType: 'event',
      channelName: 'Open House',
      publicId:    'chn_ev000000001',
      tenantName:  'A&J Real Estate Group',
      baseUrl:     'https://app.itmano.com',
      fitCatalog:  [],
    })
    expect(prompt).not.toContain('cómo el CRM reconoce cada respuesta')
  })

  it('siempre incluye el snippet de tracking de vistas con el publicId correcto', () => {
    const prompt = buildIntegrationPrompt({
      channelType: 'event',
      channelName: 'Open House',
      publicId:    'chn_ev000000001',
      tenantName:  'A&J Real Estate Group',
      baseUrl:     'https://app.itmano.com',
      fitCatalog:  [],
    })
    expect(prompt).toContain('sendBeacon')
    expect(prompt).toContain('/api/intake/chn_ev000000001/view')
  })
})
````

- [ ] **Step 2b: Correr el test y confirmar que falla**

Run: `npx vitest run tests/sources/integration-prompt.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/services/integration-prompt'`

- [ ] **Step 3: Implementar `src/lib/services/integration-prompt.ts`**

````ts
import 'server-only'
import { FIT_DIMENSIONS } from './intake-fit'

export interface FitCatalogEntry {
  dimension:  string
  matchValue: string
  label:      string
}

export type IntegrationChannelType = 'lead_magnet' | 'event' | 'contact_form'

export interface IntegrationPromptInput {
  channelType:    IntegrationChannelType
  channelName:    string
  publicId:       string
  tenantName:     string
  baseUrl:        string
  contactSecret?: string
  fitCatalog:     FitCatalogEntry[]
}

const CHANNEL_TYPE_LABEL: Record<IntegrationChannelType, string> = {
  lead_magnet:  'Lead Magnet',
  event:        'Evento',
  contact_form: 'Formulario',
}

const INTENT_GROUPS: Array<{ label: string; dimensions: readonly string[] }> = [
  { label: 'Intención "buy" / "invest"', dimensions: FIT_DIMENSIONS.buy },
  { label: 'Intención "sell"',           dimensions: FIT_DIMENSIONS.sell },
]

// Arma la sección de form_answers + tabla de fit. Vacío si no hay catálogo
// (nunca deja un encabezado sin contenido debajo).
function buildFitSection(fitCatalog: FitCatalogEntry[]): string {
  if (fitCatalog.length === 0) return ''

  const byDimension = new Map<string, FitCatalogEntry[]>()
  for (const entry of fitCatalog) {
    const list = byDimension.get(entry.dimension) ?? []
    list.push(entry)
    byDimension.set(entry.dimension, list)
  }

  const groupLines: string[] = []
  for (const group of INTENT_GROUPS) {
    const dimsPresent = group.dimensions.filter(d => byDimension.has(d))
    if (dimsPresent.length === 0) continue
    groupLines.push(`${group.label}:`)
    for (const dim of dimsPresent) {
      const values = (byDimension.get(dim) ?? []).map(e => e.matchValue).join(' | ')
      groupLines.push(`  - ${dim.padEnd(16)} → ${values}`)
    }
    groupLines.push('')
  }
  if (groupLines.length === 0) return ''

  return [
    '### form_answers — cómo el CRM reconoce cada respuesta',
    'Arreglo de objetos, uno por pregunta respondida:',
    '{ "key": "...", "question": "texto de la pregunta", "value": "código interno", "label": "texto legible" }',
    '',
    'Puedes mandar cualquier pregunta con cualquier `key` — se guarda y se muestra',
    'en el CRM tal cual. Pero si preguntas presupuesto, tiempos, financiamiento o si',
    'ya tiene agente, usa EXACTAMENTE estas claves y códigos para que además sumen',
    'puntaje automático (otro `key`/valor se guarda igual, pero no puntúa):',
    '',
    ...groupLines,
  ].join('\n').trimEnd()
}

function buildViewSnippet(baseUrl: string, publicId: string): string {
  const fence = '```'
  return [
    '### Métricas de vistas (opcional, recomendado)',
    'Sin esto, "Vistas" y "Conversión" de este canal quedan en 0. Dispara esto en',
    'cada carga de página (no bloquea, no espera respuesta):',
    '',
    `${fence}html`,
    '<script>',
    '(function(){',
    "  var d = {v: localStorage.getItem('_itm_vid') || (function(){",
    "    var id = crypto.randomUUID(); localStorage.setItem('_itm_vid', id); return id;",
    '  })()};',
    `  navigator.sendBeacon('${baseUrl}/api/intake/${publicId}/view', JSON.stringify(d));`,
    '})();',
    '</script>',
    fence,
  ].join('\n')
}

// Solo contact_form: Webflow sigue siendo una integración real (ver
// api/webhooks/webflow/[publicId]/route.ts, que referencia el formulario real
// de A&J), separada de la narrativa "pega esto en tu IA" porque no necesita
// código ni IA — solo pegar una URL en un ajuste de Webflow. El secret de ese
// mecanismo sigue siendo el fallback global (fuera de alcance de este
// diseño), por eso no se imprime ningún valor.
function buildWebflowFootnote(baseUrl: string, publicId: string): string {
  return [
    '### ¿Usas Webflow? (sin código, sin IA)',
    'Si tu sitio está en Webflow y usas su formulario nativo, no necesitas nada de lo',
    'anterior: en Site Settings → Forms → Webhooks, apunta el formulario "Contact Us" a',
    `POST ${baseUrl}/api/webhooks/webflow/${publicId}`,
    'Webflow firma cada envío con HMAC — pide el secret vigente a ITMANO.',
  ].join('\n')
}

export function buildIntegrationPrompt(input: IntegrationPromptInput): string {
  const { channelType, channelName, publicId, tenantName, baseUrl, contactSecret, fitCatalog } = input
  const typeLabel = CHANNEL_TYPE_LABEL[channelType]
  const fence = '```'

  const lines: string[] = [
    `Estoy integrando un formulario web con el CRM de ITMANO para ${tenantName}.`,
    'Sigue este contrato exactamente — es todo lo que el CRM necesita para',
    'reconocer cada respuesta.',
    '',
    '### Canal',
    `${channelName} (${typeLabel}) · ID público: ${publicId}`,
    '',
  ]

  if (channelType === 'contact_form') {
    lines.push(
      '### Endpoint recomendado (sin autenticación, se puede llamar desde el navegador)',
      `POST ${baseUrl}/api/intake/${publicId}/submit`,
      'Content-Type: application/json',
      'CORS abierto (`Access-Control-Allow-Origin: *`). Protegido por ID no',
      'adivinable + honeypot + validación de schema, no por origen.',
      '',
      '### Alternativa autenticada (solo si llamas desde TU backend, nunca desde JS de navegador)',
      `POST ${baseUrl}/api/contact/${publicId}/submit`,
      `Header: x-contact-secret: ${contactSecret ?? '(pídelo desde "Ver Opciones de integración")'}`,
      'Sin CORS — un fetch directo desde el navegador fallará. Esta ruta no alimenta',
      'el scoring automático de fit (sección de abajo) — solo el análisis de IA en',
      'texto libre.',
      '',
    )
  } else {
    lines.push(
      '### Endpoint',
      `POST ${baseUrl}/api/intake/${publicId}/submit`,
      'Content-Type: application/json',
      'CORS abierto (`Access-Control-Allow-Origin: *`). Protegido por ID no',
      'adivinable + honeypot + validación de schema, no por origen. Se puede llamar',
      'directo desde el navegador o desde tu backend.',
      '',
    )
  }

  lines.push(
    '### Cuerpo (JSON)',
    `${fence}json`,
    '{',
    '  "first_name": "string, requerido",',
    '  "last_name":  "string, opcional",',
    '  "email":      "string, requerido, formato email",',
    '  "phone":      "string, opcional",',
    '  "language":   "es | en | pt, opcional (default es)",',
    '  "intent":     "buy | sell | invest, opcional — activa el scoring de fit de abajo",',
    '  "source_url": "string, opcional",',
    '  "website":    "SIEMPRE vacío (honeypot anti-spam)",',
    '  "form_answers": []',
    '}',
    fence,
    '',
  )

  const fitSection = buildFitSection(fitCatalog)
  if (fitSection) lines.push(fitSection, '')

  lines.push(
    '### Respuesta y qué dispara',
    `${fence}json`,
    '{ "ok": true, "status": "created" | "already_submitted" }',
    fence,
    'Mismo email + mismo tenant = mismo lead (se actualiza, nunca se duplica).',
  )
  if (channelType === 'lead_magnet') {
    lines.push('El envío inscribe automáticamente al lead en la secuencia de email de este canal.')
  } else if (channelType === 'event') {
    lines.push('Cada registro dispara notificación y scoring de `event_submission` (+20).')
  } else {
    lines.push('Cada envío dispara notificación de contacto en el CRM (bell + Telegram).')
  }
  lines.push('', buildViewSnippet(baseUrl, publicId), '')

  if (channelType === 'contact_form') {
    lines.push(buildWebflowFootnote(baseUrl, publicId), '')
  }

  return lines.join('\n').trimEnd() + '\n'
}

export async function getFitCatalog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  tenantId: string,
): Promise<FitCatalogEntry[]> {
  const { data } = await db
    .from('lead_score_rules')
    .select('tenant_id, dimension, match_value, label')
    .eq('category', 'fit')
    .eq('is_active', true)
    .not('match_value', 'is', null)
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)

  type Row = { tenant_id: string | null; dimension: string; match_value: string; label: string | null }
  const byKey = new Map<string, FitCatalogEntry & { isTenantSpecific: boolean }>()
  for (const row of (data ?? []) as Row[]) {
    const key = `${row.dimension}::${row.match_value}`
    const isTenantSpecific = row.tenant_id === tenantId
    const existing = byKey.get(key)
    if (!existing || (isTenantSpecific && !existing.isTenantSpecific)) {
      byKey.set(key, {
        dimension:  row.dimension,
        matchValue: row.match_value,
        label:      row.label ?? row.match_value,
        isTenantSpecific,
      })
    }
  }
  return [...byKey.values()].map(({ dimension, matchValue, label }) => ({ dimension, matchValue, label }))
}
````

Nota de tipos: `db` se tipa `any` deliberadamente aquí (con el eslint-disable ya usado en todo el archivo `sources/actions.ts` para el mismo propósito) porque el tipo real de `createAdminClient()` vive en `@/lib/supabase/admin` y este módulo no necesita importarlo — evita un import circular/pesado por un solo parámetro. Task 2 lo llama siempre pasando el cliente admin real.

- [ ] **Step 4: Correr el test de `buildIntegrationPrompt` y confirmar que pasa**

Run: `npx vitest run tests/sources/integration-prompt.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Escribir + correr el test de integración de `getFitCatalog` contra la base real**

Agregar al mismo archivo `tests/sources/integration-prompt.test.ts`:

```ts
import { adminClient, TENANT_A_ID } from '../rls/setup'
import { getFitCatalog } from '../../src/lib/services/integration-prompt'

describe('getFitCatalog', () => {
  it('lee las dimensiones de fit sembradas globalmente (migración 029)', async () => {
    const catalog = await getFitCatalog(adminClient, TENANT_A_ID)
    const dimensions = new Set(catalog.map(c => c.dimension))
    expect(dimensions).toContain('timeline')
    expect(dimensions).toContain('budget_tier')
    expect(dimensions).toContain('financing')
    expect(dimensions).toContain('agent_status')
    expect(dimensions).toContain('sell_motivation')
    expect(dimensions).toContain('listing_status')

    const timelineValues = catalog.filter(c => c.dimension === 'timeline').map(c => c.matchValue)
    expect(timelineValues).toContain('under_3_months')
  })
})
```

Run: `npx vitest run tests/sources/integration-prompt.test.ts`
Expected: 6 tests PASS (requiere las variables de entorno de Supabase que ya usa `tests/rls/setup` — mismas que `npm run test:rls`).

- [ ] **Step 6: Agregar el script `test:sources` a `package.json`**

En `package.json`, junto a los demás scripts `test:*`:

```json
    "test:sources": "vitest run tests/sources",
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/services/intake-fit.ts src/lib/services/integration-prompt.ts tests/sources/integration-prompt.test.ts package.json
git commit -m "feat(sources): agregar generador unico del prompt de integracion"
```

---

### Task 2: Las 3 acciones de creación devuelven `integrationPrompt`; secret propio para `contact_form`

**Files:**
- Modify: `src/app/(dashboard)/sources/actions.ts`

**Interfaces:**
- Consumes: `buildIntegrationPrompt`, `getFitCatalog`, `IntegrationPromptInput` de `@/lib/services/integration-prompt` (Task 1).
- Produces: `CreateLeadMagnetResult { ok:true; channelId; publicId; slug; sequenceId; integrationPrompt: string }`, `CreateEventResult { ok:true; channelId; publicId; slug; integrationPrompt: string }`, `CreateContactFormResult { ok:true; channelId; publicId; slug; integrationPrompt: string }` — consumidos por Task 4 (`sources-client.tsx`). Función privada `buildPromptForChannel(supabase, ch, contactSecret?)` — reutilizada por Task 5.

- [ ] **Step 1: Importar el nuevo módulo y agregar el helper compartido**

En `src/app/(dashboard)/sources/actions.ts`, agregar el import junto a los existentes:

```ts
import { buildIntegrationPrompt, getFitCatalog } from '@/lib/services/integration-prompt'
```

Agregar, cerca de `genPublicId`/`slugify` (helpers privados del archivo):

```ts
// Secret propio por canal, para el header x-contact-secret del endpoint de
// contacto autenticado. 192 bits — Web Crypto, sin import de Node.
function generateContactSecret(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

// Único punto que arma el prompt de integración — lo llaman las 3 acciones de
// creación y (Task 5) getIntegrationInfo/regenerateContactSecret. Nunca hay
// una segunda copia del contrato escrita a mano.
async function buildPromptForChannel(
  supabase: ReturnType<typeof createAdminClient>,
  ch: { tenant_id: string; channel_type: string; name: string; public_id: string },
  contactSecret?: string,
): Promise<string> {
  const { data: tenantRow } = await supabase.from('tenants').select('name').eq('id', ch.tenant_id).maybeSingle()
  const tenantName = ((tenantRow as { name?: string } | null)?.name) ?? 'tu agencia'
  const fitCatalog = await getFitCatalog(supabase, ch.tenant_id)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.itmano.com'
  return buildIntegrationPrompt({
    channelType: ch.channel_type as 'lead_magnet' | 'event' | 'contact_form',
    channelName: ch.name,
    publicId:    ch.public_id,
    tenantName,
    baseUrl,
    contactSecret,
    fitCatalog,
  })
}
```

- [ ] **Step 2: `createLeadMagnet` — reemplazar `embedSnippet` por `integrationPrompt`**

Cambiar la interfaz (elimina `embedSnippet`):

```ts
export interface CreateLeadMagnetResult {
  ok: true
  channelId: string
  publicId: string
  slug: string
  sequenceId: string
  integrationPrompt: string
}
```

Al final de `createLeadMagnet`, reemplazar este bloque:

```ts
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.itmano.com'
  const embedSnippet = `<script>
  (function(){
    var d = {v: localStorage.getItem('_itm_vid') || (function(){
      var id = crypto.randomUUID(); localStorage.setItem('_itm_vid', id); return id;
    })()};
    navigator.sendBeacon('${baseUrl}/api/intake/${publicId}/view', JSON.stringify(d));
  })();
</script>`

  return { ok: true, channelId, publicId, slug, sequenceId: seqId, embedSnippet }
```

por:

```ts
  const integrationPrompt = await buildPromptForChannel(supabase, {
    tenant_id: tenant_id, channel_type: 'lead_magnet', name: fields.name.trim(), public_id: publicId,
  })

  return { ok: true, channelId, publicId, slug, sequenceId: seqId, integrationPrompt }
```

- [ ] **Step 3: `createEvent` — reemplazar `formSnippet` por `integrationPrompt`**

Cambiar la interfaz:

```ts
export interface CreateEventResult {
  ok: true
  channelId: string
  publicId: string
  slug: string
  integrationPrompt: string
}
```

Reemplazar este bloque al final de `createEvent`:

```ts
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.itmano.com'
  const formSnippet = `<form action="${baseUrl}/api/intake/${publicId}/submit" method="POST">
  <input type="hidden" name="traffic_source" value="direct">
  <input type="text"   name="first_name"    placeholder="Nombre"   required>
  <input type="text"   name="last_name"     placeholder="Apellido">
  <input type="email"  name="email"         placeholder="Email"    required>
  <input type="tel"    name="phone"         placeholder="Teléfono">
  <!-- Honeypot (invisible, must be empty) -->
  <input type="text" name="_hp" style="display:none" tabindex="-1" autocomplete="off">
  <button type="submit">Registrarme al evento</button>
</form>`

  return { ok: true, channelId, publicId, slug, formSnippet }
```

por:

```ts
  const integrationPrompt = await buildPromptForChannel(supabase, {
    tenant_id: tenant_id, channel_type: 'event', name: fields.name.trim(), public_id: publicId,
  })

  return { ok: true, channelId, publicId, slug, integrationPrompt }
```

- [ ] **Step 4: `createContactForm` — secret propio por canal + `integrationPrompt`, quitar `webflowSecret`/`hasChannelSecret`**

Cambiar la firma y la interfaz de resultado:

```ts
export interface CreateContactFormResult {
  ok: true
  channelId: string
  publicId:  string
  slug:      string
  integrationPrompt: string
}

export async function createContactForm(fields: {
  name:      string
  slug?:     string
  agentId?:  string | null   // owning agent; null/'' = "Toda la agencia"
  tenantId?: string          // required when caller is super_admin
}): Promise<CreateContactFormResult | { ok: false; error: string }> {
```

(Se elimina el parámetro `webflowSecret` — nunca lo pasaba ningún componente de UI.)

Reemplazar la escritura del canal — de:

```ts
  const publicId  = genPublicId()
  const slug      = fields.slug?.trim() || slugify(fields.name)
  const channelId = crypto.randomUUID()
  const secret    = fields.webflowSecret?.trim() || null
```

a:

```ts
  const publicId     = genPublicId()
  const slug         = fields.slug?.trim() || slugify(fields.name)
  const channelId    = crypto.randomUUID()
  const contactSecret = generateContactSecret()
```

Y el insert, de:

```ts
    metadata:     secret ? { webflow_secret: secret } : {},
```

a:

```ts
    metadata:     { contact_secret: contactSecret },
```

Reemplazar el bloque final — de:

```ts
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.itmano.com'
  return {
    ok: true, channelId, publicId, slug,
    webflowWebhookUrl: `${baseUrl}/api/webhooks/webflow/${publicId}`,
    contactBackupUrl:  `${baseUrl}/api/contact/${publicId}/submit`,
    publicIntakeUrl:   `${baseUrl}/api/intake/${publicId}/submit`,
    hasChannelSecret:  !!secret,
  }
```

a:

```ts
  const integrationPrompt = await buildPromptForChannel(
    supabase,
    { tenant_id: tenant_id, channel_type: 'contact_form', name: fields.name.trim(), public_id: publicId },
    contactSecret,
  )

  return { ok: true, channelId, publicId, slug, integrationPrompt }
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: errores únicamente en `sources-client.tsx` (usa los campos viejos `embedSnippet`/`formSnippet`/`webflowWebhookUrl`/etc.) — se resuelven en Task 4. Ningún error dentro de `actions.ts` mismo.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/sources/actions.ts
git commit -m "feat(sources): generar integrationPrompt y secret propio al crear una fuente"
```

---

### Task 3: Componente `IntegrationPromptModal`

**Files:**
- Create: `src/app/(dashboard)/sources/integration-prompt-modal.tsx`

**Interfaces:**
- Consumes: nada nuevo — solo React/lucide-react, mismo patrón visual que `SnippetBlock` en `sources-client.tsx`.
- Produces: `IntegrationPromptModal({ title, prompt, onClose, onRegenerateSecret? }: IntegrationPromptModalProps)` — consumido por Task 4 y Task 6.

- [ ] **Step 1: Crear el componente**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { Check, Copy, RefreshCw, X } from 'lucide-react'

interface IntegrationPromptModalProps {
  title:              string
  prompt:             string
  onClose:            () => void
  onRegenerateSecret?: () => Promise<{ ok: true; prompt: string } | { ok: false; error: string }>
}

export function IntegrationPromptModal({ title, prompt, onClose, onRegenerateSecret }: IntegrationPromptModalProps) {
  const [currentPrompt, setCurrentPrompt] = useState(prompt)
  const [copied,  setCopied]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function copy() {
    navigator.clipboard.writeText(currentPrompt).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function regenerate() {
    if (!onRegenerateSecret) return
    setError(null)
    startTransition(async () => {
      const res = await onRegenerateSecret()
      if (!res.ok) { setError(res.error); return }
      setCurrentPrompt(res.prompt)
    })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '640px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Copia todo este bloque y pégalo en tu asistente de IA de confianza (Claude, ChatGPT, etc.)
            junto con el pedido de construir o adaptar tu formulario. Tiene todo lo que el CRM necesita
            para reconocer cada respuesta.
          </div>

          <div style={{ position: 'relative' }}>
            <pre style={{
              background: 'var(--bg-overlay)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '14px',
              paddingTop: '44px',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              overflowX: 'auto',
              margin: 0,
              fontFamily: 'monospace',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '50vh',
              overflowY: 'auto',
            }}>
              {currentPrompt}
            </pre>
            <button
              onClick={copy}
              style={{
                position: 'absolute', top: '8px', right: '8px',
                background: copied ? 'var(--accent-green)' : 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)', borderRadius: '6px',
                padding: '5px 10px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '5px',
                fontSize: '12px', color: copied ? '#fff' : 'var(--text-muted)',
              }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copiado' : 'Copiar prompt'}
            </button>
          </div>

          {error && (
            <div style={{ fontSize: '12px', color: '#E04040', padding: '6px 10px', background: 'rgba(224,64,64,0.08)', borderRadius: '6px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px' }}>
            {onRegenerateSecret ? (
              <button
                onClick={regenerate}
                disabled={pending}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  fontSize: '12px', color: 'var(--accent-coral)',
                  background: 'transparent', border: '1px solid rgba(201,123,107,0.3)',
                  borderRadius: '6px', padding: '6px 12px', cursor: pending ? 'default' : 'pointer',
                  opacity: pending ? 0.6 : 1,
                }}
              >
                <RefreshCw size={12} />
                {pending ? 'Generando…' : 'Generar nuevo secret'}
              </button>
            ) : <span />}
            <button
              onClick={onClose}
              style={{
                padding: '9px 18px', fontSize: '13px', fontWeight: 500,
                color: 'var(--bg-base)', background: 'var(--accent-gold)',
                border: 'none', borderRadius: '8px', cursor: 'pointer',
              }}
            >
              Listo
            </button>
          </div>
          {onRegenerateSecret && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Generar un secret nuevo invalida cualquier integración que ya esté usando el anterior.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en este archivo (los de `sources-client.tsx` siguen pendientes de Task 4).

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/sources/integration-prompt-modal.tsx
git commit -m "feat(sources): agregar IntegrationPromptModal"
```

---

### Task 4: `sources-client.tsx` — reemplazar las 3 pantallas de resultado

**Files:**
- Modify: `src/app/(dashboard)/sources/sources-client.tsx`

**Interfaces:**
- Consumes: `CreateLeadMagnetResult`/`CreateEventResult`/`CreateContactFormResult` (ahora con `integrationPrompt: string`, Task 2), `IntegrationPromptModal` (Task 3).
- Produces: ninguna nueva — cierra la brecha de tipos abierta en Task 2.

- [ ] **Step 1: Importar el nuevo modal**

Agregar junto a los demás imports de `sources-client.tsx`:

```ts
import { IntegrationPromptModal } from './integration-prompt-modal'
```

- [ ] **Step 2: `LeadMagnetModal` — usar `integrationPrompt`**

Cambiar el estado del resultado — de:

```ts
  const [result,   setResult]   = useState<{ publicId: string; slug: string; sequenceId: string; embedSnippet: string } | null>(null)
```

a:

```ts
  const [result,   setResult]   = useState<{ publicId: string; slug: string; sequenceId: string; integrationPrompt: string } | null>(null)
```

En `handleSubmit`, cambiar:

```ts
      setResult({ publicId: res.publicId, slug: res.slug, sequenceId: res.sequenceId, embedSnippet: res.embedSnippet })
```

por:

```ts
      setResult({ publicId: res.publicId, slug: res.slug, sequenceId: res.sequenceId, integrationPrompt: res.integrationPrompt })
```

Reemplazar todo el bloque JSX del `result` (desde `<div style={{ padding: '10px 14px'...` hasta el `</>` que cierra esa rama, incluyendo el bloque de "Snippet de seguimiento de vistas" y el botón "Listo" final) por:

```tsx
            <IntegrationPromptModal
              title="Lead Magnet creado"
              prompt={result.integrationPrompt}
              onClose={onClose}
            />
```

Como `IntegrationPromptModal` ya dibuja su propio overlay de pantalla completa, también hay que evitar el doble overlay: envolver el `return` completo de `LeadMagnetModal` así — si `result` existe, retornar directamente `<IntegrationPromptModal .../>` en vez del `<div style={{position:'fixed', inset:0...}}>` que envuelve el formulario. Estructura final de la función:

```tsx
function LeadMagnetModal({ onClose, isSuperAdmin, tenants, agents }: {
  onClose:     () => void
  isSuperAdmin: boolean
  tenants:     Array<{ id: string; name: string }>
  agents:      AgentOption[]
}) {
  const [name,     setName]     = useState('')
  const [slug,     setSlug]     = useState('')
  const [lpUrl,    setLpUrl]    = useState('')
  const [fileUrl,  setFileUrl]  = useState('')
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? '')
  const [agentId,  setAgentId]  = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [result,   setResult]   = useState<{ publicId: string; slug: string; sequenceId: string; integrationPrompt: string } | null>(null)
  const [pending,  startTransition] = useTransition()

  const visibleAgents = isSuperAdmin ? agents.filter(a => a.tenantId === tenantId) : agents

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const res = await createLeadMagnet({
        name, slug: slug || undefined, lpUrl: lpUrl || undefined, fileUrl: fileUrl || undefined,
        agentId: agentId || null,
        tenantId: isSuperAdmin ? tenantId : undefined,
      })
      if (!res.ok) { setError(res.error); return }
      setResult({ publicId: res.publicId, slug: res.slug, sequenceId: res.sequenceId, integrationPrompt: res.integrationPrompt })
    })
  }

  if (result) {
    return (
      <IntegrationPromptModal
        title="Lead Magnet creado"
        prompt={result.integrationPrompt}
        onClose={onClose}
      />
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '520px',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Nuevo Lead Magnet
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <FormSection title="Básico" first>
          {isSuperAdmin && (
            <div>
              <label style={LABEL}>Tenant <span style={{ color: 'var(--accent-coral)' }}>*</span></label>
              <select value={tenantId} onChange={e => { setTenantId(e.target.value); setAgentId('') }} style={{ ...INPUT, appearance: 'none', cursor: 'pointer' }}>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={LABEL}>Nombre *</label>
            <input value={name} onChange={e => setName(e.target.value)} style={INPUT} placeholder="Ej. Guía para Primeros Compradores" autoFocus />
          </div>
          <div>
            <label style={LABEL}>Slug <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(opcional — se genera del nombre)</span></label>
            <input value={slug} onChange={e => setSlug(e.target.value)} style={INPUT} placeholder="guia-primeros-compradores" />
          </div>
          </FormSection>

          <FormSection title="Material y atribución">
          <AgentSelect agents={visibleAgents} value={agentId} onChange={setAgentId} />
          <div>
            <label style={LABEL}>URL de la landing page <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(opcional)</span></label>
            <input value={lpUrl} onChange={e => setLpUrl(e.target.value)} style={INPUT} placeholder="https://..." type="url" />
          </div>
          <div>
            <label style={LABEL}>URL del recurso descargable <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(opcional)</span></label>
            <input value={fileUrl} onChange={e => setFileUrl(e.target.value)} style={INPUT} placeholder="https://drive.google.com/..." type="url" />
          </div>
          </FormSection>

          {error && (
            <div style={{ fontSize: '12px', color: '#E04040', padding: '6px 10px', background: 'rgba(224,64,64,0.08)', borderRadius: '6px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <button onClick={onClose} style={BTN_GHOST}>Cancelar</button>
            <button onClick={handleSubmit} disabled={!name.trim() || pending || (isSuperAdmin && !tenantId)} style={{ ...BTN_PRIMARY, opacity: (!name.trim() || pending || (isSuperAdmin && !tenantId)) ? 0.6 : 1 }}>
              {pending ? 'Creando…' : 'Crear Lead Magnet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Reemplazar `EventModal` completo**

Reemplazar la función `EventModal` completa (líneas 454-589 del archivo original) por:

```tsx
function EventModal({ onClose, isSuperAdmin, tenants, agents }: {
  onClose:      () => void
  isSuperAdmin: boolean
  tenants:      Array<{ id: string; name: string }>
  agents:       AgentOption[]
}) {
  const [name,      setName]      = useState('')
  const [slug,      setSlug]      = useState('')
  const [eventDate, setEventDate] = useState('')
  const [location,  setLocation]  = useState('')
  const [tenantId,  setTenantId]  = useState(tenants[0]?.id ?? '')
  const [agentId,   setAgentId]   = useState('')
  const [error,     setError]     = useState<string | null>(null)
  const [result,    setResult]    = useState<{ publicId: string; slug: string; integrationPrompt: string } | null>(null)
  const [pending,   startTransition] = useTransition()

  const visibleAgents = isSuperAdmin ? agents.filter(a => a.tenantId === tenantId) : agents

  function handleSubmit() {
    setError(null)
    if (!eventDate) { setError('La fecha del evento es obligatoria'); return }
    startTransition(async () => {
      const res = await createEvent({
        name, slug: slug || undefined, eventDate, location: location || undefined,
        agentId: agentId || null,
        tenantId: isSuperAdmin ? tenantId : undefined,
      })
      if (!res.ok) { setError(res.error); return }
      setResult({ publicId: res.publicId, slug: res.slug, integrationPrompt: res.integrationPrompt })
    })
  }

  if (result) {
    return (
      <IntegrationPromptModal
        title="Evento creado"
        prompt={result.integrationPrompt}
        onClose={onClose}
      />
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '520px',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Nuevo Evento
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <FormSection title="Básico" first>
          {isSuperAdmin && (
            <div>
              <label style={LABEL}>Tenant <span style={{ color: 'var(--accent-coral)' }}>*</span></label>
              <select value={tenantId} onChange={e => { setTenantId(e.target.value); setAgentId('') }} style={{ ...INPUT, appearance: 'none', cursor: 'pointer' }}>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={LABEL}>Nombre del evento *</label>
            <input value={name} onChange={e => setName(e.target.value)} style={INPUT} placeholder="Ej. Open House Virginia Beach Jun 2026" autoFocus />
          </div>
          <div>
            <label style={LABEL}>Slug <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(opcional)</span></label>
            <input value={slug} onChange={e => setSlug(e.target.value)} style={INPUT} placeholder="open-house-vb-jun-2026" />
          </div>
          </FormSection>

          <FormSection title="Detalles del evento">
          <AgentSelect agents={visibleAgents} value={agentId} onChange={setAgentId} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label style={LABEL}>Fecha del evento <span style={{ color: 'var(--accent-coral)' }}>*</span></label>
              <input value={eventDate} onChange={e => setEventDate(e.target.value)} style={INPUT} type="date" />
            </div>
            <div>
              <label style={LABEL}>Ubicación <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(opc.)</span></label>
              <input value={location} onChange={e => setLocation(e.target.value)} style={INPUT} placeholder="Virginia Beach, VA" />
            </div>
          </div>
          </FormSection>

          {error && (
            <div style={{ fontSize: '12px', color: '#E04040', padding: '6px 10px', background: 'rgba(224,64,64,0.08)', borderRadius: '6px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <button onClick={onClose} style={BTN_GHOST}>Cancelar</button>
            <button onClick={handleSubmit} disabled={!name.trim() || !eventDate || pending || (isSuperAdmin && !tenantId)} style={{ ...BTN_PRIMARY, opacity: (!name.trim() || !eventDate || pending || (isSuperAdmin && !tenantId)) ? 0.6 : 1 }}>
              {pending ? 'Creando…' : 'Crear Evento'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Reemplazar `ContactFormModal` completo**

Reemplazar la función `ContactFormModal` completa (líneas 593-737 del archivo original) por:

```tsx
function ContactFormModal({ onClose, isSuperAdmin, tenants, agents }: {
  onClose:      () => void
  isSuperAdmin: boolean
  tenants:      Array<{ id: string; name: string }>
  agents:       AgentOption[]
}) {
  const [name,     setName]     = useState('')
  const [slug,     setSlug]     = useState('')
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? '')
  const [agentId,  setAgentId]  = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [result,   setResult]   = useState<{ publicId: string; slug: string; integrationPrompt: string } | null>(null)
  const [pending,  startTransition] = useTransition()

  const visibleAgents = isSuperAdmin ? agents.filter(a => a.tenantId === tenantId) : agents

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const res = await createContactForm({
        name, slug: slug || undefined,
        agentId: agentId || null,
        tenantId: isSuperAdmin ? tenantId : undefined,
      })
      if (!res.ok) { setError(res.error); return }
      setResult({ publicId: res.publicId, slug: res.slug, integrationPrompt: res.integrationPrompt })
    })
  }

  if (result) {
    return (
      <IntegrationPromptModal
        title="Formulario creado"
        prompt={result.integrationPrompt}
        onClose={onClose}
      />
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '560px',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Nuevo Formulario Web
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <FormSection title="Básico" first>
          {isSuperAdmin && (
            <div>
              <label style={LABEL}>Tenant <span style={{ color: 'var(--accent-coral)' }}>*</span></label>
              <select value={tenantId} onChange={e => { setTenantId(e.target.value); setAgentId('') }} style={{ ...INPUT, appearance: 'none', cursor: 'pointer' }}>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={LABEL}>Nombre del formulario *</label>
            <input value={name} onChange={e => setName(e.target.value)} style={INPUT} placeholder="Ej. Contáctanos — Página de inicio" autoFocus />
          </div>
          <div>
            <label style={LABEL}>Slug <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(opcional)</span></label>
            <input value={slug} onChange={e => setSlug(e.target.value)} style={INPUT} placeholder="contactanos-home" />
          </div>
          </FormSection>

          <FormSection title="Agente">
          <AgentSelect agents={visibleAgents} value={agentId} onChange={setAgentId} />
          </FormSection>

          {error && (
            <div style={{ fontSize: '12px', color: '#E04040', padding: '6px 10px', background: 'rgba(224,64,64,0.08)', borderRadius: '6px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <button onClick={onClose} style={BTN_GHOST}>Cancelar</button>
            <button onClick={handleSubmit} disabled={!name.trim() || pending || (isSuperAdmin && !tenantId)} style={{ ...BTN_PRIMARY, opacity: (!name.trim() || pending || (isSuperAdmin && !tenantId)) ? 0.6 : 1 }}>
              {pending ? 'Creando…' : 'Crear Formulario'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Eliminar `SnippetBlock` — queda sin uso**

Tras los Steps 2-4, ninguno de los 3 modales usa ya `SnippetBlock` (antes se usaba en las 3 pantallas de resultado que este task reemplaza). Es el mismo principio del resto de este plan: código muerto que puede desalinearse en silencio. Eliminar del archivo la función completa `SnippetBlock` (el bloque `// ─── Snippet copy block ─────...` con la función `function SnippetBlock({ code }: { code: string }) { ... }`, justo antes de `// ─── Lead Magnet modal ───...`).

En el import de la parte superior del archivo, cambiar:

```ts
import { Plus, Copy, Check, X, Trash2, AlertTriangle } from 'lucide-react'
```

por:

```ts
import { Plus, X, Trash2, AlertTriangle } from 'lucide-react'
```

(`Copy`/`Check` solo los usaba `SnippetBlock`; `IntegrationPromptModal` importa su propia copia de esos íconos en Task 3, así que no hace falta reexportar nada.)

- [ ] **Step 6: Verificar tipos y lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errores, y sin warnings de `Copy`/`Check`/`SnippetBlock` sin usar. Esto cierra la ventana de inconsistencia abierta en Task 2 — el árbol vuelve a compilar limpio de punta a punta.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/sources/sources-client.tsx
git commit -m "feat(sources): usar IntegrationPromptModal como pantalla de resultado en los 3 modales de creacion"
```

---

### Task 5: Nuevas acciones `getIntegrationInfo` y `regenerateContactSecret`

**Files:**
- Modify: `src/app/(dashboard)/sources/actions.ts`

**Interfaces:**
- Consumes: `buildPromptForChannel`, `generateContactSecret` (Task 2, mismo archivo).
- Produces: `getIntegrationInfo(channelId: string): Promise<{ok:true; prompt:string} | {ok:false; error:string}>`, `regenerateContactSecret(channelId: string): Promise<{ok:true; prompt:string} | {ok:false; error:string}>` — consumidos por Task 6.

- [ ] **Step 1: Implementar `getIntegrationInfo`**

Agregar a `src/app/(dashboard)/sources/actions.ts`, después de `createContactForm`:

```ts
// ─── Opciones de integración — siempre disponibles, no solo al crear ─────────

export async function getIntegrationInfo(
  channelId: string
): Promise<{ ok: true; prompt: string } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  if (!ctx.tenant_id && ctx.role !== 'super_admin') return { ok: false, error: 'Acceso no autorizado' }

  const supabase = createAdminClient()
  let chQ = supabase
    .from('acquisition_channels')
    .select('id, tenant_id, channel_type, name, public_id, metadata')
    .eq('id', channelId)
  if (ctx.tenant_id) chQ = chQ.eq('tenant_id', ctx.tenant_id)
  const { data: channel } = await chQ.maybeSingle()
  if (!channel) return { ok: false, error: 'Fuente no encontrada' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ch = channel as any
  const channelType = ch.channel_type as string
  if (!['lead_magnet', 'event', 'contact_form'].includes(channelType)) {
    return { ok: false, error: 'Este tipo de fuente no tiene opciones de integración.' }
  }

  let contactSecret: string | undefined
  if (channelType === 'contact_form') {
    contactSecret = (ch.metadata?.contact_secret as string | undefined) || undefined
    if (!contactSecret) {
      // Backfill perezoso — canal contact_form creado antes de este cambio.
      contactSecret = generateContactSecret()
      await supabase
        .from('acquisition_channels')
        .update({ metadata: { ...(ch.metadata ?? {}), contact_secret: contactSecret } })
        .eq('id', channelId)
    }
  }

  const prompt = await buildPromptForChannel(supabase, ch, contactSecret)
  return { ok: true, prompt }
}

export async function regenerateContactSecret(
  channelId: string
): Promise<{ ok: true; prompt: string } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  if (!ctx.tenant_id && ctx.role !== 'super_admin') return { ok: false, error: 'Acceso no autorizado' }
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const supabase = createAdminClient()
  let chQ = supabase
    .from('acquisition_channels')
    .select('id, tenant_id, channel_type, name, public_id, metadata')
    .eq('id', channelId)
    .eq('channel_type', 'contact_form')
  if (ctx.tenant_id) chQ = chQ.eq('tenant_id', ctx.tenant_id)
  const { data: channel } = await chQ.maybeSingle()
  if (!channel) return { ok: false, error: 'Fuente no encontrada' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ch = channel as any
  const contactSecret = generateContactSecret()
  const { error } = await supabase
    .from('acquisition_channels')
    .update({ metadata: { ...(ch.metadata ?? {}), contact_secret: contactSecret } })
    .eq('id', channelId)
  if (error) return { ok: false, error: error.message }

  const prompt = await buildPromptForChannel(supabase, ch, contactSecret)
  return { ok: true, prompt }
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/sources/actions.ts
git commit -m "feat(sources): agregar getIntegrationInfo y regenerateContactSecret"
```

---

### Task 6: Botón "Ver Opciones de integración" en `ChannelActions`

**Files:**
- Modify: `src/app/(dashboard)/sources/[slug]/channel-actions.tsx`
- Modify: `src/app/(dashboard)/sources/[slug]/page.tsx:121-129`

**Interfaces:**
- Consumes: `getIntegrationInfo`, `regenerateContactSecret` (Task 5), `IntegrationPromptModal` (Task 3).
- Produces: nuevo prop `channelType: string` en `ChannelActionsProps` — sin impacto en otros consumidores (`ChannelActions` solo se usa desde `page.tsx`).

- [ ] **Step 1: Pasar `channelType` desde `page.tsx`**

En `src/app/(dashboard)/sources/[slug]/page.tsx:121-129`, agregar `channelType={channel.channelType}` a la llamada existente:

```tsx
        <ChannelActions
          channelId={channel.id}
          channelName={channel.name}
          channelActive={channel.active}
          channelType={channel.channelType}
          emailSequenceId={channel.emailSequenceId}
          agentId={channel.agentId}
          agents={agents}
          sequences={sequences.filter(s => s.activationType === 'form').map(s => ({ id: s.id, name: s.name }))}
        />
```

- [ ] **Step 2: Agregar el botón y el modal en `ChannelActions`**

En `src/app/(dashboard)/sources/[slug]/channel-actions.tsx`, agregar los imports:

```ts
import { Pencil, Trash2, X, Puzzle } from 'lucide-react'
import { updateChannel, updateChannelSequence, archiveChannel, getIntegrationInfo, regenerateContactSecret } from '../actions'
import { IntegrationPromptModal } from '../integration-prompt-modal'
```

Agregar `channelType: string` a `ChannelActionsProps` y a la desestructuración de props:

```ts
interface ChannelActionsProps {
  channelId:       string
  channelName:     string
  channelActive:   boolean
  channelType:     string
  emailSequenceId: string | null
  agentId:         string | null
  agents:          Array<{ id: string; name: string }>
  sequences:       Array<{ id: string; name: string }>
}
```

```ts
export function ChannelActions({ channelId, channelName, channelActive, channelType, emailSequenceId, agentId, agents, sequences }: ChannelActionsProps) {
```

Agregar estado nuevo junto a los `useState` existentes:

```ts
  const [integrationPrompt, setIntegrationPrompt] = useState<string | null>(null)
  const [integrationError,  setIntegrationError]  = useState<string | null>(null)
```

Agregar la función que abre el modal:

```ts
  function openIntegrationInfo() {
    setIntegrationError(null)
    start(async () => {
      const res = await getIntegrationInfo(channelId)
      if (!res.ok) { setIntegrationError(res.error); return }
      setIntegrationPrompt(res.prompt)
    })
  }
```

Agregar el botón en la fila de acciones, antes del botón "Archivar" (solo para los 3 tipos que tienen contrato de integración):

```tsx
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {['lead_magnet', 'event', 'contact_form'].includes(channelType) && (
          <button
            onClick={openIntegrationInfo}
            disabled={pending}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px', fontSize: '12px', fontWeight: 500,
              color: 'var(--text-secondary)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px', cursor: pending ? 'default' : 'pointer',
            }}
          >
            <Puzzle size={12} /> Ver Opciones de integración
          </button>
        )}
        <button
          onClick={() => { setName(channelName); setActive(channelActive); setSequenceId(emailSequenceId ?? ''); setAgId(agentId ?? ''); setMode('edit') }}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '7px 14px', fontSize: '12px', fontWeight: 500,
            color: 'var(--text-secondary)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px', cursor: 'pointer',
          }}
        >
          <Pencil size={12} /> Editar
        </button>
```

(el resto de la fila — botón "Archivar" — queda igual). Si `integrationError` existe, mostrarlo justo debajo de la fila de botones:

```tsx
      {integrationError && (
        <div style={{ fontSize: '12px', color: '#E04040', marginTop: '8px', padding: '6px 10px', background: 'rgba(224,64,64,0.08)', borderRadius: '6px' }}>
          {integrationError}
        </div>
      )}
```

Y al final del componente, junto a los otros modales condicionales (`mode === 'edit'`, `mode === 'confirm_archive'`), agregar:

```tsx
      {integrationPrompt !== null && (
        <IntegrationPromptModal
          title="Opciones de integración"
          prompt={integrationPrompt}
          onClose={() => setIntegrationPrompt(null)}
          onRegenerateSecret={
            channelType === 'contact_form'
              ? () => regenerateContactSecret(channelId)
              : undefined
          }
        />
      )}
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/sources/\[slug\]/channel-actions.tsx src/app/\(dashboard\)/sources/\[slug\]/page.tsx
git commit -m "feat(sources): boton Ver Opciones de integracion en el perfil de la fuente"
```

---

### Task 7: Simplificar el bloque duplicado en `page-options.tsx`

**Files:**
- Modify: `src/app/(dashboard)/sources/[slug]/page-options.tsx:177-214`

**Interfaces:**
- Consumes: ninguna nueva.
- Produces: ninguna — solo elimina contrato duplicado.

- [ ] **Step 1: Reemplazar el bloque "Formulario 100% propio (avanzado)"**

En `src/app/(dashboard)/sources/[slug]/page-options.tsx`, reemplazar el bloque completo (líneas 177-214, desde `{channelType !== 'contact_form' && (` hasta su `)}` de cierre) por:

```tsx
          {channelType !== 'contact_form' && (
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                Formulario 100% propio (avanzado)
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.6 }}>
                Tu desarrollador puede construir el formulario como quiera y conectarlo directo al CRM.
                El botón <strong>&quot;Ver Opciones de integración&quot;</strong>, junto a Editar/Archivar en el
                header de esta fuente, tiene el contrato completo — endpoint, campos y cómo el CRM
                reconoce cada respuesta — listo para copiar y pegarle a tu asistente de IA de confianza.
              </div>
            </div>
          )}
```

Esto elimina el `CopyBtn` del endpoint suelto y la lista de "Reglas obligatorias" hardcodeada (incluida la frase "sin claves fijas" que contradice el scoring real de fit) — el botón del header es ahora la única fuente del contrato.

- [ ] **Step 2: Verificar que `CopyBtn` sigue usándose en este archivo**

`CopyBtn` también se usa en la sección "Código para pegar" del iframe (líneas ~163-174) — confirmar que ese uso queda intacto y que no queda un import sin usar. Si `CopyBtn` deja de usarse en algún otro punto del archivo, el lint (`npm run lint`) lo señala como variable no usada.

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/sources/\[slug\]/page-options.tsx
git commit -m "docs(sources): apuntar page-options al boton de integracion en vez de duplicar el contrato"
```

---

### Task 8: Verificación final

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Build + typecheck + lint completos**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: los 3 comandos terminan sin errores.

- [ ] **Step 2: Correr la suite nueva**

Run: `npm run test:sources`
Expected: todos los tests de Task 1 en PASS.

- [ ] **Step 3: QA manual en el navegador — creación**

Con `npm run dev` corriendo, en `/sources`:
1. Crear un Lead Magnet nuevo → confirmar que el modal de resultado es el `IntegrationPromptModal`, con el `publicId` real, el endpoint correcto, la tabla de fit, y el snippet de tracking.
2. Crear un Evento nuevo → mismo modal, mencionando `event_submission` (+20), sin sección de secret.
3. Crear un Formulario nuevo → mismo modal, con AMBOS endpoints (recomendado + autenticado), un secret real de 48 caracteres hex, y la nota final "¿Usas Webflow?" con la URL del webhook.

- [ ] **Step 4: QA manual en el navegador — acceso persistente**

1. Entrar al perfil de cualquiera de las 3 fuentes creadas en el Step 3 → confirmar el botón "Ver Opciones de integración" junto a Editar/Archivar → confirmar que el prompt mostrado es idéntico al de la creación.
2. En el Formulario, click "Generar nuevo secret" → confirmar que el prompt se actualiza con un secret distinto al anterior.
3. Entrar al perfil de un canal `contact_form` **creado antes de este cambio** (uno ya existente en la base, si lo hay) → click "Ver Opciones de integración" → confirmar que genera y persiste un secret nuevo la primera vez (backfill perezoso) sin error.
4. En la pestaña "Página" de cualquiera de las 3 fuentes, opción "Embebible en tu web" → confirmar que el bloque "Formulario 100% propio (avanzado)" ya no repite el contrato, solo apunta al botón del header.

- [ ] **Step 5: No commit — este task es solo verificación**

Si algún paso falla, volver al task correspondiente, corregir, y repetir el Step 1 completo antes de continuar.
