# Editor de plantillas del Estudio — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que las plantillas del Estudio sean filas de HTML/CSS editables desde el CRM, renderizadas por Chrome, con vista previa fiel y sin desplegar.

**Architecture:** una función pura arma el documento (`buildTemplateDocument`) y la usan los dos lados — el iframe del editor y el Chrome del servidor —, así que la vista previa no puede mentir. El render sale a `/api/studio/render` para que Chromium no engorde el bundle del Estudio. Las plantillas viven en `studio_templates` y cada pieza guarda el HTML con el que se hizo.

**Tech Stack:** Next.js 16.2 (App Router) · React 19.2 · TypeScript strict · Supabase (sandbox `xpaixcowvyksgluazwzn`) · `puppeteer-core` + `@sparticuz/chromium` · `sharp` · Vitest.

**Spec:** `docs/superpowers/specs/2026-08-18-studio-editor-plantillas-design.md` — léelo entero antes de la Task 1. Este plan argumenta desde él.

## Global Constraints

- **Branch nuevo:** `feat/studio-editor-plantillas`, creado desde `fix/studio-ajustes-y-visor`. Nunca commits directos a `main`. El PR lo abre Dylan.
- **Commits:** convencionales (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`), cortos, en español, un commit = un cambio lógico. **Prohibido** firmar como IA: nada de `Co-Authored-By: Claude`, "generated with" ni emojis.
- **Migraciones: sandbox primero.** `project_id` sandbox `xpaixcowvyksgluazwzn`. Aplicar a producción (`kvmjlrvlnhiarrqxulkr`) **solo tras preguntar a Dylan**. Tras migrar: `npm run types:db:sandbox`.
- **Toda lista de columnas de un `.select()` se arma con `columns()`** de `src/lib/supabase/columns.ts`.
- **Server Components hacen fetch; los Client Components reciben props.** Nada de queries de Supabase desde el cliente.
- **Las server actions devuelven** `{ ok: true, data }` o `{ ok: false, error }`. Nunca lanzan al cliente. Validación con `zod` antes de tocar la base.
- **Cada server action repite el guardia** `canUseStudio(ctx)`: una server action es un endpoint HTTP.
- **TypeScript strict.** Nada de `any` sin un comentario `// reason:` en la misma línea o encima.
- **Copy de UI:** español neutro latino, tono calmado, **sin emojis**, sin regionalismos. Palabras de dinero: "inversión", nunca "costo"/"precio"/"pago" (no aplica al precio de una propiedad, que es un dato).
- **Colores de la interfaz del CRM:** CSS variables de `src/app/globals.css` (`var(--text-muted)`, `var(--border-subtle)`…). Nunca hex hardcodeado. Esto **no** aplica al HTML/CSS de una plantilla, que es contenido y recibe sus colores como custom properties.
- **Verificación por tarea:** `npm run lint` y `npx tsc --noEmit` siempre; `npm run test:unit` cuando la tarea toca `src/lib` o `tests/`. `npm run build` antes de pushear.
- **`test:unit` no levanta Chrome.** Ninguna tarea añade a `tests/` un import de `puppeteer-core`, `@sparticuz/chromium` ni de `src/lib/studio/render/chrome.ts`.

---

## Estructura de archivos

**Se crean:**

| Archivo | Responsabilidad |
|---|---|
| `src/lib/studio/templates/document.ts` | Puro. Arma el documento HTML final: secciones, sustitución, clases de estado, reset, variables |
| `src/lib/studio/templates/values.ts` | Puro. `TemplateProps` → mapa de valores, clases de estado y custom properties |
| `src/lib/studio/templates/slots.ts` | Puro. Infiere `slots` e `ideal_photos` leyendo el HTML |
| `src/lib/studio/templates/meta.ts` | `TemplateMeta` (serializable, viaja al cliente) y `templateFit` |
| `src/lib/studio/fonts/catalog.ts` | Catálogo de familias y `fontFaceCss(mode)` |
| `src/lib/studio/render/chrome.ts` | `server-only`. Puppeteer: navegador reutilizado, sin JS, sin red |
| `src/lib/studio/render/client.ts` | `server-only`. POST a `/api/studio/render` |
| `src/app/api/studio/render/route.ts` | La ruta que renderiza. Único sitio que importa Chromium |
| `src/lib/data/studio-templates.ts` | `server-only`. Lecturas y guardado de `studio_templates` |
| `src/lib/studio/sample-data.ts` | Escenarios de ejemplo (URLs, serializable) |
| `src/lib/studio/sample-data.server.ts` | Los mismos escenarios con las fotos en `data:` |
| `src/lib/studio/finish-free-image.ts` | Lo que "Mi Imagen" usaba del compositor |
| `src/app/(dashboard)/studio/plantillas/page.tsx` | Página servidor del editor |
| `src/app/(dashboard)/studio/plantillas/editor.tsx` | Cliente: código + vista previa |
| `src/app/(dashboard)/studio/plantillas/actions.ts` | Guardar plantilla |
| `src/lib/studio/templates/seed/<key>/{template.html,template.css,meta.json}` | Las doce plantillas como archivos, para sembrarlas |
| `scripts/seed-studio-templates.mjs` | Siembra/actualiza las filas desde esos archivos |
| `scripts/studio-render-smoke.mjs` | Comprobación manual de que Chrome renderiza |
| `supabase/migrations/103_studio_templates.sql` | Tabla + `studio_images.template_snapshot` |

**Se modifican:** `src/lib/studio/generate.ts`, `src/lib/studio/recipes.ts`, `src/lib/studio/palettes.ts`, `src/lib/data/studio.ts`, `src/app/(dashboard)/studio/{page.tsx,studio-tabs.tsx,recipe-form.tsx,template-picker.tsx}`, `next.config.ts`, `.env.example`, `package.json`.

**Se borran (Task 14):** los doce `src/lib/studio/templates/*.tsx`, `primitives.tsx`, `editorial-shell.tsx`, `registry.ts`, `render/satori.ts`, `compositor.ts`, `typeset.ts`, `scripts/gen-template-thumbs.mjs`, `public/studio/templates/*.webp`, la dependencia `satori`, y los tests que los cubrían.

**Orden:** primero el motor (Tasks 1–8), luego el editor (Task 9), que es la herramienta con la que se portan los diseños (Tasks 10–11); después se conmuta el consumo (12–13), se limpia (14) y se rehacen los cuatro diseños pendientes (15).

---

### Task 0: Branch

- [ ] **Step 1: Crear el branch**

```bash
git checkout -b feat/studio-editor-plantillas
```

---

### Task 1: El documento (`document.ts`)

Es el corazón: la misma función arma lo que ve el iframe del editor y lo que traga Chrome.

**Files:**
- Create: `src/lib/studio/templates/document.ts`
- Test: `tests/studio/document.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `interface TemplateDocumentInput { html: string; css: string; values: Record<string, string>; rawValues: Record<string, string>; vars: Record<string, string>; flags: string[]; fontFaceCss: string; width: number; height: number }`
  - `buildTemplateDocument(input: TemplateDocumentInput): string`
  - `resolveSections(html: string, present: Record<string, string>): string`
  - `interpolate(html: string, values: Record<string, string>, rawValues: Record<string, string>): string`
  - `escapeHtml(text: string): string`

> **Por que existe `rawValues`.** Los titulares de hoy alternan enfasis palabra a
> palabra (`Headline` en `primitives.tsx`): el agente escribe texto plano y el
> ritmo lo pone el diseno. El CSS no puede seleccionar palabras sueltas de una
> cadena, asi que ese fragmento tiene que llegar ya marcado. `rawValues` se
> inserta sin escapar y **lo produce solo nuestro codigo** (`values.ts`, Task 4),
> que escapa cada palabra antes de envolverla. Un dato del formulario nunca entra
> por ahi. Se escribe `{{&headlineRitmo}}` para distinguirlo a simple vista.

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/studio/document.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  buildTemplateDocument, resolveSections, interpolate, escapeHtml,
} from '@/lib/studio/templates/document'

const base = {
  css: '.x{color:red}', rawValues: {}, vars: {}, flags: [], fontFaceCss: '', width: 1080, height: 1350,
}

describe('resolveSections', () => {
  it('conserva el bloque cuando el dato existe', () => {
    expect(resolveSections('<p>{{#price}}vale {{price}}{{/price}}</p>', { price: '$10' }))
      .toBe('<p>vale {{price}}</p>')
  })

  it('borra el bloque entero cuando el dato falta', () => {
    expect(resolveSections('<p>{{#price}}vale {{price}}{{/price}}</p>', {}))
      .toBe('<p></p>')
  })

  it('trata la cadena vacía como dato ausente', () => {
    expect(resolveSections('{{#cta}}x{{/cta}}', { cta: '' })).toBe('')
  })

  it('resuelve varias secciones distintas de forma independiente', () => {
    const html = '{{#a}}A{{/a}}|{{#b}}B{{/b}}'
    expect(resolveSections(html, { a: '1' })).toBe('A|')
  })

  it('resuelve todas las apariciones de la misma seccion', () => {
    expect(resolveSections('{{#a}}1{{/a}}{{#a}}2{{/a}}', {})).toBe('')
  })

  it('un fragmento raw tambien cuenta como dato presente', () => {
    expect(resolveSections('{{#ritmo}}<h1>{{&ritmo}}</h1>{{/ritmo}}', { ritmo: '<span>x</span>' }))
      .toBe('<h1>{{&ritmo}}</h1>')
  })
})

describe('interpolate', () => {
  it('sustituye el valor', () => {
    expect(interpolate('<h1>{{headline}}</h1>', { headline: 'Casa' }, {})).toBe('<h1>Casa</h1>')
  })

  it('deja vacio el hueco sin dato en vez de imprimir la llave', () => {
    expect(interpolate('<h1>{{headline}}</h1>', {}, {})).toBe('<h1></h1>')
  })

  it('escapa el HTML del dato', () => {
    expect(interpolate('<p>{{address}}</p>', { address: 'A & B <script>' }, {}))
      .toBe('<p>A &amp; B &lt;script&gt;</p>')
  })

  it('no rompe un data URI', () => {
    const uri = 'data:image/jpeg;base64,AAAA'
    expect(interpolate('<img src="{{hero}}">', { hero: uri }, {})).toBe(`<img src="${uri}">`)
  })

  it('inserta un fragmento raw sin escaparlo', () => {
    expect(interpolate('<h1>{{&ritmo}}</h1>', {}, { ritmo: '<span>Casa</span>' }))
      .toBe('<h1><span>Casa</span></h1>')
  })

  it('un raw ausente no imprime la llave', () => {
    expect(interpolate('<h1>{{&ritmo}}</h1>', {}, {})).toBe('<h1></h1>')
  })
})

describe('escapeHtml', () => {
  it('escapa los cinco caracteres peligrosos', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })
})

describe('buildTemplateDocument', () => {
  it('pone las clases de estado en el html', () => {
    const doc = buildTemplateDocument({ ...base, html: '<i></i>', values: {}, flags: ['sin-precio', 'fotos-2'] })
    expect(doc).toContain('<html class="sin-precio fotos-2">')
  })

  it('declara las variables de color en :root', () => {
    const doc = buildTemplateDocument({ ...base, html: '', values: {}, vars: { brand: '#1B2A41' } })
    expect(doc).toContain('--brand:#1B2A41')
  })

  it('declara el tamano del lienzo', () => {
    const doc = buildTemplateDocument({ ...base, html: '', values: {} })
    expect(doc).toContain('--w:1080px')
    expect(doc).toContain('--h:1350px')
  })

  it('mete el css del autor DESPUES del reset para que pueda pisarlo', () => {
    const doc = buildTemplateDocument({ ...base, html: '', values: {}, css: '.mio{color:blue}' })
    expect(doc.indexOf('box-sizing')).toBeLessThan(doc.indexOf('.mio{color:blue}'))
  })

  it('mete las fuentes antes que todo lo demas', () => {
    const doc = buildTemplateDocument({ ...base, html: '', values: {}, fontFaceCss: '@font-face{font-family:X}' })
    expect(doc.indexOf('@font-face')).toBeLessThan(doc.indexOf('box-sizing'))
  })

  it('resuelve secciones ANTES de sustituir, no al reves', () => {
    // Si sustituyera primero, {{#price}} quedaria intacto y el bloque saldria.
    const doc = buildTemplateDocument({ ...base, html: '{{#price}}<b>{{price}}</b>{{/price}}', values: {} })
    expect(doc).not.toContain('<b>')
  })

  it('inserta los fragmentos raw en el cuerpo', () => {
    const doc = buildTemplateDocument({
      ...base, html: '<h1>{{&ritmo}}</h1>', values: {}, rawValues: { ritmo: '<em>Casa</em>' },
    })
    expect(doc).toContain('<h1><em>Casa</em></h1>')
  })

  it('emite un documento completo', () => {
    const doc = buildTemplateDocument({ ...base, html: '<main>x</main>', values: {} })
    expect(doc.startsWith('<!doctype html>')).toBe(true)
    expect(doc).toContain('<body><main>x</main></body>')
  })
})
```

- [ ] **Step 2: Correr el test y verlo fallar**

```bash
npx vitest run tests/studio/document.test.ts
```

Esperado: FAIL, "Failed to resolve import '@/lib/studio/templates/document'".

- [ ] **Step 3: Implementar**

Crea `src/lib/studio/templates/document.ts`:

```ts
// El documento que Chrome renderiza y que el iframe del editor enseña. Es la
// MISMA cadena en los dos sitios: ahí vive la promesa de "lo que se ve es lo
// que sale" — no en que ambos sean Chrome, sino en que no hay dos caminos.
//
// Puro a propósito: sin `server-only`, sin imports de Node. El cliente lo usa.

export interface TemplateDocumentInput {
  /** El HTML del autor, con {{claves}} y {{#secciones}}. */
  html: string
  /** El CSS del autor. Va después del reset para poder pisarlo. */
  css: string
  /** Solo las claves CON dato: una clave ausente y una vacía son lo mismo. */
  values: Record<string, string>
  /**
   * Fragmentos de HTML que se insertan SIN escapar, con `{{&clave}}`.
   *
   * Los produce values.ts, nunca el formulario: el titular con énfasis alterno
   * necesita llegar ya marcado porque el CSS no puede seleccionar palabras
   * sueltas de una cadena. Cada palabra se escapa antes de envolverse.
   */
  rawValues: Record<string, string>
  /** Custom properties de :root — los colores de la paleta de la pieza. */
  vars: Record<string, string>
  /** Clases de estado del <html>: sin-precio, fotos-2, datos-4… */
  flags: string[]
  /** Las @font-face ya resueltas. Cadena vacía si no hace falta ninguna. */
  fontFaceCss: string
  width: number
  height: number
}

const RESET = `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{width:var(--w);height:var(--h)}
body{overflow:hidden;-webkit-font-smoothing:antialiased}
img{display:block}`

const ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, c => ESCAPES[c])
}

/**
 * Quita los bloques cuyo dato no existe.
 *
 * Sustituye a `{p.price && <bloque/>}` del TSX. Las secciones NO anidan: una
 * dentro de otra no está soportada y no hace falta — para reaccionar a
 * combinaciones de datos están las clases de estado.
 */
export function resolveSections(html: string, present: Record<string, string>): string {
  return html.replace(
    /\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_match, key: string, body: string) => (present[key] ? body : ''),
  )
}

/**
 * Sustituye `{{clave}}` escapando, y `{{&clave}}` sin escapar.
 *
 * Sin dato deja el hueco vacío, nunca la llave a la vista: una plantilla a la
 * que le falte un dato tiene que verse incompleta, no rota.
 */
export function interpolate(
  html: string, values: Record<string, string>, rawValues: Record<string, string>,
): string {
  return html
    .replace(/\{\{&([\w.]+)\}\}/g, (_match, key: string) => rawValues[key] ?? '')
    .replace(/\{\{([\w.]+)\}\}/g, (_match, key: string) => escapeHtml(values[key] ?? ''))
}

export function buildTemplateDocument(input: TemplateDocumentInput): string {
  // El orden importa: primero desaparecen los bloques sin dato, y solo después
  // se sustituye lo que quedó. Al revés, un {{#price}} ya sustituido no se
  // reconocería como sección y el bloque saldría vacío en vez de no salir.
  // Las secciones miran los dos mapas: `{{#headlineRitmo}}` tiene que funcionar
  // igual que `{{#price}}` aunque su contenido sea un fragmento.
  const present = { ...input.values, ...input.rawValues }
  const body = interpolate(resolveSections(input.html, present), input.values, input.rawValues)

  const vars = [
    ...Object.entries(input.vars).map(([name, value]) => `--${name}:${value}`),
    `--w:${input.width}px`,
    `--h:${input.height}px`,
  ].join(';')

  return `<!doctype html><html class="${input.flags.join(' ')}"><head><meta charset="utf-8">`
    + `<style>${input.fontFaceCss}\n:root{${vars}}\n${RESET}\n${input.css}</style>`
    + `</head><body>${body}</body></html>`
}
```

- [ ] **Step 4: Correr el test y verlo pasar**

```bash
npx vitest run tests/studio/document.test.ts
```

Esperado: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/studio/templates/document.ts tests/studio/document.test.ts
git commit -m "feat(studio): documento de plantilla como funcion pura"
```

---

### Task 2: Inferencia de slots (`slots.ts`)

El aviso de encaje sigue existiendo, pero nadie declara nada dos veces: se lee del propio HTML.

**Files:**
- Create: `src/lib/studio/templates/slots.ts`
- Test: `tests/studio/slots.test.ts`

**Interfaces:**
- Consumes: `SlotKey` de `src/lib/studio/templates/types.ts` (ya existe).
- Produces: `inferSlots(html: string): { required: SlotKey[]; optional: SlotKey[]; idealPhotos: number }`

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/studio/slots.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { inferSlots } from '@/lib/studio/templates/slots'

describe('inferSlots', () => {
  it('una clave suelta es requerida', () => {
    const r = inferSlots('<img src="{{hero}}"><h1>{{headline}}</h1>')
    expect(r.required).toContain('photo.hero')
    expect(r.required).toContain('text.headline')
    expect(r.optional).toEqual([])
  })

  it('una clave envuelta en seccion es opcional', () => {
    const r = inferSlots('{{#price}}<b>{{price}}</b>{{/price}}')
    expect(r.optional).toContain('text.price')
    expect(r.required).not.toContain('text.price')
  })

  it('si aparece suelta Y en seccion, manda requerida', () => {
    const r = inferSlots('<i>{{price}}</i>{{#price}}<b>{{price}}</b>{{/price}}')
    expect(r.required).toContain('text.price')
    expect(r.optional).not.toContain('text.price')
  })

  it('cuenta el hero mas las miniaturas para idealPhotos', () => {
    const r = inferSlots('{{hero}}{{#thumb1}}{{thumb1}}{{/thumb1}}{{#thumb2}}{{thumb2}}{{/thumb2}}')
    expect(r.idealPhotos).toBe(3)
  })

  it('sin hero no pide fotos', () => {
    const r = inferSlots('<h1>{{headline}}</h1>')
    expect(r.idealPhotos).toBe(0)
  })

  it('las miniaturas colapsan en un solo slot', () => {
    const r = inferSlots('{{#thumb1}}{{thumb1}}{{/thumb1}}{{#thumb2}}{{thumb2}}{{/thumb2}}')
    expect(r.optional.filter(s => s === 'photo.thumbs')).toHaveLength(1)
  })

  it('las specs colapsan en el slot stats', () => {
    const r = inferSlots('{{#stat1}}{{stat1}}{{/stat1}}{{#stat3}}{{stat3}}{{/stat3}}')
    expect(r.optional).toContain('stats')
  })

  it('whenDay y whenTime cuentan como el slot when', () => {
    const r = inferSlots('<p>{{whenDay}}</p><p>{{whenTime}}</p>')
    expect(r.required).toContain('text.when')
  })

  it('un fragmento raw cuenta como su slot', () => {
    const r = inferSlots('<h1>{{&headlineRitmo}}</h1>')
    expect(r.required).toContain('text.headline')
  })

  it('ignora las claves que no son slots', () => {
    const r = inferSlots('<p>{{badge}} {{agentName}}</p>')
    expect(r.required).toEqual([])
    expect(r.optional).toEqual([])
  })
})
```

- [ ] **Step 2: Correr el test y verlo fallar**

```bash
npx vitest run tests/studio/slots.test.ts
```

Esperado: FAIL, no existe el módulo.

- [ ] **Step 3: Implementar**

Crea `src/lib/studio/templates/slots.ts`:

```ts
import type { SlotKey } from './types'

// De qué necesita un diseño no se declara: se lee de lo que usa. Declararlo
// aparte crearía una segunda fuente de verdad capaz de contradecir al HTML, y
// el aviso de encaje —que se da ANTES de renderizar— dejaría de ser cierto.
//
// La regla es la del contrato: `{{clave}}` suelta significa que el diseño la
// necesita; `{{#clave}}` significa que el autor ya previó su ausencia.

const SLOT_OF: Record<string, SlotKey> = {
  hero:       'photo.hero',
  thumb1:     'photo.thumbs',
  thumb2:     'photo.thumbs',
  thumb3:     'photo.thumbs',
  agentPhoto: 'photo.agent',
  headline:      'text.headline',
  headlineRitmo: 'text.headline',
  price:      'text.price',
  when:       'text.when',
  whenDay:    'text.when',
  whenTime:   'text.when',
  address:    'text.address',
  phone:      'text.phone',
  cta:        'text.cta',
  stat1:      'stats',
  stat2:      'stats',
  stat3:      'stats',
  logo:       'logo.tenant',
}

const THUMB_KEYS = ['thumb1', 'thumb2', 'thumb3']

function keysInSections(html: string): Set<string> {
  const out = new Set<string>()
  for (const match of html.matchAll(/\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g)) {
    out.add(match[1])
    for (const inner of match[2].matchAll(/\{\{&?([\w.]+)\}\}/g)) out.add(inner[1])
  }
  return out
}

export function inferSlots(html: string): { required: SlotKey[]; optional: SlotKey[]; idealPhotos: number } {
  const optionalKeys = keysInSections(html)
  // El `&?` reconoce los fragmentos: `{{&headlineRitmo}}` es el titular igual
  // que `{{headline}}`, y sin esto un diseño que solo use el ritmo no declararía
  // el slot del titular.
  const allKeys = new Set([...html.matchAll(/\{\{[#&/]?([\w.]+)\}\}/g)].map(m => m[1]))

  const required = new Set<SlotKey>()
  const optional = new Set<SlotKey>()
  for (const key of allKeys) {
    const slot = SLOT_OF[key]
    if (!slot) continue
    if (optionalKeys.has(key)) optional.add(slot)
    else required.add(slot)
  }
  // Un slot requerido por una clave y opcional por otra es requerido: basta que
  // el diseño lo use suelto una vez para que su ausencia deje un hueco.
  for (const slot of required) optional.delete(slot)

  const usesHero = allKeys.has('hero')
  const thumbs = THUMB_KEYS.filter(k => allKeys.has(k)).length
  const idealPhotos = usesHero ? 1 + thumbs : 0

  return { required: [...required], optional: [...optional], idealPhotos }
}
```

- [ ] **Step 4: Correr el test y verlo pasar**

```bash
npx vitest run tests/studio/slots.test.ts
```

Esperado: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/studio/templates/slots.ts tests/studio/slots.test.ts
git commit -m "feat(studio): infiere los slots de una plantilla desde su html"
```

---

### Task 3: Metadatos serializables (`meta.ts`)

Hoy `templateFit` vive en `registry.ts` y el cliente lo importa — junto con las doce funciones `render`. Cuando las plantillas sean filas, al cliente tiene que viajar solo el dato.

**Files:**
- Create: `src/lib/studio/templates/meta.ts`
- Modify: `tests/studio/template-fit.test.ts`
- Modify: `src/app/(dashboard)/studio/template-picker.tsx:5` (el import)

**Interfaces:**
- Consumes: `SlotKey`, `FitReport` de `templates/types.ts`; `StudioRecipe`, `Aspect` de `studio/types.ts`.
- Produces:
  - `interface TemplateMeta { key: string; label: string; hint: string; recipes: StudioRecipe[]; aspects: Aspect[]; slots: { required: SlotKey[]; optional: SlotKey[] }; idealPhotos: number; thumbUrl: string | null }`
  - `templateFit(template: Pick<TemplateMeta, 'slots' | 'idealPhotos'>, data: { photoCount: number; hasAgentPhoto: boolean }): FitReport`
  - `templatesForRecipeIn(metas: TemplateMeta[], recipe: StudioRecipe): TemplateMeta[]`
  - `findTemplateIn(metas: TemplateMeta[], key: string): TemplateMeta | null`

- [ ] **Step 1: Escribir el test que falla**

Añade al final de `tests/studio/template-fit.test.ts`:

```ts
import { templateFit as fitMeta, templatesForRecipeIn, findTemplateIn, type TemplateMeta } from '@/lib/studio/templates/meta'

const meta = (over: Partial<TemplateMeta> = {}): TemplateMeta => ({
  key: 'x', label: 'X', hint: '', recipes: ['new_listing'], aspects: ['4:5'],
  slots: { required: ['photo.hero'], optional: ['photo.agent'] }, idealPhotos: 4, thumbUrl: null,
  ...over,
})

describe('templateFit sobre metadatos', () => {
  it('no es usable sin fotos cuando el diseno exige hero', () => {
    expect(fitMeta(meta(), { photoCount: 0, hasAgentPhoto: true }).usable).toBe(false)
  })

  it('es usable sin fotos cuando el diseno no exige hero', () => {
    const sinHero = meta({ slots: { required: [], optional: [] }, idealPhotos: 0 })
    expect(fitMeta(sinHero, { photoCount: 0, hasAgentPhoto: false }).usable).toBe(true)
  })

  it('avisa de cuantas fotos faltan sin bloquear', () => {
    const r = fitMeta(meta(), { photoCount: 2, hasAgentPhoto: true })
    expect(r.usable).toBe(true)
    expect(r.warnings[0]).toBe('Mejor con 4 fotos, tienes 2')
  })

  it('avisa del hueco del agente solo si el diseno lo admite', () => {
    expect(fitMeta(meta(), { photoCount: 4, hasAgentPhoto: false }).warnings)
      .toContain('Sin portada del agente, ese espacio queda vacio')
  })
})

describe('busquedas sobre la lista', () => {
  const lista = [meta({ key: 'a' }), meta({ key: 'b', recipes: ['sold'] })]

  it('filtra por receta', () => {
    expect(templatesForRecipeIn(lista, 'sold').map(t => t.key)).toEqual(['b'])
  })

  it('devuelve null para una clave inventada', () => {
    expect(findTemplateIn(lista, 'no-existe')).toBeNull()
  })
})
```

**Ojo con el acento:** el aviso del agente en `registry.ts` dice `'Sin portada del agente, ese espacio queda vacío'` (con tilde). Copia el literal EXACTO del archivo actual al implementar y ajusta el test si difiere; el test de arriba usa la versión sin tilde solo para que no dependa de la codificación de este documento.

- [ ] **Step 2: Correr el test y verlo fallar**

```bash
npx vitest run tests/studio/template-fit.test.ts
```

Esperado: FAIL, no existe `@/lib/studio/templates/meta`.

- [ ] **Step 3: Implementar**

Crea `src/lib/studio/templates/meta.ts`:

```ts
import type { StudioRecipe, Aspect } from '../types'
import type { FitReport, SlotKey } from './types'

// Lo que una plantilla es PARA EL CLIENTE: dato serializable, sin función de
// render. Las páginas de servidor lo cargan de la base y lo pasan por props,
// igual que ya hacen con propiedades y agentes.

export interface TemplateMeta {
  key:         string
  label:       string
  hint:        string
  recipes:     StudioRecipe[]
  aspects:     Aspect[]
  slots:       { required: SlotKey[]; optional: SlotKey[] }
  idealPhotos: number
  /** URL pública de la miniatura, o null mientras no se haya generado. */
  thumbUrl:    string | null
}

/**
 * Cruza lo que el diseño necesita con lo que el agente tiene.
 *
 * `usable: false` SOLO cuando falta algo sin lo cual el diseño no existe (una
 * foto para el hero). Todo lo demás es aviso: si quiere el mosaico con dos
 * fotos, es su decisión — lo que no puede es enterarse al ver el resultado.
 */
export function templateFit(
  template: Pick<TemplateMeta, 'slots' | 'idealPhotos'>,
  data: { photoCount: number; hasAgentPhoto: boolean },
): FitReport {
  const warnings: string[] = []
  const needsHero = template.slots.required.includes('photo.hero')

  if (data.photoCount < template.idealPhotos) {
    warnings.push(`Mejor con ${template.idealPhotos} fotos, tienes ${data.photoCount}`)
  }
  if (template.slots.optional.includes('photo.agent') && !data.hasAgentPhoto) {
    warnings.push('Sin portada del agente, ese espacio queda vacío')
  }

  return { usable: !needsHero || data.photoCount > 0, warnings }
}

export function templatesForRecipeIn(metas: TemplateMeta[], recipe: StudioRecipe): TemplateMeta[] {
  return metas.filter(t => t.recipes.includes(recipe))
}

export function findTemplateIn(metas: TemplateMeta[], key: string): TemplateMeta | null {
  return metas.find(t => t.key === key) ?? null
}
```

- [ ] **Step 4: Correr el test y verlo pasar**

```bash
npx vitest run tests/studio/template-fit.test.ts
```

Esperado: PASS (los tests viejos del registry siguen pasando; los nuevos también).

- [ ] **Step 5: Apuntar el picker al módulo nuevo**

En `src/app/(dashboard)/studio/template-picker.tsx`, cambia el import de la línea 5 y el tipo de la prop:

```tsx
import { templateFit, type TemplateMeta } from '@/lib/studio/templates/meta'
```

y en las props, `templates: StudioTemplate[]` pasa a `templates: TemplateMeta[]`. Borra el import de `StudioTemplate`. El resto del componente no cambia todavía (la miniatura sigue leyendo `/studio/templates/<key>.webp`; se conmuta en la Task 12).

- [ ] **Step 6: Verificar**

```bash
npx tsc --noEmit
```

Esperado: sin errores. Si `recipe-form.tsx` se queja, es porque `templatesForRecipe` devuelve `StudioTemplate[]`: añade `as unknown as TemplateMeta[]` **no** — en su lugar deja `template-picker` recibiendo `TemplateMeta[]` y en `recipe-form.tsx` mapea lo que hoy pasa:

```tsx
templates={templates.map(t => ({
  key: t.key, label: t.label, hint: t.hint, recipes: t.recipes, aspects: t.aspects,
  slots: t.slots, idealPhotos: t.idealPhotos, thumbUrl: null,
}))}
```

Es un puente que la Task 12 borra.

- [ ] **Step 7: Commit**

```bash
git add src/lib/studio/templates/meta.ts tests/studio/template-fit.test.ts "src/app/(dashboard)/studio/template-picker.tsx" "src/app/(dashboard)/studio/recipe-form.tsx"
git commit -m "refactor(studio): metadatos de plantilla serializables"
```

---

### Task 4: Valores, clases de estado y variables de color (`values.ts`)

**Files:**
- Create: `src/lib/studio/templates/values.ts`
- Modify: `src/lib/studio/palettes.ts` (mover `textColors` desde `primitives.tsx`)
- Test: `tests/studio/values.test.ts`

**Interfaces:**
- Consumes: `TemplateProps`, `Stat` de `templates/types.ts`; `StudioPalette`, `darken`, `readableOn` de `../palettes`.
- Produces:
  - `templateValues(props: TemplateProps): Record<string, string>`
  - `templateRawValues(props: TemplateProps): Record<string, string>`
  - `templateFlags(props: TemplateProps): string[]`
  - `paletteVars(palette: StudioPalette): Record<string, string>`
  - y en `palettes.ts`: `textColors(palette: StudioPalette): { onBrand: string; onDark: string; onPhoto: string }`

- [ ] **Step 1: Mover `textColors` a `palettes.ts`**

Copia la función `textColors` completa —con su comentario— desde `src/lib/studio/templates/primitives.tsx` al final de `src/lib/studio/palettes.ts`, y en `primitives.tsx` sustitúyela por un re-export para que los TSX sigan compilando hasta que se borren:

```tsx
export { textColors } from '../palettes'
```

- [ ] **Step 2: Escribir el test que falla**

Crea `tests/studio/values.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { templateValues, templateRawValues, templateFlags, paletteVars } from '@/lib/studio/templates/values'
import { DEFAULT_PALETTE } from '@/lib/studio/palettes'
import type { TemplateProps } from '@/lib/studio/templates/types'

const props = (over: Partial<TemplateProps> = {}): TemplateProps => ({
  heroPhoto: 'data:image/jpeg;base64,AAA', thumbPhotos: [], agentPhoto: null, logo: null,
  headline: 'Casa elegante', price: null, when: null, address: null, phone: null, cta: null,
  badge: 'NUEVA DISPONIBLE', stats: [], agentName: null, palette: DEFAULT_PALETTE,
  ...over,
})

describe('templateValues', () => {
  it('omite las claves sin dato en vez de ponerlas vacias', () => {
    const v = templateValues(props())
    expect(v.price).toBeUndefined()
    expect('price' in v).toBe(false)
  })

  it('numera las miniaturas desde 1 y corta en 3', () => {
    const v = templateValues(props({ thumbPhotos: ['a', 'b', 'c', 'd'] }))
    expect(v.thumb1).toBe('a')
    expect(v.thumb3).toBe('c')
    expect(v.thumb4).toBeUndefined()
  })

  it('numera las specs', () => {
    const v = templateValues(props({ stats: [{ icon: 'bed', value: '3 hab' }] }))
    expect(v.stat1).toBe('3 hab')
  })

  it('parte la fecha en dia y hora', () => {
    const v = templateValues(props({ when: '15 de agosto de 2026 · 11:00–14:00' }))
    expect(v.whenDay).toBe('15 de agosto de 2026')
    expect(v.whenTime).toBe('11:00–14:00')
    expect(v.when).toBe('15 de agosto de 2026 · 11:00–14:00')
  })

  it('no inventa hora cuando la fecha no la trae', () => {
    const v = templateValues(props({ when: '15 de agosto de 2026' }))
    expect(v.whenTime).toBeUndefined()
  })
})

describe('templateRawValues', () => {
  it('alterna el enfasis palabra a palabra', () => {
    const r = templateRawValues(props({ headline: 'Casa elegante y familiar' }))
    expect(r.headlineRitmo).toBe(
      '<span class="palabra">Casa</span> <span class="palabra-fuerte">elegante</span> '
      + '<span class="palabra">y</span> <span class="palabra-fuerte">familiar</span>',
    )
  })

  it('escapa cada palabra', () => {
    expect(templateRawValues(props({ headline: 'Ana & Luis' })).headlineRitmo).toContain('&amp;')
  })

  it('no emite nada sin titular', () => {
    expect(templateRawValues(props({ headline: '' })).headlineRitmo).toBeUndefined()
  })
})

describe('templateFlags', () => {
  it('marca lo que falta', () => {
    const f = templateFlags(props())
    expect(f).toContain('sin-precio')
    expect(f).toContain('sin-agente')
    expect(f).toContain('sin-logo')
    expect(f).not.toContain('sin-hero')
  })

  it('cuenta las fotos incluyendo el hero', () => {
    expect(templateFlags(props({ thumbPhotos: ['a', 'b'] }))).toContain('fotos-3')
  })

  it('cuenta cero fotos sin hero', () => {
    expect(templateFlags(props({ heroPhoto: null }))).toContain('fotos-0')
  })

  it('cuenta los bloques de texto para que el diseno se recoloque', () => {
    // badge + headline = 2
    expect(templateFlags(props())).toContain('datos-2')
    // badge + headline + price + address = 4
    expect(templateFlags(props({ price: '$1', address: 'Calle 1' }))).toContain('datos-4')
  })
})

describe('paletteVars', () => {
  it('expone los roles y los derivados', () => {
    const v = paletteVars(DEFAULT_PALETTE)
    expect(v.brand).toBe(DEFAULT_PALETTE.brand)
    expect(v['brand-dark']).toBeTypeOf('string')
    expect(v['on-brand']).toBeTypeOf('string')
    expect(v['on-photo']).toBeTypeOf('string')
  })
})
```

- [ ] **Step 3: Correr el test y verlo fallar**

```bash
npx vitest run tests/studio/values.test.ts
```

Esperado: FAIL, no existe el módulo.

- [ ] **Step 4: Implementar**

Crea `src/lib/studio/templates/values.ts`:

```ts
import { darken, textColors, type StudioPalette } from '../palettes'
import { escapeHtml } from './document'
import type { TemplateProps } from './types'

// De los datos de la pieza a lo que la plantilla puede escribir. Tres salidas
// separadas porque son tres mecanismos distintos del contrato: los valores se
// sustituyen, las clases recolocan y las variables tiñen.

/**
 * Solo las claves CON dato.
 *
 * Que una clave ausente no exista en el mapa es lo que hace que
 * `{{#price}}…{{/price}}` funcione: la sección mira presencia, y una cadena
 * vacía significaría "hay precio" cuando no lo hay.
 */
export function templateValues(p: TemplateProps): Record<string, string> {
  const v: Record<string, string> = {}
  const put = (key: string, value: string | null | undefined) => {
    if (value) v[key] = value
  }

  put('hero', p.heroPhoto)
  p.thumbPhotos.slice(0, 3).forEach((src, i) => put(`thumb${i + 1}`, src))
  put('agentPhoto', p.agentPhoto)
  put('logo', p.logo)

  put('badge', p.badge)
  put('headline', p.headline)
  put('price', p.price)
  put('address', p.address)
  put('phone', p.phone)
  put('cta', p.cta)
  put('agentName', p.agentName)

  // La fecha entera y sus dos mitades. Un cartel se lee mejor con el día en una
  // línea y la hora en la siguiente, y el diseño decide cuál de las tres usa.
  put('when', p.when)
  if (p.when) {
    const [day, time] = p.when.split(' · ')
    put('whenDay', day)
    put('whenTime', time)
  }

  p.stats.slice(0, 3).forEach((s, i) => put(`stat${i + 1}`, s.value))
  return v
}

/**
 * Las clases del <html>. Sustituyen a `photoHeight(blocks)`: con ellas el CSS
 * puede reaccionar a CUÁNTO hay, no solo a qué falta.
 */
export function templateFlags(p: TemplateProps): string[] {
  const flags: string[] = []
  const missing = (value: unknown, name: string) => {
    if (!value) flags.push(name)
  }

  missing(p.heroPhoto, 'sin-hero')
  missing(p.agentPhoto, 'sin-foto-agente')
  missing(p.logo, 'sin-logo')
  missing(p.price, 'sin-precio')
  missing(p.when, 'sin-cuando')
  missing(p.address, 'sin-direccion')
  missing(p.phone, 'sin-telefono')
  missing(p.cta, 'sin-cta')
  missing(p.agentName, 'sin-agente')
  missing(p.stats.length, 'sin-specs')

  flags.push(`fotos-${(p.heroPhoto ? 1 : 0) + p.thumbPhotos.length}`)
  // Cuántos bloques de texto hay que leer. Es la cuenta que hacía el editorial
  // para decidir cuánto lienzo se llevaba la foto.
  const bloques = [
    p.badge, p.headline, p.price ?? p.when, p.address,
    p.stats.length ? 'stats' : null, p.cta,
  ].filter(Boolean).length
  flags.push(`datos-${bloques}`)

  return flags
}

/**
 * Fragmentos ya marcados, que entran SIN escapar con `{{&clave}}`.
 *
 * Hoy solo el titular con énfasis alterno. El agente escribe texto plano —
 * pedirle que marque negritas sería pedirle que maquete— y el ritmo lo decide el
 * diseño: destaca una palabra de cada dos. El CSS no puede hacerlo sobre una
 * cadena, así que el marcado tiene que llegar hecho.
 *
 * Cada palabra se escapa AQUÍ: lo que sale de esta función se inserta tal cual,
 * así que el escape es responsabilidad suya y de nadie más. Nunca metas por aquí
 * un dato del formulario sin pasarlo por `escapeHtml`.
 */
export function templateRawValues(p: TemplateProps): Record<string, string> {
  const raw: Record<string, string> = {}
  if (p.headline) {
    raw.headlineRitmo = p.headline
      .split(' ')
      .filter(Boolean)
      .map((palabra, i) =>
        `<span class="${i % 2 === 0 ? 'palabra' : 'palabra-fuerte'}">${escapeHtml(palabra)}</span>`)
      .join(' ')
  }
  return raw
}

/** Los colores de la pieza, como custom properties: `color: var(--on-brand)`. */
export function paletteVars(palette: StudioPalette): Record<string, string> {
  const { onBrand, onDark, onPhoto } = textColors(palette)
  return {
    'brand':      palette.brand,
    'brand-dark': darken(palette.brand),
    'ink':        palette.ink,
    'surface':    palette.surface,
    'logo':       palette.logo,
    'on-brand':   onBrand,
    'on-dark':    onDark,
    'on-photo':   onPhoto,
  }
}
```

- [ ] **Step 5: Correr los tests y verlos pasar**

```bash
npx vitest run tests/studio/values.test.ts tests/studio/palettes.test.ts
```

Esperado: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/studio/templates/values.ts src/lib/studio/palettes.ts src/lib/studio/templates/primitives.tsx tests/studio/values.test.ts
git commit -m "feat(studio): valores, clases de estado y variables de color de una plantilla"
```

---

### Task 5: Catálogo de fuentes

Con la red cerrada en el render, la fuente viaja dentro del documento. En la vista previa viaja por URL: los mismos bytes, el mismo nombre de familia, las mismas métricas.

**Files:**
- Create: `src/lib/studio/fonts/catalog.ts`
- Create: `public/studio/fonts/` (copiar ahí los `.ttf`)
- Test: `tests/studio/fonts-catalog.test.ts`
- Modify: `next.config.ts`

**Interfaces:**
- Produces:
  - `interface StudioFont { family: string; weight: number; style: 'normal' | 'italic'; file: string }`
  - `FONT_CATALOG: StudioFont[]`
  - `FONT_FAMILIES: string[]` (familias únicas, en orden de catálogo)
  - `fontFaceCssFromUrls(): string` — para el iframe del editor
  - `fontFaceCssFromData(read: (file: string) => Buffer): string` — para el render

- [ ] **Step 1: Copiar las fuentes a `public/`**

```bash
mkdir -p public/studio/fonts && cp src/lib/carousels/fonts/*.ttf public/studio/fonts/
```

Deja los originales donde están: los sigue usando el motor de carruseles.

- [ ] **Step 2: Escribir el test que falla**

Crea `tests/studio/fonts-catalog.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { FONT_CATALOG, FONT_FAMILIES, fontFaceCssFromUrls, fontFaceCssFromData } from '@/lib/studio/fonts/catalog'

describe('catalogo de fuentes', () => {
  it('todos los archivos declarados existen en public/studio/fonts', () => {
    for (const f of FONT_CATALOG) {
      expect(existsSync(join(process.cwd(), 'public', 'studio', 'fonts', f.file)), f.file).toBe(true)
    }
  })

  it('las familias no se repiten', () => {
    expect(new Set(FONT_FAMILIES).size).toBe(FONT_FAMILIES.length)
  })

  it('incluye las dos familias que ya usaba el Estudio', () => {
    expect(FONT_FAMILIES).toContain('Spectral')
    expect(FONT_FAMILIES).toContain('Marcellus')
  })

  it('la version por URL apunta a public', () => {
    const css = fontFaceCssFromUrls()
    expect(css).toContain('@font-face')
    expect(css).toContain('/studio/fonts/')
    expect(css).not.toContain('base64')
  })

  it('la version por data URI no sale a la red', () => {
    const css = fontFaceCssFromData(() => Buffer.from('abc'))
    expect(css).toContain('data:font/ttf;base64,')
    expect(css).not.toContain('/studio/fonts/')
  })

  it('declara familia, peso y estilo en cada cara', () => {
    const css = fontFaceCssFromData(() => Buffer.from('abc'))
    expect(css).toContain(`font-family:'${FONT_CATALOG[0].family}'`)
    expect(css).toContain(`font-weight:${FONT_CATALOG[0].weight}`)
    expect(css).toContain('font-style:normal')
  })
})
```

- [ ] **Step 3: Correr el test y verlo fallar**

```bash
npx vitest run tests/studio/fonts-catalog.test.ts
```

Esperado: FAIL, no existe el módulo.

- [ ] **Step 4: Implementar**

Crea `src/lib/studio/fonts/catalog.ts`:

```ts
// Las fuentes que una plantilla puede pedir por nombre.
//
// Los archivos viven en `public/studio/fonts/` y se usan de dos maneras con los
// MISMOS bytes: por URL en el iframe del editor y en `data:` dentro del
// documento que renderiza Chrome, que no tiene salida a la red. Mismo nombre de
// familia y mismas métricas en los dos sitios.
//
// Para añadir una familia: deja el .ttf en esa carpeta y añade su fila aquí.
// Solo licencias OFL o equivalentes — el archivo se distribuye con la app.

export interface StudioFont {
  family: string
  weight: number
  style:  'normal' | 'italic'
  file:   string
}

export const FONT_CATALOG: StudioFont[] = [
  { family: 'Spectral',  weight: 400, style: 'normal', file: 'Spectral-Regular.ttf' },
  { family: 'Spectral',  weight: 500, style: 'normal', file: 'Spectral-Medium.ttf' },
  { family: 'Spectral',  weight: 800, style: 'normal', file: 'Spectral-ExtraBold.ttf' },
  { family: 'Marcellus', weight: 400, style: 'normal', file: 'Marcellus-Regular.ttf' },
]

export const FONT_FAMILIES: string[] = [...new Set(FONT_CATALOG.map(f => f.family))]

function face(font: StudioFont, src: string): string {
  return `@font-face{font-family:'${font.family}';font-weight:${font.weight};`
    + `font-style:${font.style};font-display:block;src:url(${src}) format('truetype')}`
}

/** Para el iframe del editor: el navegador sí puede pedir la URL. */
export function fontFaceCssFromUrls(): string {
  return FONT_CATALOG.map(f => face(f, `/studio/fonts/${f.file}`)).join('')
}

/**
 * Para el render: los bytes van dentro del documento.
 *
 * Recibe el lector en vez de leer aquí para que este módulo siga siendo puro y
 * el test no necesite tocar el disco.
 */
export function fontFaceCssFromData(read: (file: string) => Buffer): string {
  return FONT_CATALOG
    .map(f => face(f, `data:font/ttf;base64,${read(f.file).toString('base64')}`))
    .join('')
}
```

- [ ] **Step 5: Correr el test y verlo pasar**

```bash
npx vitest run tests/studio/fonts-catalog.test.ts
```

Esperado: PASS, 6 tests.

- [ ] **Step 6: Ampliar el catálogo**

Descarga de Google Fonts (todas OFL) los `.ttf` de estas familias y déjalos en `public/studio/fonts/`, añadiendo una fila por archivo en `FONT_CATALOG`. Son las que faltan para poder diseñar carteles que no se parezcan entre sí:

| Familia | Papel | Archivos sugeridos |
|---|---|---|
| Inter | Grotesca de interfaz, para datos y pies | `Inter-Regular.ttf`, `Inter-SemiBold.ttf` |
| Archivo | Grotesca ancha, para titulares con peso | `Archivo-Bold.ttf`, `Archivo-Black.ttf` |
| Playfair Display | Serif de display con contraste alto | `PlayfairDisplay-Regular.ttf`, `PlayfairDisplay-Bold.ttf` |
| Fraunces | Serif moderna con carácter | `Fraunces-Regular.ttf`, `Fraunces-SemiBold.ttf` |
| Cormorant Garamond | Serif fina, para editorial | `CormorantGaramond-Light.ttf`, `CormorantGaramond-Medium.ttf` |
| DM Sans | Grotesca geométrica neutra | `DMSans-Regular.ttf`, `DMSans-Medium.ttf` |
| Bebas Neue | Condensada de cartel | `BebasNeue-Regular.ttf` |
| Libre Baskerville | Serif clásica legible | `LibreBaskerville-Regular.ttf` |

El test de Step 2 ya comprueba que cada archivo declarado existe: si escribes mal un nombre, falla ahí y no en un render mudo.

- [ ] **Step 7: Trazar las fuentes hacia la función de render**

En `next.config.ts`, dentro de `outputFileTracingIncludes`, añade la entrada de la ruta que se crea en la Task 6:

```ts
  outputFileTracingIncludes: {
    "/admin/carousels": ["./src/lib/carousels/fonts/**"],
    "/api/cron/carousel-render": ["./src/lib/carousels/fonts/**"],
    // El render del Estudio inyecta las fuentes como data URI: los .ttf tienen
    // que viajar en el bundle de ESTA función, y public/ no se traza solo.
    "/api/studio/render": ["./public/studio/fonts/**"],
  },
```

- [ ] **Step 8: Verificar y commitear**

```bash
npx vitest run tests/studio/fonts-catalog.test.ts && npx tsc --noEmit
```

```bash
git add src/lib/studio/fonts/catalog.ts public/studio/fonts tests/studio/fonts-catalog.test.ts next.config.ts
git commit -m "feat(studio): catalogo de fuentes para las plantillas"
```

---

### Task 6: Chrome y la ruta de render

**Files:**
- Create: `src/lib/studio/render/chrome.ts`
- Create: `src/app/api/studio/render/route.ts`
- Create: `src/lib/studio/render/client.ts`
- Create: `scripts/studio-render-smoke.mjs`
- Modify: `next.config.ts`, `.env.example`, `package.json`

**Interfaces:**
- Consumes: `buildTemplateDocument` (Task 1), `fontFaceCssFromData` (Task 5).
- Produces:
  - `renderDocumentToPng(document: string, opts: { width: number; height: number }): Promise<Buffer>` (chrome.ts)
  - `renderDocument(document: string, opts: { width: number; height: number }): Promise<Buffer>` (client.ts — hace el POST)
  - `studioFontFaceCss(): string` (chrome.ts — lee de `public/studio/fonts`)

- [ ] **Step 1: Instalar las dependencias**

```bash
npm install puppeteer-core @sparticuz/chromium
```

- [ ] **Step 2: Declarar las variables de entorno**

Añade al final de `.env.example`:

```
# ─── Estudio · render con Chrome ──────────────────────────────────────────────
# Secreto de /api/studio/render. La ruta la llama el propio servidor (generar,
# recomponer, miniatura), nunca el navegador. Generar con: openssl rand -hex 32
STUDIO_RENDER_SECRET=
# Solo en LOCAL: @sparticuz/chromium no arranca en Windows. Ruta al Chrome
# instalado, p. ej. C:\Program Files\Google\Chrome\Application\chrome.exe
# En Vercel se deja SIN definir para que use el binario empaquetado.
CHROME_EXECUTABLE_PATH=
# Base de la propia app, para el POST interno. En Vercel se deriva de VERCEL_URL.
# NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Añade `STUDIO_RENDER_SECRET` y `CHROME_EXECUTABLE_PATH` a tu `.env.local`.

- [ ] **Step 3: Implementar el motor**

Crea `src/lib/studio/render/chrome.ts`:

```ts
import 'server-only'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import puppeteer, { type Browser } from 'puppeteer-core'
import chromium from '@sparticuz/chromium'
import { fontFaceCssFromData } from '../fonts/catalog'

// Chrome sin interfaz: el mismo motor que enseña la vista previa del editor.
//
// Dos cierres, y el que importa es el segundo:
//   · JavaScript desactivado — la plantilla es declarativa y no lo necesita.
//   · SIN RED. Solo pasan data: y about:blank. Las fotos ya entran codificadas
//     y las fuentes van dentro del documento, así que la página no tiene nada
//     que pedir; dejar la puerta abierta sería regalar superficie a cambio de
//     nada.
//
// El navegador se reutiliza entre invocaciones: en Fluid Compute la misma
// instancia atiende varias peticiones y relanzar Chrome en cada una tira dos
// segundos a la basura.

let browserPromise: Promise<Browser> | null = null

function localExecutable(): string | undefined {
  return process.env.CHROME_EXECUTABLE_PATH || undefined
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const local = localExecutable()
      return puppeteer.launch({
        args: local ? [] : chromium.args,
        executablePath: local ?? (await chromium.executablePath()),
        headless: true,
      })
    })().catch(err => {
      // Sin esto, un fallo de arranque deja la promesa rechazada cacheada y
      // TODAS las peticiones siguientes fallan con el error de la primera.
      browserPromise = null
      throw err
    })
  }
  return browserPromise
}

/** Las @font-face con los bytes dentro. Lee de public/, que la ruta traza. */
export function studioFontFaceCss(): string {
  const dir = join(process.cwd(), 'public', 'studio', 'fonts')
  return fontFaceCssFromData(file => readFileSync(join(dir, file)))
}

export async function renderDocumentToPng(
  document: string,
  opts: { width: number; height: number },
): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setJavaScriptEnabled(false)
    await page.setRequestInterception(true)
    page.on('request', req => {
      const url = req.url()
      if (url.startsWith('data:') || url.startsWith('about:')) void req.continue()
      else void req.abort()
    })

    await page.setViewport({ width: opts.width, height: opts.height, deviceScaleFactor: 1 })
    await page.setContent(document, { waitUntil: 'load' })
    const shot = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: opts.width, height: opts.height },
    })
    return Buffer.from(shot)
  } finally {
    await page.close()
  }
}
```

- [ ] **Step 4: Implementar la ruta**

Crea `src/app/api/studio/render/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { renderDocumentToPng } from '@/lib/studio/render/chrome'

// El ÚNICO sitio del proyecto que importa Chromium. Vive aparte para que sus
// ~50 MB y su arranque en frío no viajen en el bundle de /studio ni en el del
// editor: quien solo entra a mirar la biblioteca no los paga.
//
// La llama el propio servidor (generar, recomponer, miniatura), nunca el
// navegador — por eso el guardia es un secreto compartido y no la sesión.

export const runtime = 'nodejs'
export const maxDuration = 60

const schema = z.object({
  document: z.string().min(1).max(20_000_000),
  width:    z.number().int().min(1).max(4000),
  height:   z.number().int().min(1).max(4000),
})

export async function POST(request: Request) {
  const secret = process.env.STUDIO_RENDER_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }

  try {
    const png = await renderDocumentToPng(parsed.data.document, {
      width: parsed.data.width, height: parsed.data.height,
    })
    return new NextResponse(new Uint8Array(png), {
      headers: { 'content-type': 'image/png', 'cache-control': 'no-store' },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Error desconocido'
    console.error(JSON.stringify({ service: 'studio', step: 'render', message }))
    return NextResponse.json({ error: `No se pudo renderizar: ${message}` }, { status: 500 })
  }
}
```

- [ ] **Step 5: Implementar el cliente**

Crea `src/lib/studio/render/client.ts`:

```ts
import 'server-only'

// El puente hacia /api/studio/render. Existe para que generate.ts NO importe
// Chromium: si lo importara, esos 50 MB acabarían en el bundle de /studio.
//
// La regla del proyecto contra el auto-POST (processSequenceRun) no aplica: allí
// el problema era una carrera de visibilidad de filas en la base. Esta ruta no
// lee nada — recibe HTML y devuelve bytes.

function baseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export async function renderDocument(
  document: string,
  opts: { width: number; height: number },
): Promise<Buffer> {
  const secret = process.env.STUDIO_RENDER_SECRET
  if (!secret) throw new Error('Falta STUDIO_RENDER_SECRET')

  const res = await fetch(`${baseUrl()}/api/studio/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
    body: JSON.stringify({ document, ...opts }),
    cache: 'no-store',
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`El render devolvió ${res.status}: ${detail.slice(0, 200)}`)
  }
  return Buffer.from(await res.arrayBuffer())
}
```

- [ ] **Step 6: Excluir Chromium del bundler**

En `next.config.ts`:

```ts
  serverExternalPackages: ["sharp", "puppeteer-core", "@sparticuz/chromium"],
```

- [ ] **Step 7: Escribir la comprobación manual**

Crea `scripts/studio-render-smoke.mjs`:

```js
// Comprueba que Chrome renderiza de verdad. No es un test: `test:unit` no
// levanta navegadores. Uso:
//   node scripts/studio-render-smoke.mjs
// Deja el PNG en studio-smoke.png y falla con código 1 si algo no cuadra.
import { writeFileSync } from 'node:fs'

const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const secret = process.env.STUDIO_RENDER_SECRET
if (!secret) {
  console.error('Falta STUDIO_RENDER_SECRET en el entorno')
  process.exit(1)
}

const document = `<!doctype html><html class="sin-precio"><head><meta charset="utf-8">
<style>:root{--brand:#1B2A41;--w:1080px;--h:1350px}
*{box-sizing:border-box;margin:0}
body{width:var(--w);height:var(--h);background:var(--brand);display:flex;
align-items:center;justify-content:center}
h1{font-family:'Spectral';font-size:90px;color:#fff}
html.sin-precio h1::after{content:' · sin precio';font-size:40px}</style>
</head><body><h1>Hola</h1></body></html>`

const res = await fetch(`${base}/api/studio/render`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
  body: JSON.stringify({ document, width: 1080, height: 1350 }),
})

if (!res.ok) {
  console.error(`Falló con ${res.status}: ${await res.text()}`)
  process.exit(1)
}

const png = Buffer.from(await res.arrayBuffer())
writeFileSync('studio-smoke.png', png)
const esPng = png[0] === 0x89 && png.toString('ascii', 1, 4) === 'PNG'
console.log(`${png.length} bytes · PNG: ${esPng} · escrito en studio-smoke.png`)
process.exit(esPng ? 0 : 1)
```

Añade el atajo en `package.json`, dentro de `scripts`:

```json
"studio:smoke": "node scripts/studio-render-smoke.mjs",
```

- [ ] **Step 8: Correrla contra el servidor de desarrollo**

En una terminal `npm run dev`; en otra:

```bash
npm run studio:smoke
```

Esperado: `... bytes · PNG: true`. Abre `studio-smoke.png`: fondo azul oscuro, "Hola · sin precio" centrado en Spectral. Si el texto sale en una fuente del sistema, las `@font-face` no llegaron; si el proceso se queda colgado, revisa `CHROME_EXECUTABLE_PATH`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/studio/render/chrome.ts src/lib/studio/render/client.ts src/app/api/studio/render/route.ts scripts/studio-render-smoke.mjs next.config.ts .env.example package.json package-lock.json
git commit -m "feat(studio): ruta de render con chrome sin interfaz"
```

---

### Task 7: Migración

**Files:**
- Create: `supabase/migrations/103_studio_templates.sql`
- Modify: `src/lib/database.types.ts` (regenerado, no a mano)

- [ ] **Step 1: Escribir la migración**

Crea `supabase/migrations/103_studio_templates.sql`:

```sql
-- 103 · Las plantillas del Estudio pasan a ser filas.
--
-- Eran doce funciones TSX: cambiarlas exigía desplegar, y en Vercel no se puede
-- escribir en el sistema de archivos. Como filas, se editan desde el CRM.
--
-- Las CLAVES son las mismas de siempre (mosaico-listing, editorial-sold…):
-- studio_images.template ya las referencia, y renombrarlas rompería
-- "Recomponer" y "Variante" sobre lo ya publicado.
--
-- No lleva tenant_id: el catálogo es de ITMANO y lo escribe solo el super_admin
-- (decisión de autor único). Si algún día un tenant diseña lo suyo, la columna
-- se añade entonces y la policy pasa a mirarla.

create table if not exists studio_templates (
  key          text primary key,
  label        text not null,
  hint         text not null default '',
  recipes      text[] not null default '{}',
  aspects      text[] not null default '{4:5}',
  html         text not null default '',
  css          text not null default '',
  -- Inferidos del html al guardar: {"required": [...], "optional": [...]}
  slots        jsonb not null default '{"required": [], "optional": []}'::jsonb,
  ideal_photos integer not null default 0,
  thumb_path   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table studio_templates is
  'Diseños del Estudio en HTML/CSS. Se renderizan con Chrome; las escribe solo el super_admin.';
comment on column studio_templates.slots is
  'Inferido del html al guardar. No se edita a mano: la fuente de verdad es el html.';

-- ── RLS: lectura para cualquier usuario autenticado, escritura por service role.
-- El catálogo no es secreto —el selector de diseños lo enseña— pero editarlo es
-- de ITMANO, y las escrituras pasan todas por el cliente admin.
alter table studio_templates enable row level security;

create policy "studio_templates_select"
  on studio_templates for select
  using (auth.role() = 'authenticated');

-- ── El diseño con el que se hizo cada pieza ──────────────────────────────────
-- Recomponer existe para arreglar un texto, no para redibujar la pieza con el
-- diseño de hoy: sin esto, corregir un precio devolvería algo distinto a lo que
-- el tenant ya publicó. Mismo criterio que form_json, que ya guarda el
-- formulario entero.
alter table studio_images
  add column if not exists template_snapshot jsonb;

comment on column studio_images.template_snapshot is
  'El {html, css} usado al generar. Recomponer repinta con esto; Variante usa el diseño vivo.';
```

- [ ] **Step 2: Aplicarla al SANDBOX**

Por el MCP de Supabase, `apply_migration` con `project_id` = `xpaixcowvyksgluazwzn`, nombre `103_studio_templates`. **No la apliques a producción**: eso se hace al final del plan y preguntando antes.

- [ ] **Step 3: Comprobar que quedó**

Por el MCP, contra el sandbox:

```sql
select column_name, data_type from information_schema.columns
where table_name in ('studio_templates', 'studio_images')
  and column_name in ('key', 'html', 'css', 'slots', 'ideal_photos', 'thumb_path', 'template_snapshot')
order by table_name, column_name;
```

Esperado: siete filas.

- [ ] **Step 4: Regenerar los tipos**

```bash
npm run types:db:sandbox
```

- [ ] **Step 5: Verificar y commitear**

```bash
npx tsc --noEmit
```

```bash
git add supabase/migrations/103_studio_templates.sql src/lib/database.types.ts
git commit -m "feat(studio): tabla de plantillas y snapshot por pieza"
```

---

### Task 8: Capa de datos (`studio-templates.ts`)

**Files:**
- Create: `src/lib/data/studio-templates.ts`
- Test: `tests/studio/template-record.test.ts`

**Interfaces:**
- Consumes: `TemplateMeta` (Task 3), `inferSlots` (Task 2), `columns()` de `@/lib/supabase/columns`, `STUDIO_BUCKET` de `@/lib/data/studio`.
- Produces:
  - `interface TemplateRecord extends TemplateMeta { html: string; css: string }`
  - `toTemplateMeta(row: unknown): TemplateMeta` — exportada y pura, para poder testearla
  - `listTemplates(): Promise<TemplateMeta[]>`
  - `getTemplate(key: string): Promise<TemplateRecord | null>`
  - `saveTemplate(input: { key: string; label: string; hint: string; recipes: string[]; aspects: string[]; html: string; css: string }): Promise<void>`
  - `saveTemplateThumb(key: string, png: Buffer): Promise<string>` — sube y devuelve el path

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/studio/template-record.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toTemplateMeta } from '@/lib/data/studio-templates'

describe('toTemplateMeta', () => {
  const row = {
    key: 'mosaico-listing', label: 'Mosaico', hint: 'Cuatro fotos o mas',
    recipes: ['new_listing'], aspects: ['4:5'],
    slots: { required: ['photo.hero'], optional: ['photo.thumbs'] },
    ideal_photos: 4, thumb_path: null,
  }

  it('mapea las columnas al contrato del cliente', () => {
    const meta = toTemplateMeta(row)
    expect(meta.key).toBe('mosaico-listing')
    expect(meta.idealPhotos).toBe(4)
    expect(meta.slots.required).toEqual(['photo.hero'])
  })

  it('tolera una fila sin slots todavia inferidos', () => {
    const meta = toTemplateMeta({ ...row, slots: null, ideal_photos: null })
    expect(meta.slots).toEqual({ required: [], optional: [] })
    expect(meta.idealPhotos).toBe(0)
  })

  it('deja thumbUrl en null cuando no hay miniatura', () => {
    expect(toTemplateMeta(row).thumbUrl).toBeNull()
  })
})
```

- [ ] **Step 2: Correr el test y verlo fallar**

```bash
npx vitest run tests/studio/template-record.test.ts
```

Esperado: FAIL, no existe el módulo.

- [ ] **Step 3: Implementar**

Crea `src/lib/data/studio-templates.ts`:

```ts
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { inferSlots } from '@/lib/studio/templates/slots'
import { STUDIO_BUCKET } from './studio'
import type { TemplateMeta } from '@/lib/studio/templates/meta'
import type { StudioRecipe, Aspect } from '@/lib/studio/types'

// Lecturas y escrituras del catálogo de diseños. Sustituye a
// templates/registry.ts: lo que era un array de módulos importados es ahora una
// tabla, y lo que viaja al cliente es TemplateMeta — dato, sin función.

export interface TemplateRecord extends TemplateMeta {
  html: string
  css:  string
}

const META_COLUMNS = columns('studio_templates', [
  'key', 'label', 'hint', 'recipes', 'aspects', 'slots', 'ideal_photos', 'thumb_path',
])

const FULL_COLUMNS = columns('studio_templates', [
  'key', 'label', 'hint', 'recipes', 'aspects', 'slots', 'ideal_photos', 'thumb_path', 'html', 'css',
])

function publicUrl(path: string | null): string | null {
  if (!path) return null
  return createAdminClient().storage.from(STUDIO_BUCKET).getPublicUrl(path).data.publicUrl
}

/** Pura a propósito: es lo único de este archivo que se puede testear sin BD. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- reason: el cliente de Supabase no está tipado en este repo; la lista de columnas ya se valida con columns()
export function toTemplateMeta(r: any): TemplateMeta {
  const slots = r.slots ?? {}
  return {
    key:         r.key,
    label:       r.label,
    hint:        r.hint ?? '',
    recipes:     (r.recipes ?? []) as StudioRecipe[],
    aspects:     (r.aspects ?? ['4:5']) as Aspect[],
    slots:       { required: slots.required ?? [], optional: slots.optional ?? [] },
    idealPhotos: r.ideal_photos ?? 0,
    thumbUrl:    publicUrl(r.thumb_path ?? null),
  }
}

/** El catálogo, en orden estable: el agente encuentra cada diseño donde estaba. */
export async function listTemplates(): Promise<TemplateMeta[]> {
  const { data, error } = await createAdminClient()
    .from('studio_templates').select(META_COLUMNS).order('key')
  if (error) throw new Error(`No se pudo leer el catálogo de diseños: ${error.message}`)
  return (data ?? []).map(toTemplateMeta)
}

export async function getTemplate(key: string): Promise<TemplateRecord | null> {
  const { data, error } = await createAdminClient()
    .from('studio_templates').select(FULL_COLUMNS).eq('key', key).maybeSingle()
  if (error) throw new Error(`No se pudo leer el diseño: ${error.message}`)
  if (!data) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reason: ídem
  const row = data as any
  return { ...toTemplateMeta(row), html: row.html ?? '', css: row.css ?? '' }
}

/**
 * Crea o actualiza un diseño. `slots` e `ideal_photos` NO se reciben: se
 * infieren del html en este mismo paso, que es lo que impide que la declaración
 * y el diseño se separen.
 */
export async function saveTemplate(input: {
  key: string; label: string; hint: string
  recipes: string[]; aspects: string[]
  html: string; css: string
}): Promise<void> {
  const { required, optional, idealPhotos } = inferSlots(input.html)
  const { error } = await createAdminClient().from('studio_templates').upsert({
    key:          input.key,
    label:        input.label,
    hint:         input.hint,
    recipes:      input.recipes,
    aspects:      input.aspects,
    html:         input.html,
    css:          input.css,
    slots:        { required, optional },
    ideal_photos: idealPhotos,
    updated_at:   new Date().toISOString(),
  }, { onConflict: 'key' })
  if (error) throw new Error(`No se pudo guardar el diseño: ${error.message}`)
}

/** Sube la miniatura y deja su path en la fila. */
export async function saveTemplateThumb(key: string, png: Buffer): Promise<string> {
  const path = `templates/${key}.png`
  const db = createAdminClient()
  const { error } = await db.storage.from(STUDIO_BUCKET)
    .upload(path, new Blob([new Uint8Array(png)], { type: 'image/png' }), {
      contentType: 'image/png', upsert: true,
    })
  if (error) throw new Error(`No se pudo subir la miniatura: ${error.message}`)
  await db.from('studio_templates')
    .update({ thumb_path: path, updated_at: new Date().toISOString() }).eq('key', key)
  return path
}
```

- [ ] **Step 4: Correr el test y verlo pasar**

```bash
npx vitest run tests/studio/template-record.test.ts && npx tsc --noEmit
```

Esperado: PASS y sin errores de tipos. Si `columns('studio_templates', …)` no compila, los tipos no se regeneraron: vuelve a la Task 7 Step 4.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/studio-templates.ts tests/studio/template-record.test.ts
git commit -m "feat(studio): capa de datos del catalogo de disenos"
```

---

### Task 9: Datos de ejemplo con escenarios

**Files:**
- Create: `src/lib/studio/badges.ts`
- Create: `src/lib/studio/sample-data.ts`
- Create: `src/lib/studio/sample-data.server.ts`
- Modify: `src/lib/studio/template-props.ts`
- Test: `tests/studio/sample-data.test.ts`

**Interfaces:**
- Consumes: `TemplateProps` de `templates/types.ts`, `DEFAULT_PALETTE` de `palettes.ts`.
- Produces también: `badgeFor(recipe: StudioRecipe): string` en el módulo puro `badges.ts`.

> **Por qué `badges.ts`:** `sample-data.ts` lo importa el editor, que es un Client
> Component, y `badgeFor` vive hoy en `template-props.ts`, que empieza con
> `import 'server-only'`. Importarlo desde el cliente revienta el build. El mapa
> de encabezados no tiene nada de servidor, así que se muda a un módulo puro.
- Produces:
  - `type ScenarioKey = 'completo' | 'minimo' | 'titular-largo' | 'sin-agente'`
  - `SCENARIOS: Array<{ key: ScenarioKey; label: string }>`
  - `sampleProps(recipe: StudioRecipe, scenario: ScenarioKey): TemplateProps` (fotos por URL)
  - en `sample-data.server.ts`: `samplePropsInlined(recipe: StudioRecipe, scenario: ScenarioKey): Promise<TemplateProps>` (fotos en `data:`)

- [ ] **Step 1: Mover los encabezados a un módulo puro**

Crea `src/lib/studio/badges.ts` moviendo `BADGES` y `badgeFor` desde `template-props.ts`, con su comentario:

```ts
import type { StudioRecipe } from './types'

// El encabezado de cada receta. Vive aparte de template-props porque ese módulo
// es `server-only` y esto lo necesita también el editor, que corre en el
// cliente. No hay nada de servidor en un mapa de cinco cadenas.

const BADGES: Record<StudioRecipe, string> = {
  open_house:  'CASA ABIERTA',
  new_listing: 'NUEVA DISPONIBLE',
  sold:        'VENDIDA',
  event:       'EVENTO',
  open_prompt: '',
}

/** El encabezado de la receta. Es el DEFAULT: `badgeOf` respeta el escrito. */
export function badgeFor(recipe: StudioRecipe): string {
  return BADGES[recipe]
}
```

En `src/lib/studio/template-props.ts`, borra las dos definiciones y sustitúyelas por:

```ts
import { badgeFor } from './badges'

export { badgeFor }
```

Así `tests/studio/templates.test.tsx` y todo lo que ya importaba `badgeFor` de ahí sigue compilando.

- [ ] **Step 2: Escribir el test que falla**

Crea `tests/studio/sample-data.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sampleProps, SCENARIOS } from '@/lib/studio/sample-data'

describe('escenarios de ejemplo', () => {
  it('ofrece los cuatro casos', () => {
    expect(SCENARIOS.map(s => s.key)).toEqual(['completo', 'minimo', 'titular-largo', 'sin-agente'])
  })

  it('el completo trae todo lo que la receta publica', () => {
    const p = sampleProps('new_listing', 'completo')
    expect(p.heroPhoto).toBeTruthy()
    expect(p.thumbPhotos).toHaveLength(3)
    expect(p.agentPhoto).toBeTruthy()
    expect(p.logo).toBeTruthy()
    expect(p.price).toBeTruthy()
    expect(p.stats.length).toBeGreaterThan(0)
  })

  it('el minimo deja solo lo imprescindible', () => {
    const p = sampleProps('new_listing', 'minimo')
    expect(p.thumbPhotos).toHaveLength(0)
    expect(p.agentPhoto).toBeNull()
    expect(p.address).toBeNull()
    expect(p.stats).toHaveLength(0)
    expect(p.headline).toBeTruthy()
  })

  it('el titular largo es de verdad largo', () => {
    expect(sampleProps('new_listing', 'titular-largo').headline.length).toBeGreaterThan(60)
  })

  it('sin-agente quita la foto y el nombre', () => {
    const p = sampleProps('sold', 'sin-agente')
    expect(p.agentPhoto).toBeNull()
    expect(p.agentName).toBeNull()
  })

  it('cada receta trae lo suyo y no lo ajeno', () => {
    expect(sampleProps('new_listing', 'completo').price).toBeTruthy()
    expect(sampleProps('sold', 'completo').price).toBeNull()
    expect(sampleProps('open_house', 'completo').when).toBeTruthy()
    expect(sampleProps('event', 'completo').cta).toBeTruthy()
  })

  it('las fotos van por URL para que el iframe las pueda pedir', () => {
    expect(sampleProps('new_listing', 'completo').heroPhoto).toMatch(/^\/studio\/fixtures\//)
  })
})
```

- [ ] **Step 3: Correr el test y verlo fallar**

```bash
npx vitest run tests/studio/sample-data.test.ts
```

Esperado: FAIL, no existe el módulo.

- [ ] **Step 4: Implementar la versión con URLs**

Crea `src/lib/studio/sample-data.ts`:

```ts
import { DEFAULT_PALETTE } from './palettes'
import { badgeFor } from './badges'
import type { StudioRecipe } from './types'
import type { TemplateProps } from './templates/types'

// Los datos con los que se diseña. Única fuente para el test de plantillas, la
// vista previa del editor y la miniatura del selector.
//
// Hay VARIOS escenarios porque la mitad difícil de una plantilla es lo que pasa
// cuando un dato falta: una vista previa con todo relleno no enseña
// precisamente eso. Son casos estructurales, no contenido — por eso viven en
// código sin traicionar el "editar sin desplegar", que es sobre el diseño.
//
// Las fotos van por URL: el iframe del editor las pide al servidor de Next. Para
// el render, sample-data.server.ts las convierte a data URI — mismos bytes.

const F = '/studio/fixtures'

export type ScenarioKey = 'completo' | 'minimo' | 'titular-largo' | 'sin-agente'

export const SCENARIOS: Array<{ key: ScenarioKey; label: string }> = [
  { key: 'completo',      label: 'Completo' },
  { key: 'minimo',        label: 'Mínimo' },
  { key: 'titular-largo', label: 'Titular de tres líneas' },
  { key: 'sin-agente',    label: 'Sin foto de agente' },
]

const HEADLINES: Record<StudioRecipe, string> = {
  new_listing: 'Casa elegante y familiar en venta',
  open_house:  'Te esperamos este sábado',
  sold:        'Otra familia en su nuevo hogar',
  event:       'Seminario para compradores primerizos',
  open_prompt: '',
}

const LARGO = 'Casa de cuatro habitaciones con jardín, garaje doble y vistas al río en el corazón de Ghent'

export function sampleProps(recipe: StudioRecipe, scenario: ScenarioKey): TemplateProps {
  const esVenta  = recipe === 'new_listing'
  const esEvento = recipe === 'event'
  const minimo   = scenario === 'minimo'
  const sinAgente = scenario === 'sin-agente' || minimo

  return {
    heroPhoto:   `${F}/casa-fachada.webp`,
    thumbPhotos: minimo ? [] : [`${F}/casa-salon.webp`, `${F}/casa-comedor.webp`, `${F}/casa-atardecer.webp`],
    agentPhoto:  sinAgente ? null : `${F}/agente-ejemplo.webp`,
    logo:        minimo ? null : `${F}/logo-ejemplo.webp`,

    headline: scenario === 'titular-largo' ? LARGO : HEADLINES[recipe],
    // Solo una venta publica cifra: un cierre dejó de hacerlo, una casa abierta
    // nunca la tuvo y un evento dejó de pedirla.
    price:    esVenta && !minimo ? '$274,400' : null,
    when:     recipe === 'open_house' ? '15 de agosto de 2026 · 11:00–14:00'
            : esEvento ? '1 de septiembre de 2026 · 18:00'
            : null,
    // En un evento este hueco lo ocupa el LUGAR.
    address:  minimo ? null : (esEvento ? 'Centro Comunitario Ghent' : '1909 Ocean View Avenue, Norfolk, VA'),
    phone:    minimo ? null : '+1 757 555 0199',
    cta:      esEvento ? 'Regístrate en itmano.com/eventos' : null,
    badge:    badgeFor(recipe),
    stats: esVenta && !minimo
      ? [
          { icon: 'ruler', value: '1,548 sqft' },
          { icon: 'bed',   value: '3 hab' },
          { icon: 'bath',  value: '2 baños' },
        ]
      : [],
    agentName: sinAgente ? null : 'Adriana Jiménez',
    palette:   DEFAULT_PALETTE,
  }
}
```

- [ ] **Step 5: Implementar la versión con data URIs**

Crea `src/lib/studio/sample-data.server.ts`:

```ts
import 'server-only'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizePhoto } from './template-props'
import { sampleProps, type ScenarioKey } from './sample-data'
import type { StudioRecipe } from './types'
import type { TemplateProps } from './templates/types'

// Los mismos escenarios con las fotos dentro del documento. La vista previa las
// pide por URL y el render las lleva en data: — mismos bytes, misma
// maquetación; lo único que cambia es el valor de un atributo.

const DIR = join(process.cwd(), 'public', 'studio', 'fixtures')

async function inline(url: string | null): Promise<string | null> {
  if (!url) return null
  return normalizePhoto(readFileSync(join(DIR, url.split('/').pop() ?? '')))
}

export async function samplePropsInlined(
  recipe: StudioRecipe, scenario: ScenarioKey,
): Promise<TemplateProps> {
  const p = sampleProps(recipe, scenario)
  const [heroPhoto, agentPhoto, logo, ...thumbs] = await Promise.all([
    inline(p.heroPhoto), inline(p.agentPhoto), inline(p.logo),
    ...p.thumbPhotos.map(inline),
  ])
  return {
    ...p,
    heroPhoto, agentPhoto, logo,
    thumbPhotos: thumbs.filter((t): t is string => t !== null),
  }
}
```

- [ ] **Step 6: Correr los tests y verlos pasar**

```bash
npx vitest run tests/studio/sample-data.test.ts
```

Esperado: PASS, 7 tests.

- [ ] **Step 7: Commit**

```bash
git add src/lib/studio/sample-data.ts src/lib/studio/sample-data.server.ts tests/studio/sample-data.test.ts
git commit -m "feat(studio): escenarios de datos de ejemplo compartidos"
```

---

### Task 10: El editor

La herramienta. Después de esta tarea se puede diseñar; las plantillas todavía no se usan al generar, y da igual: el editor se vale solo.

**Files:**
- Create: `src/app/(dashboard)/studio/plantillas/page.tsx`
- Create: `src/app/(dashboard)/studio/plantillas/editor.tsx`
- Create: `src/app/(dashboard)/studio/plantillas/actions.ts`
- Modify: `src/app/(dashboard)/studio/page.tsx` (enlace al editor)

**Interfaces:**
- Consumes: `listTemplates`, `getTemplate`, `saveTemplate`, `saveTemplateThumb` (Task 8); `buildTemplateDocument` (Task 1); `templateValues`, `templateFlags`, `paletteVars` (Task 4); `sampleProps` / `samplePropsInlined` (Task 9); `fontFaceCssFromUrls` (Task 5); `renderDocument` (Task 6); `studioFontFaceCss` — **no**: esa vive en chrome.ts y el editor no debe importarla; la ruta de render ya inyecta las fuentes por su cuenta.
- Produces: `saveTemplateAction(input: TemplateInput): Promise<ActionResult<{ key: string; thumbUrl: string | null }>>`

> **Sobre las fuentes en el render:** `buildTemplateDocument` recibe `fontFaceCss`. Para el documento que va a Chrome, quien lo arma es el servidor y usa `studioFontFaceCss()` de `chrome.ts` — pero ese módulo lo importa solo la ruta. Solución: la ruta `/api/studio/render` recibe el documento **sin** fuentes y las inyecta ella misma. Modifica `src/app/api/studio/render/route.ts` para insertar `studioFontFaceCss()` justo después de `<style>`:
>
> ```ts
> const withFonts = parsed.data.document.replace('<style>', `<style>${studioFontFaceCss()}`)
> const png = await renderDocumentToPng(withFonts, { width: parsed.data.width, height: parsed.data.height })
> ```
>
> y añade el import `import { renderDocumentToPng, studioFontFaceCss } from '@/lib/studio/render/chrome'`. Así ningún llamador necesita los bytes de las fuentes.

- [ ] **Step 1: Ajustar la ruta de render para que inyecte las fuentes**

Aplica el cambio de la nota anterior y comprueba con:

```bash
npm run studio:smoke
```

Esperado: sigue en verde (el smoke ya no necesita declarar fuentes).

- [ ] **Step 2: La server action**

Crea `src/app/(dashboard)/studio/plantillas/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { canUseStudio } from '@/lib/access/studio'
import { saveTemplate, saveTemplateThumb, listTemplates } from '@/lib/data/studio-templates'
import { buildTemplateDocument } from '@/lib/studio/templates/document'
import { templateValues, templateRawValues, templateFlags, paletteVars } from '@/lib/studio/templates/values'
import { samplePropsInlined } from '@/lib/studio/sample-data.server'
import { renderDocument } from '@/lib/studio/render/client'
import { CANVAS } from '@/lib/studio/canvas'
import type { ActionResult, StudioRecipe, Aspect } from '@/lib/studio/types'

// El guardia se repite aquí aunque la ruta ya lo tenga: una server action es un
// endpoint HTTP y se puede invocar directamente.

const schema = z.object({
  key:     z.string().trim().min(1, 'La clave es obligatoria')
            .regex(/^[a-z0-9-]+$/, 'La clave solo admite minúsculas, números y guiones'),
  label:   z.string().trim().min(1, 'El nombre es obligatorio').max(40),
  hint:    z.string().trim().max(60).default(''),
  recipes: z.array(z.enum(['open_house', 'new_listing', 'sold', 'event'])).min(1, 'Elige al menos una receta'),
  aspects: z.array(z.enum(['4:5', '1:1', '9:16'])).min(1),
  html:    z.string().max(200_000),
  css:     z.string().max(200_000),
})

export async function saveTemplateAction(input: unknown): Promise<ActionResult<{ key: string; thumbUrl: string | null }>> {
  const ctx = await getCurrentTenantContext()
  if (!canUseStudio(ctx)) return { ok: false, error: 'Acceso no autorizado' }

  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'El formulario tiene datos inválidos' }
  }
  const data = parsed.data

  try {
    await saveTemplate(data)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar el diseño' }
  }

  // La miniatura se genera aquí, con el escenario completo de la primera receta
  // que el diseño declara. Si falla, el diseño YA está guardado: se avisa y no
  // se pierde el trabajo.
  let thumbUrl: string | null = null
  try {
    const aspect = data.aspects[0] as Aspect
    const { width, height } = CANVAS[aspect]
    const props = await samplePropsInlined(data.recipes[0] as StudioRecipe, 'completo')
    const document = buildTemplateDocument({
      html: data.html, css: data.css,
      values: templateValues(props), rawValues: templateRawValues(props),
      vars: paletteVars(props.palette), flags: templateFlags(props),
      fontFaceCss: '', width, height,
    })
    const png = await renderDocument(document, { width, height })
    await saveTemplateThumb(data.key, png)
    thumbUrl = (await listTemplates()).find(t => t.key === data.key)?.thumbUrl ?? null
  } catch (e) {
    const detalle = e instanceof Error ? e.message : 'error desconocido'
    revalidatePath('/studio')
    return { ok: false, error: `El diseño se guardó, pero la miniatura falló: ${detalle}` }
  }

  revalidatePath('/studio')
  revalidatePath('/studio/plantillas')
  return { ok: true, data: { key: data.key, thumbUrl } }
}
```

- [ ] **Step 3: La página servidor**

Crea `src/app/(dashboard)/studio/plantillas/page.tsx`:

```tsx
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { canUseStudio } from '@/lib/access/studio'
import { listTemplates, getTemplate } from '@/lib/data/studio-templates'
import { fontFaceCssFromUrls, FONT_FAMILIES } from '@/lib/studio/fonts/catalog'
import { StudioTeaser } from '../teaser'
import { TemplateEditor } from './editor'

// El editor pide pantalla ancha —código y lienzo de 1080×1350 lado a lado— y no
// es una cuarta pestaña a propósito: la autoría no va al mismo nivel que el
// consumo. Ver la decisión 10 del spec.
export const maxDuration = 120

export default async function TemplatesPage({ searchParams }: {
  searchParams: Promise<{ key?: string }>
}) {
  const ctx = await getCurrentTenantContext()
  if (!canUseStudio(ctx)) return <StudioTeaser />

  const { key } = await searchParams
  const [templates, current] = await Promise.all([
    listTemplates(),
    key ? getTemplate(key) : Promise.resolve(null),
  ])

  return (
    <TemplateEditor
      templates={templates}
      current={current}
      fontFaceCss={fontFaceCssFromUrls()}
      families={FONT_FAMILIES}
    />
  )
}
```

- [ ] **Step 4: El editor cliente**

Crea `src/app/(dashboard)/studio/plantillas/editor.tsx`:

```tsx
'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save } from 'lucide-react'
import { buildTemplateDocument } from '@/lib/studio/templates/document'
import { templateValues, templateRawValues, templateFlags, paletteVars } from '@/lib/studio/templates/values'
import { sampleProps, SCENARIOS, type ScenarioKey } from '@/lib/studio/sample-data'
import { CANVAS } from '@/lib/studio/canvas'
import { saveTemplateAction } from './actions'
import type { TemplateMeta } from '@/lib/studio/templates/meta'
import type { TemplateRecord } from '@/lib/data/studio-templates'
import type { StudioRecipe, Aspect } from '@/lib/studio/types'

// La vista previa NO es una aproximación: llama a la misma buildTemplateDocument
// que el servidor le pasa a Chrome. Lo único que cambia es que aquí las fuentes
// y las fotos viajan por URL en vez de en data:.

const RECIPES: Array<{ key: StudioRecipe; label: string }> = [
  { key: 'new_listing', label: 'Nueva disponible' },
  { key: 'open_house',  label: 'Casa abierta' },
  { key: 'sold',        label: 'Vendida' },
  { key: 'event',       label: 'Evento' },
]

const codeStyle: React.CSSProperties = {
  width: '100%', height: '100%', minHeight: '260px', resize: 'none',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px', lineHeight: 1.5,
  background: 'var(--bg-surface)', color: 'var(--text-primary)',
  border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '10px',
}

export function TemplateEditor({ templates, current, fontFaceCss, families }: {
  templates:   TemplateMeta[]
  current:     TemplateRecord | null
  fontFaceCss: string
  families:    string[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [key, setKey]         = useState(current?.key ?? '')
  const [label, setLabel]     = useState(current?.label ?? '')
  const [hint, setHint]       = useState(current?.hint ?? '')
  const [recipes, setRecipes] = useState<StudioRecipe[]>(current?.recipes ?? ['new_listing'])
  const [aspects]             = useState<Aspect[]>(current?.aspects ?? ['4:5'])
  const [html, setHtml]       = useState(current?.html ?? '<main class="pieza">\n  <h1>{{&headlineRitmo}}</h1>\n</main>')
  const [css, setCss]         = useState(current?.css ?? '.pieza{width:var(--w);height:var(--h);background:var(--surface);color:var(--ink)}\nh1{font-family:Spectral;font-size:64px;padding:60px}')
  const [scenario, setScenario] = useState<ScenarioKey>('completo')

  const { width, height } = CANVAS[aspects[0]]

  // Se recalcula en cada tecla: es barato (una sustitución de cadenas) y es todo
  // el bucle de trabajo que este proyecto viene a dar.
  const document = useMemo(() => {
    const props = sampleProps(recipes[0], scenario)
    return buildTemplateDocument({
      html, css,
      values: templateValues(props), rawValues: templateRawValues(props),
      vars: paletteVars(props.palette), flags: templateFlags(props),
      fontFaceCss, width, height,
    })
  }, [html, css, recipes, scenario, fontFaceCss, width, height])

  function save() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const r = await saveTemplateAction({ key, label, hint, recipes, aspects, html, css })
      if (r.ok) { setSaved(true); router.refresh() } else setError(r.error)
    })
  }

  return (
    <div style={{ display: 'grid', gap: '20px', gridTemplateColumns: 'minmax(0, 1fr) 420px', alignItems: 'start' }}
         className="max-md:!grid-cols-1">
      <style>{`.tpl-tab:hover{border-color:var(--accent-gold)!important}`}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={current?.key ?? ''}
            onChange={e => router.push(e.target.value ? `/studio/plantillas?key=${e.target.value}` : '/studio/plantillas')}
            aria-label="Diseño a editar"
            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border-subtle)',
                     background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '12px' }}
          >
            <option value="">Diseño nuevo</option>
            {templates.map(t => <option key={t.key} value={t.key}>{t.label} · {t.key}</option>)}
          </select>

          <select
            value={scenario}
            onChange={e => setScenario(e.target.value as ScenarioKey)}
            aria-label="Escenario de datos"
            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border-subtle)',
                     background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '12px' }}
          >
            {SCENARIOS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>

          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Fuentes: {families.join(' · ')}
          </span>
        </div>

        <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: '1fr 1fr' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
            HTML
            <textarea value={html} onChange={e => setHtml(e.target.value)} spellCheck={false}
                      style={{ ...codeStyle, minHeight: '420px' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
            CSS
            <textarea value={css} onChange={e => setCss(e.target.value)} spellCheck={false}
                      style={{ ...codeStyle, minHeight: '420px' }} />
          </label>
        </div>

        <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Clave
            <input value={key} onChange={e => setKey(e.target.value)} disabled={!!current}
                   style={{ ...codeStyle, height: '32px', minHeight: 0 }} />
          </label>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Nombre
            <input value={label} onChange={e => setLabel(e.target.value)}
                   style={{ ...codeStyle, height: '32px', minHeight: 0 }} />
          </label>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Pista
            <input value={hint} onChange={e => setHint(e.target.value)}
                   style={{ ...codeStyle, height: '32px', minHeight: 0 }} />
          </label>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          {RECIPES.map(r => (
            <label key={r.key} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text-primary)' }}>
              <input
                type="checkbox"
                checked={recipes.includes(r.key)}
                onChange={e => setRecipes(prev => e.target.checked ? [...prev, r.key] : prev.filter(x => x !== r.key))}
              />
              {r.label}
            </label>
          ))}
          <button type="button" onClick={save} disabled={pending}
                  style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px',
                           padding: '8px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                           background: 'var(--accent-gold)', color: 'var(--bg-base)', fontSize: '12px', fontWeight: 500 }}>
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Guardar
          </button>
        </div>

        {error && <p style={{ fontSize: '12px', color: 'var(--status-danger, #c0392b)' }}>{error}</p>}
        {saved && <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Guardado, con su miniatura.</p>}
      </div>

      <div style={{ position: 'sticky', top: '20px' }}>
        <iframe
          title="Vista previa"
          srcDoc={document}
          sandbox=""
          style={{ width: '420px', height: `${Math.round(420 * height / width)}px`,
                   border: '1px solid var(--border-subtle)', borderRadius: '12px', background: '#fff' }}
        />
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
          {width}×{height} · el mismo documento que se convierte en PNG
        </p>
      </div>
    </div>
  )
}
```

Nota sobre `sandbox=""`: deja el iframe sin permisos, incluido JavaScript. Es el mismo cierre que la decisión 14 aplica en el servidor, así que la vista previa tampoco puede ejecutar nada que el render no ejecutaría.

- [ ] **Step 5: Enlazar desde el Estudio**

En `src/app/(dashboard)/studio/page.tsx`, dentro del `<div style={{ marginBottom: '24px' }}>` de la cabecera y después del `<p>`, añade:

```tsx
        <a href="/studio/plantillas" style={{ fontSize: '12px', color: 'var(--accent-gold)', textDecoration: 'none' }}>
          Editar diseños
        </a>
```

- [ ] **Step 6: Probarlo a mano**

```bash
npm run dev
```

Entra con `/api/dev/login?secret=<DEV_LOGIN_SECRET>&email=dj.vergara@hotmail.com`, ve a `/studio/plantillas` y comprueba:
1. Escribir en el panel de CSS cambia la vista previa al instante.
2. Cambiar de escenario a "Mínimo" quita la foto del agente y las miniaturas.
3. Guardar con clave `prueba-borrador`, receta "Nueva disponible": responde sin error y la miniatura aparece en el bucket (`templates/prueba-borrador.png`).
4. Borra la fila de prueba por el MCP: `delete from studio_templates where key = 'prueba-borrador';`

- [ ] **Step 7: Verificar y commitear**

```bash
npm run lint && npx tsc --noEmit && npm run test:unit
```

```bash
git add "src/app/(dashboard)/studio/plantillas" "src/app/(dashboard)/studio/page.tsx" src/app/api/studio/render/route.ts
git commit -m "feat(studio): editor de plantillas con vista previa en vivo"
```

---

### Task 11: Siembra desde archivos y primer diseño portado

Vertical slice: un diseño real, de punta a punta, comparado contra el que existe hoy.

**Files:**
- Create: `src/lib/studio/templates/seed/mosaico-listing/{template.html,template.css,meta.json}`
- Create: `scripts/seed-studio-templates.mjs`
- Modify: `package.json`

- [ ] **Step 1: El script de siembra**

Crea `scripts/seed-studio-templates.mjs`:

```js
// Siembra o actualiza las filas de studio_templates desde los archivos de
// src/lib/studio/templates/seed/. Es el camino de ida: los diseños se escriben
// como archivos mientras se portan y desde ahí entran a la base. Una vez
// dentro, la fuente de verdad es la fila y se edita en /studio/plantillas.
//
//   node scripts/seed-studio-templates.mjs            → sandbox (por defecto)
//   node scripts/seed-studio-templates.mjs produccion → producción (pregunta antes)
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

const destino = process.argv[2] === 'produccion' ? '.env.local' : '.env.development.local'
config({ path: destino })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const keyServicio = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !keyServicio) {
  console.error(`Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en ${destino}`)
  process.exit(1)
}
console.log(`Sembrando en ${url}`)

const db = createClient(url, keyServicio)
const raiz = join(process.cwd(), 'src', 'lib', 'studio', 'templates', 'seed')

for (const key of readdirSync(raiz)) {
  const dir = join(raiz, key)
  const metaPath = join(dir, 'meta.json')
  if (!existsSync(metaPath)) continue

  const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
  const html = readFileSync(join(dir, 'template.html'), 'utf8')
  const css  = readFileSync(join(dir, 'template.css'), 'utf8')

  const { error } = await db.from('studio_templates').upsert({
    key, label: meta.label, hint: meta.hint ?? '',
    recipes: meta.recipes, aspects: meta.aspects ?? ['4:5'],
    html, css, updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })

  if (error) {
    console.error(`✗ ${key}: ${error.message}`)
    process.exit(1)
  }
  console.log(`· ${key}`)
}

console.log('Listo. Abre cada diseño en /studio/plantillas y pulsa Guardar para inferir slots y generar su miniatura.')
```

Añade a `scripts` en `package.json`:

```json
"studio:seed": "node scripts/seed-studio-templates.mjs",
```

- [ ] **Step 2: Portar `mosaico-listing`**

Lee `src/lib/studio/templates/mosaico-listing.tsx` y `primitives.tsx` (`Band`, `Badge`, `Headline`, `StatRow`, `PhotoCard`, `AgentBadge`) y tradúcelo. Crea `src/lib/studio/templates/seed/mosaico-listing/meta.json`:

```json
{
  "label": "Mosaico",
  "hint": "Cuatro fotos o más",
  "recipes": ["new_listing"],
  "aspects": ["4:5"]
}
```

`template.html`:

```html
<main class="pieza">
  {{#hero}}<img class="hero" src="{{hero}}" alt="">{{/hero}}
  {{#logo}}<img class="logo" src="{{logo}}" alt="">{{/logo}}

  <div class="thumbs">
    {{#thumb1}}<img src="{{thumb1}}" alt="">{{/thumb1}}
    {{#thumb2}}<img src="{{thumb2}}" alt="">{{/thumb2}}
    {{#thumb3}}<img src="{{thumb3}}" alt="">{{/thumb3}}
  </div>

  <div class="titular">
    <span class="badge">{{badge}}</span>
    <h1>{{&headlineRitmo}}</h1>
    {{#address}}<p class="direccion">{{address}}</p>{{/address}}
  </div>

  <div class="banda specs">
    {{#stat1}}<span>{{stat1}}</span>{{/stat1}}
    {{#stat2}}<span>{{stat2}}</span>{{/stat2}}
    {{#stat3}}<span>{{stat3}}</span>{{/stat3}}
  </div>

  <div class="banda cierre">
    {{#price}}<span class="precio">{{price}}</span>{{/price}}
    {{#agentName}}<span class="agente">{{agentName}}{{#phone}} · {{phone}}{{/phone}}</span>{{/agentName}}
  </div>

  {{#agentPhoto}}<img class="retrato" src="{{agentPhoto}}" alt="">{{/agentPhoto}}
</main>
```

`template.css`:

```css
/* Mosaico — hero grande, tres miniaturas superpuestas, bloque de titular y dos
   bandas apiladas abajo. Luce cuando el agente tiene sesión completa. */
.pieza { position: relative; width: var(--w); height: var(--h); background: var(--surface); overflow: hidden; }

.hero { position: absolute; top: 0; left: 0; width: 1080px; height: 700px; object-fit: cover; }
.logo { position: absolute; top: 30px; left: 40px; width: 150px; height: 150px; object-fit: contain; }

.thumbs { position: absolute; top: 560px; left: 60px; display: flex; gap: 20px; }
.thumbs img { width: 300px; height: 220px; object-fit: cover; border-radius: 12px;
              box-shadow: 0 10px 30px rgba(0,0,0,.28); }

.titular { position: absolute; top: 830px; left: 60px; width: 700px; }
.badge { font-family: Marcellus; font-size: 24px; letter-spacing: .14em; color: var(--brand); }
.titular h1 { font-family: Spectral; font-size: 58px; line-height: 1.08;
              color: var(--ink); margin-top: 14px; }
/* El ritmo del titular: una palabra de cada dos con peso. Lo marca values.ts
   porque el CSS no puede seleccionar palabras sueltas de una cadena. */
.palabra { font-weight: 400; }
.palabra-fuerte { font-weight: 800; }
.direccion { font-family: Spectral; font-size: 26px; color: var(--ink); opacity: .75; margin-top: 16px; }

.banda { position: absolute; left: 0; width: 1080px; display: flex; align-items: center;
         padding: 0 60px; gap: 44px; }
.specs { bottom: 130px; height: 110px; background: var(--brand); color: var(--on-brand);
         font-family: Spectral; font-size: 30px; }
.cierre { bottom: 0; height: 130px; background: var(--brand-dark); color: var(--on-dark);
          flex-direction: column; align-items: flex-start; justify-content: center; gap: 0; }
.precio { font-family: Spectral; font-weight: 800; font-size: 56px; }
.agente { font-family: Marcellus; font-size: 22px; letter-spacing: .09em; }

/* Monta SOBRE las bandas, no apoyada en su borde: apoyada parecía que se había
   quedado corta. */
.retrato { position: absolute; right: 50px; bottom: 130px; width: 250px; height: 250px;
           border-radius: 50%; object-fit: cover; border: 6px solid var(--brand); }

/* Sin miniaturas el titular sube: el hueco de 220px no tiene por qué quedarse. */
html.fotos-1 .titular { top: 700px; }
html.fotos-1 .titular h1 { font-size: 64px; }
```

- [ ] **Step 3: Sembrar y comparar**

```bash
npm run studio:seed
```

Con `npm run dev` levantado, abre `/studio/plantillas?key=mosaico-listing`, pulsa **Guardar** (infiere slots y genera miniatura) y compara la vista previa con `public/studio/templates/mosaico-listing.webp`, que es el diseño actual. Ajusta el CSS hasta que la diferencia sea de píxeles, no de composición.

- [ ] **Step 4: Comprobar la inferencia**

Por el MCP, contra el sandbox:

```sql
select key, ideal_photos, slots from studio_templates where key = 'mosaico-listing';
```

Esperado: `ideal_photos` = 4; `slots.required` incluye `photo.hero` y `text.headline`; `slots.optional` incluye `photo.thumbs`, `photo.agent`, `stats`, `text.price`, `text.address`, `logo.tenant`.

> Si `text.price` sale como opcional y hoy `mosaico-listing` lo declara **requerido**, es correcto y es el contrato haciendo su trabajo: el HTML envuelve el precio en una sección, así que el diseño sobrevive sin él.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-studio-templates.mjs package.json src/lib/studio/templates/seed
git commit -m "feat(studio): siembra de plantillas y mosaico de venta portado"
```

---

### Task 12: Portar los siete diseños restantes

**Files:**
- Create: `src/lib/studio/templates/seed/<key>/{template.html,template.css,meta.json}` para: `completa-listing`, `editorial-listing`, `mosaico-open-house`, `completa-open-house`, `mosaico-sold`, `completa-sold`, `editorial-sold`.

Los cuatro que faltan (`editorial-open-house`, `agenda-event`, `completa-event`, `editorial-event`) **no se portan**: se rehacen en la Task 16.

- [ ] **Step 1: Portar los tres de "Foto completa"**

Lee `completa-listing.tsx`, `completa-open-house.tsx` y `completa-sold.tsx`. Comparten estructura (foto a sangre + degradado + texto abajo), así que sale un `template.css` casi idéntico con diferencias de contenido. Para cada uno crea su carpeta con `meta.json` (`label: "Foto completa"`, `hint` copiado del TSX, `recipes` con su receta, `aspects: ["4:5"]`), su `template.html` y su `template.css`.

`completa-listing/meta.json`:

```json
{
  "label": "Foto completa",
  "hint": "Una foto excelente",
  "recipes": ["new_listing"],
  "aspects": ["4:5"]
}
```

`completa-listing/template.html`:

```html
<main class="pieza">
  {{#hero}}<img class="hero" src="{{hero}}" alt="">{{/hero}}
  <div class="velo"></div>
  {{#logo}}<img class="logo" src="{{logo}}" alt="">{{/logo}}

  <div class="texto">
    <span class="badge">{{badge}}</span>
    <h1>{{&headlineRitmo}}</h1>
    {{#price}}<span class="precio">{{price}}</span>{{/price}}
    {{#address}}<span class="direccion">{{address}}</span>{{/address}}
    <div class="specs">
      {{#stat1}}<span>{{stat1}}</span>{{/stat1}}
      {{#stat2}}<span>{{stat2}}</span>{{/stat2}}
      {{#stat3}}<span>{{stat3}}</span>{{/stat3}}
    </div>
    {{#agentName}}<span class="agente">{{agentName}}{{#phone}} · {{phone}}{{/phone}}</span>{{/agentName}}
  </div>

  {{#agentPhoto}}<img class="retrato" src="{{agentPhoto}}" alt="">{{/agentPhoto}}
</main>
```

`completa-listing/template.css`:

```css
/* Foto completa — la foto manda y el texto vive sobre un degradado en la mitad
   inferior. Para el agente que tiene UNA foto excelente: no hay mosaico que
   llenar ni espacio que justificar.
   La foto va A SANGRE. Hubo un marco del color secundario y se retiró: este
   diseño existe para que una foto ocupe el lienzo entero. */
.pieza { position: relative; width: var(--w); height: var(--h);
         background: var(--surface); overflow: hidden; }

.hero { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }

/* Los tramos están calculados contra dónde EMPIEZA el texto (~56% del alto), no
   repartidos a ojo: con una rampa suave desde el 42% el titular caía sobre la
   parte clara de la fachada y se perdía. El color es el primario del tenant, no
   negro — es el trabajo concreto que ese rol tiene en este diseño. */
.velo { position: absolute; inset: 0; background: linear-gradient(
  to bottom,
  transparent 28%,
  color-mix(in srgb, var(--brand) 55%, transparent) 52%,
  color-mix(in srgb, var(--brand) 85%, transparent) 70%,
  color-mix(in srgb, var(--brand) 97%, transparent) 100%); }

.logo { position: absolute; top: 50px; right: 50px; width: 120px; height: 120px;
        object-fit: contain; }

/* Con retrato el bloque se estrecha: el círculo ocupa la derecha y una dirección
   larga acabaría cortada por debajo de él. */
.texto { position: absolute; bottom: 100px; left: 70px; width: 860px;
         display: flex; flex-direction: column; color: var(--on-photo); }
html:not(.sin-foto-agente) .texto { width: 700px; }

.badge { font-family: Marcellus; font-size: 26px; letter-spacing: .23em; }
.texto h1 { font-family: Spectral; font-size: 66px; line-height: 1.08; margin-top: 16px; }
.palabra { font-weight: 400; }
.palabra-fuerte { font-weight: 800; }
.precio { font-family: Spectral; font-weight: 800; font-size: 76px; margin-top: 20px; }
.direccion { font-family: Spectral; font-size: 28px; margin-top: 12px; }
.specs { display: flex; gap: 44px; margin-top: 22px; font-family: Spectral; font-size: 30px; }
.specs:empty { display: none; }
.agente { font-family: Marcellus; font-size: 24px; letter-spacing: .12em; margin-top: 24px; }

/* El anillo es el único borde del diseño: separa la cara del agente del fondo.
   No hace falta recortar nada — la foto ya llega circular desde sharp. */
.retrato { position: absolute; right: 70px; bottom: 120px; width: 209px; height: 209px;
           border-radius: 50%; object-fit: cover; border: 8px solid var(--surface); }
```

Dos cosas que este diseño demuestra y satori no permitía: `color-mix()` para el degradado —antes hacía falta el helper `rgba()` en TypeScript— y `.specs:empty`, que quita la fila de specs sin que el autor declare nada.

`completa-open-house` y `completa-sold` parten de este CSS. Cambia qué ocupa el bloque: la casa abierta pone `{{whenDay}}` / `{{whenTime}}` donde la venta pone el precio, y el cierre no publica cifra.

Reglas de traducción que valen para todos:
- `p.palette.brand` → `var(--brand)`; `darken(p.palette.brand)` → `var(--brand-dark)`; `textColors().onBrand/onDark/onPhoto` → `var(--on-brand)` / `var(--on-dark)` / `var(--on-photo)`; `p.palette.ink` → `var(--ink)`; `p.palette.surface` → `var(--surface)`.
- `{p.x && <bloque/>}` → `{{#x}}<bloque>{{/x}}`.
- El degradado sobre la foto, que en satori era un `div` con `background: linear-gradient(...)`, puede ser un pseudo-elemento `::after`.
- Los iconos de `ICONS` se copian como `<svg viewBox="0 0 24 24">` inline dentro de su sección.
- `splitWhen(p.when)` → `{{whenDay}}` y `{{whenTime}}`.

- [ ] **Step 2: Portar los dos de "Mosaico" restantes**

`mosaico-open-house` y `mosaico-sold`: parten del CSS de `mosaico-listing` (Task 11). La diferencia es qué ocupa la banda inferior — la fecha en casa abierta, el nombre del agente en la venta cerrada.

- [ ] **Step 3: Portar los dos "Editorial" que se portan**

`editorial-listing` y `editorial-sold` salen de `editorial-shell.tsx`. Aquí está el caso que justifica las clases de estado: `photoHeight(blocks)` se traduce a

```css
.foto { height: 520px; }
html.datos-3 .foto, html.datos-2 .foto, html.datos-1 .foto { height: 700px; }
html.datos-4 .foto, html.datos-5 .foto { height: 600px; }
```

y el bloque de color se queda con lo que sobre usando `flex: 1` en lugar de alturas fijas.

- [ ] **Step 4: Sembrar, revisar y guardar cada uno**

```bash
npm run studio:seed
```

Para cada clave, abre `/studio/plantillas?key=<clave>`, recorre **los cuatro escenarios** (el mínimo es el que enseña los huecos), corrige y pulsa Guardar.

- [ ] **Step 5: Comprobar que están las ocho**

Por el MCP, contra el sandbox:

```sql
select key, label, ideal_photos, thumb_path is not null as tiene_miniatura
from studio_templates order by key;
```

Esperado: ocho filas, todas con miniatura.

- [ ] **Step 6: Commit**

```bash
git add src/lib/studio/templates/seed
git commit -m "feat(studio): portados los ocho disenos de casa a html"
```

---

### Task 13: Conmutar el consumo

Aquí el Estudio deja de usar los TSX. Después de esta tarea, "Evento" se queda temporalmente sin diseños: es aceptable porque el Estudio está tras `super_admin` y en producción hay dos piezas de prueba. La Task 16 lo cierra.

**Files:**
- Modify: `src/lib/studio/generate.ts`, `src/lib/studio/recipes.ts`, `src/app/(dashboard)/studio/{page.tsx,studio-tabs.tsx,recipe-form.tsx,template-picker.tsx,actions.ts}`, `src/lib/data/studio.ts`
- Test: `tests/studio/recipes.test.ts` (ajustar)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces:
  - `renderTemplatePiece(params: { ctx: TenantContext; form: StudioForm; generatedHero?: Buffer | null; snapshot?: { html: string; css: string } | null }): Promise<{ png: Buffer; snapshot: { html: string; css: string } }>`
  - `requireTemplate(form: StudioForm, metas: TemplateMeta[]): { ok: false; error: string } | null`
  - `validateTemplateChoice(form: StudioForm, metas: TemplateMeta[]): { ok: false; error: string } | null`

- [ ] **Step 1: Sacar el registry de `recipes.ts`**

En `src/lib/studio/recipes.ts`: borra el import de `./templates/registry`, quita del `superRefine` el bloque `if (v.template) { const t = findTemplate(...) … }` y sustituye `requireTemplate` por estas dos funciones puras al final del archivo:

```ts
import type { TemplateMeta } from './templates/meta'

/**
 * El diseño elegido tiene que existir y servir para esta receta.
 *
 * Salió del esquema zod cuando las plantillas pasaron a ser filas: el esquema
 * es síncrono y lo usa también el cliente, así que no puede consultar la base.
 * El llamador ya tiene el catálogo cargado y se lo pasa.
 */
export function validateTemplateChoice(
  form: StudioForm, metas: TemplateMeta[],
): { ok: false; error: string } | null {
  if (!form.template) return null
  const t = metas.find(m => m.key === form.template)
  if (!t) return { ok: false, error: 'Ese diseño no existe' }
  if (!t.recipes.includes(form.recipe)) return { ok: false, error: 'Ese diseño no sirve para esta receta' }
  return null
}

/**
 * Las piezas NUEVAS de casa se dibujan con un diseño. Es política de producto y
 * va aparte del esquema a propósito: las piezas creadas antes de los diseños
 * tienen `template` nulo, y recomponerlas vuelve a pasar su form_json por
 * parseStudioForm — si el esquema lo exigiera, dejarían de poder recomponerse.
 */
export function requireTemplate(
  form: StudioForm, metas: TemplateMeta[],
): { ok: false; error: string } | null {
  if (metas.filter(m => m.recipes.includes(form.recipe)).length === 0) return null
  if (form.template) return null
  return { ok: false, error: 'Elige un diseño' }
}
```

Ajusta `tests/studio/recipes.test.ts`: donde se probaba el rechazo de un template inexistente vía `parseStudioForm`, pásalo a `validateTemplateChoice(form, [])`, y donde `requireTemplate(form)` tomaba un argumento, pásale una lista de `TemplateMeta`.

- [ ] **Step 2: Reescribir `renderTemplatePiece`**

En `src/lib/studio/generate.ts`, sustituye los imports de `./templates/registry` y `./render/satori` por:

```ts
import { getTemplate } from '@/lib/data/studio-templates'
import { buildTemplateDocument } from './templates/document'
import { templateValues, templateRawValues, templateFlags, paletteVars } from './templates/values'
import { renderDocument } from './render/client'
```

y reemplaza el cuerpo de `renderTemplatePiece`:

```ts
/**
 * Renderiza una pieza con diseño. No persiste nada y no llama a ninguna IA: las
 * fotos son las reales de la propiedad y el texto sale del formulario. Por eso
 * la previsualización puede ser gratis e ilimitada.
 *
 * Devuelve también el {html, css} usado: la pieza lo guarda para que
 * "Recomponer" repinte con el diseño de ENTONCES y no con el de hoy.
 */
export async function renderTemplatePiece(params: {
  ctx:  TenantContext
  form: StudioForm
  generatedHero?: Buffer | null
  /** El diseño congelado de la pieza, cuando se está recomponiendo. */
  snapshot?: { html: string; css: string } | null
}): Promise<{ png: Buffer; snapshot: { html: string; css: string } }> {
  const { ctx, form } = params
  if (!ctx.tenant_id) throw new Error('Selecciona un tenant antes de renderizar')
  if (!form.template) throw new Error('La pieza no tiene diseño')

  let design = params.snapshot ?? null
  if (!design) {
    const template = await getTemplate(form.template)
    if (!template) throw new Error('Ese diseño no existe')
    design = { html: template.html, css: template.css }
  }

  const [brand, properties, agents] = await Promise.all([
    getStudioBrand(ctx.tenant_id, form.agent_id ?? null),
    getPropertyOptions(ctx.tenant_id),
    getAgentOptions(ctx.tenant_id),
  ])

  const photoUrls = form.property_id
    ? (properties.find(p => p.id === form.property_id)?.photos ?? [])
    : []

  const agent = form.agent_id ? agents.find(a => a.id === form.agent_id) : undefined
  const agentPhoto = agent?.cover_photo_url
    ? { url: agent.cover_photo_url, cutout: agent.cover_photo_cutout }
    : null

  const props = await buildTemplateProps({ form, brand, photoUrls, agentPhoto, generatedHero: params.generatedHero })
  const { width, height } = CANVAS[form.aspect]

  const document = buildTemplateDocument({
    html: design.html, css: design.css,
    values: templateValues(props), rawValues: templateRawValues(props),
    vars: paletteVars(props.palette), flags: templateFlags(props),
    // Las fuentes las inyecta /api/studio/render: los bytes viven en su bundle.
    fontFaceCss: '', width, height,
  })

  return { png: await renderDocument(document, { width, height }), snapshot: design }
}
```

- [ ] **Step 3: Guardar el snapshot al generar y usarlo al recomponer**

En `generateStudioImage`, en el camino con diseño:

```ts
      const { png, snapshot } = await renderTemplatePiece({ ctx, form, generatedHero: hero })
      const renderedPath = await uploadPng(`${base}/final.png`, png)
```

y añade `template_snapshot: snapshot,` al `update` que marca `status: 'ready'`.

En `recomposeStudioImage`, en el camino con diseño:

```ts
      // El diseño de ENTONCES, no el de hoy: recomponer arregla un texto, no
      // rediseña una pieza que el tenant ya publicó.
      const snapshot = (existing.template_snapshot ?? null) as { html: string; css: string } | null
      const { png } = await renderTemplatePiece({ ctx, form, generatedHero: hero, snapshot })
```

Para que `existing.template_snapshot` exista, añade `'template_snapshot'` a `IMAGE_COLUMNS` en `src/lib/data/studio.ts`, el campo `template_snapshot: { html: string; css: string } | null` a la interfaz `StudioImage` en `src/lib/studio/types.ts`, y `template_snapshot: r.template_snapshot ?? null,` en `toImage`.

- [ ] **Step 4: Bajar el catálogo por props**

En `src/app/(dashboard)/studio/page.tsx`, añade `listTemplates()` al `Promise.all` y pasa `templates` a `<StudioTabs>`. En `studio-tabs.tsx`, añade la prop `templates: TemplateMeta[]` y pásala a `<RecipeForm>`.

En `recipe-form.tsx`:
- Borra el import de `@/lib/studio/templates/registry` y el puente que añadió la Task 3.
- Añade la prop `templates: TemplateMeta[]`.
- `firstTemplateFor` pasa a recibir la lista:

```tsx
function firstTemplateFor(metas: TemplateMeta[], recipe: string): string {
  return metas.find(t => t.recipes.includes(recipe as StudioRecipe))?.key ?? ''
}
```

- `const templates = useMemo(() => templatesForRecipeIn(templatesProp, recipe as StudioRecipe), [templatesProp, recipe])`
- Las dos llamadas a `findTemplate(...)?.aspects` pasan a `findTemplateIn(templatesProp, ...)?.aspects`.

En `template-picker.tsx`, la miniatura pasa a salir de la fila:

```tsx
                {t.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- reason: el bucket sirve el PNG; next/image no aporta en una tarjeta de 130px
                  <img src={t.thumbUrl} alt={t.label}
                       style={{ width: '100%', display: 'block', borderRadius: '6px', aspectRatio: '4 / 5', objectFit: 'cover' }} />
                ) : (
                  <span style={{ display: 'block', width: '100%', aspectRatio: '4 / 5', borderRadius: '6px',
                                 background: 'var(--bg-subtle, var(--bg-surface))' }} />
                )}
```

**No dejes una ruta de respaldo bajo `/studio/templates/`:** ese directorio lo borra la Task 15, y un `src` a un archivo inexistente da una imagen rota en vez de un marco vacío. En el `Lightbox`, ábrelo solo cuando `zoom.thumbUrl` no sea null.

- [ ] **Step 5: Validar el diseño elegido en la action**

En `src/app/(dashboard)/studio/actions.ts`, dentro de `createStudioImage`, después de `parseStudioForm`:

```ts
  const metas = await listTemplates()
  const malaEleccion = validateTemplateChoice(parsed.data, metas)
  if (malaEleccion) return malaEleccion

  // Solo al CREAR: las piezas viejas sin diseño siguen recomponiéndose.
  const noTemplate = requireTemplate(parsed.data, metas)
  if (noTemplate) return noTemplate
```

con los imports correspondientes (`listTemplates` de `@/lib/data/studio-templates`, `validateTemplateChoice` de `@/lib/studio/recipes`).

- [ ] **Step 6: Verificar de punta a punta**

```bash
npm run lint && npx tsc --noEmit && npm run test:unit
```

Con `npm run dev`, en `/studio`: genera una pieza de "Nueva disponible" con propiedad y diseño Mosaico. Comprueba que sale el PNG, que la biblioteca lo enseña, y que **Recomponer** con un titular distinto lo repinta. Luego, en `/studio/plantillas`, cambia un color del mosaico y guarda; vuelve a recomponer la MISMA pieza: debe seguir viéndose con el diseño viejo. Genera una **Variante**: esa sí sale con el color nuevo.

- [ ] **Step 7: Commit**

```bash
git add src/lib/studio "src/app/(dashboard)/studio" src/lib/data/studio.ts tests/studio
git commit -m "feat(studio): las piezas se renderizan con las plantillas de la base"
```

---

### Task 14: Mi Imagen sin el compositor

**Files:**
- Create: `src/lib/studio/finish-free-image.ts`
- Modify: `src/lib/studio/generate.ts`
- Test: `tests/studio/finish-free-image.test.ts`

**Interfaces:**
- Produces: `finishFreeImage(params: { background: Buffer | null; accent: string; width: number; height: number }): Promise<Buffer>`

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/studio/finish-free-image.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { finishFreeImage } from '@/lib/studio/finish-free-image'

async function lienzo(w: number, h: number): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: '#123456' } }).png().toBuffer()
}

describe('finishFreeImage', () => {
  it('encaja la imagen al lienzo pedido', async () => {
    const png = await finishFreeImage({ background: await lienzo(800, 800), accent: '#1B2A41', width: 1080, height: 1350 })
    const meta = await sharp(png).metadata()
    expect(meta.width).toBe(1080)
    expect(meta.height).toBe(1350)
  })

  it('sin fondo devuelve el degradado del color de marca', async () => {
    const png = await finishFreeImage({ background: null, accent: '#1B2A41', width: 1080, height: 1350 })
    const meta = await sharp(png).metadata()
    expect(meta.width).toBe(1080)
    expect(meta.format).toBe('png')
  })
})
```

- [ ] **Step 2: Correr el test y verlo fallar**

```bash
npx vitest run tests/studio/finish-free-image.test.ts
```

Esperado: FAIL, no existe el módulo.

- [ ] **Step 3: Implementar**

Lee `proceduralSvg` en `src/lib/studio/compositor.ts` y cópialo aquí. Crea `src/lib/studio/finish-free-image.ts`:

```ts
import 'server-only'
import sharp from 'sharp'

// Lo único que "Mi Imagen" usaba del compositor de bandas.
//
// Esa pestaña devuelve la imagen del modelo tal cual: `piecesFor` devolvía []
// para open_prompt y composeStudioImage salía por `return base.toBuffer()`. Al
// retirar el compositor, esas seis líneas son lo que hay que conservar — y
// aisladas se leen por lo que son, en vez de como el caso vacío de otra cosa.

function proceduralSvg(width: number, height: number, accent: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="p" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${accent}" stop-opacity="1"/>
        <stop offset="1" stop-color="${accent}" stop-opacity="0.72"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#p)"/>
  </svg>`
}

export async function finishFreeImage(params: {
  background: Buffer | null
  /** El color del tenant, para el respaldo cuando no hay imagen. */
  accent: string
  width:  number
  height: number
}): Promise<Buffer> {
  const { background, width, height } = params
  if (!background) {
    return sharp(Buffer.from(proceduralSvg(width, height, params.accent))).png().toBuffer()
  }
  // `position: attention` recorta buscando la zona con más detalle: en una foto
  // vertical de una casa, eso conserva la fachada en vez de cortarla.
  return sharp(background).resize(width, height, { fit: 'cover', position: 'attention' }).png().toBuffer()
}
```

- [ ] **Step 4: Usarlo en el pipeline**

En `src/lib/studio/generate.ts`, sustituye el import de `./compositor` por `import { finishFreeImage } from './finish-free-image'` y la llamada del camino sin diseño:

```ts
    const png = await finishFreeImage({
      background: bg.buffer, accent: brand.primary_color, ...CANVAS[form.aspect],
    })
```

Haz lo mismo en `recomposeStudioImage`. Borra de ese archivo la variable `textZone` y todo lo que solo servía al compositor; deja de escribir `text_zone` (la columna se queda por las filas viejas).

- [ ] **Step 5: Verificar**

```bash
npx vitest run tests/studio/finish-free-image.test.ts && npx tsc --noEmit
```

Con `npm run dev`, genera una imagen en la pestaña **Mi Imagen** y comprueba que sale igual que antes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/studio/finish-free-image.ts src/lib/studio/generate.ts tests/studio/finish-free-image.test.ts
git commit -m "refactor(studio): mi imagen deja de pasar por el compositor"
```

---

### Task 15: Limpieza

**Files:**
- Delete: los doce `src/lib/studio/templates/*.tsx`, `primitives.tsx`, `editorial-shell.tsx`, `registry.ts`, `src/lib/studio/render/satori.ts`, `src/lib/studio/compositor.ts`, `src/lib/studio/typeset.ts`, `scripts/gen-template-thumbs.mjs`, `public/studio/templates/*.webp`
- Delete: `tests/studio/templates.test.tsx`, `tests/studio/primitives.test.tsx`, `tests/studio/render.test.tsx`, `tests/studio/thumbnails.test.ts`, `tests/studio/compositor.test.ts`
- Modify: `package.json` (quitar `satori`), `tests/studio/template-fit.test.ts` (quitar lo del registry)

- [ ] **Step 1: Comprobar que nadie los importa**

```bash
grep -rn "templates/registry\|render/satori\|studio/compositor\|studio/typeset\|primitives\|editorial-shell" src scripts tests --include=*.ts --include=*.tsx --include=*.mjs
```

Esperado: solo aciertos dentro de los archivos que se van a borrar. Cualquier otro hay que resolverlo antes de seguir.

- [ ] **Step 2: Borrar**

```bash
git rm -r src/lib/studio/templates/*.tsx src/lib/studio/templates/registry.ts src/lib/studio/render/satori.ts src/lib/studio/compositor.ts src/lib/studio/typeset.ts scripts/gen-template-thumbs.mjs public/studio/templates
git rm tests/studio/templates.test.tsx tests/studio/primitives.test.tsx tests/studio/render.test.tsx tests/studio/thumbnails.test.ts tests/studio/compositor.test.ts
```

En `tests/studio/template-fit.test.ts`, borra los bloques que importaban de `registry` y deja los que la Task 3 añadió sobre `meta.ts`.

- [ ] **Step 3: Quitar la dependencia**

```bash
npm uninstall satori
```

`sharp` y `opentype.js` **se quedan**: sharp normaliza las fotos y termina "Mi Imagen"; opentype lo usa el motor de carruseles.

- [ ] **Step 4: Comprobar que nada apunta al directorio borrado**

```bash
grep -rn "studio/templates/" src/app src/lib --include=*.tsx --include=*.ts
```

Esperado: sin resultados. Cualquier `src` a esa ruta daría una imagen rota ahora que el directorio no existe.

- [ ] **Step 5: Verificar todo**

```bash
npm run lint && npx tsc --noEmit && npm run test:unit && npm run build
```

Esperado: todo en verde. `npm run build` es el que detecta un import olvidado en una ruta que los tests no tocan.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(studio): retira satori, los templates tsx y el compositor"
```

---

### Task 16: Rehacer los cuatro diseños pendientes

Trabajo de diseño, no de código: es para lo que existe la herramienta. Lo hace Dylan en `/studio/plantillas`.

- [ ] **Step 1: Casa abierta · Editorial**

Diseño nuevo con clave `editorial-open-house`, receta `open_house`. El TSX viejo repartía el lienzo con `photoHeight(blocks)`; ahora eso son clases de estado. La receta no tiene specs ni cifra, así que el dato dominante es `{{whenDay}}` / `{{whenTime}}`.

- [ ] **Step 2: Evento · Agenda**

Clave `agenda-event`, receta `event`. Es el único diseño que no usa foto: no declares `{{hero}}` y `ideal_photos` quedará en 0, que es lo que hace que el aviso de encaje no pida fotos que la receta no tiene.

- [ ] **Step 3: Evento · Foto completa**

Clave `completa-event`, receta `event`. Foto a sangre, con `{{cta}}` (el registro) como cierre.

- [ ] **Step 4: Evento · Editorial**

Clave `editorial-event`, receta `event`.

- [ ] **Step 5: Comprobar el catálogo completo**

Por el MCP, contra el sandbox:

```sql
select r.recipe, count(*) from studio_templates t,
  unnest(t.recipes) as r(recipe) group by 1 order by 1;
```

Esperado: `event` 3, `new_listing` 3, `open_house` 3, `sold` 3.

- [ ] **Step 6: Bajar los diseños nuevos a archivos**

Para que el sandbox y producción se puedan volver a sembrar desde cero, exporta las cuatro filas nuevas a `src/lib/studio/templates/seed/<key>/`. Por el MCP:

```sql
select key, label, hint, recipes, aspects, html, css from studio_templates
where key in ('editorial-open-house','agenda-event','completa-event','editorial-event');
```

y vuelca cada campo a su archivo.

- [ ] **Step 7: Commit**

```bash
git add src/lib/studio/templates/seed
git commit -m "feat(studio): rehechos los cuatro disenos de evento y casa abierta"
```

---

### Task 17: Producción

- [ ] **Step 1: Pedir permiso a Dylan**

Explícale qué se va a aplicar: la migración `103` (tabla nueva `studio_templates` + columna `template_snapshot` en `studio_images`) y la siembra de los doce diseños. Ninguna de las dos borra ni modifica datos existentes. **Espera un sí explícito.**

- [ ] **Step 2: Aplicar la migración a producción**

Por el MCP, `apply_migration` con `project_id` = `kvmjlrvlnhiarrqxulkr`, mismo archivo `103_studio_templates`.

- [ ] **Step 3: Sembrar los diseños**

```bash
npm run studio:seed produccion
```

- [ ] **Step 4: Generar las miniaturas en producción**

Abre cada diseño en `/studio/plantillas?key=<clave>` **contra producción** y pulsa Guardar, o corre un `update` por MCP solo si la miniatura ya existe en el bucket. La miniatura se sube al bucket del proyecto contra el que apunte la app.

- [ ] **Step 5: Comprobar la paridad de esquema**

```bash
npm run test:schema
```

Esperado: verde. Si el test declara diferencias legítimas entre proyectos, vacía esas listas ahora que los dos están al día.

- [ ] **Step 6: Regenerar los tipos desde producción y pushear**

```bash
npm run types:db && npm run build
```

```bash
git add src/lib/database.types.ts
git commit -m "chore(studio): tipos desde produccion tras la 103"
git push -u origin feat/studio-editor-plantillas
```

Dylan abre el PR.

---

## Notas para quien ejecute

- **Si `test:unit` empieza a tardar más de diez segundos**, algo importó Chromium dentro de `tests/`. Búscalo con `grep -rn "puppeteer\|chromium" tests/`.
- **Si la vista previa y el PNG no coinciden**, no lo arregles en el CSS: es un fallo del contrato. Compara las dos cadenas de `buildTemplateDocument` — deben diferir solo en el bloque `@font-face` y en el transporte de las fotos.
- **Si un render devuelve una imagen en blanco**, casi siempre es una foto que Chrome no pudo cargar porque su URL no era `data:`. El interceptor la abortó, que es exactamente lo que debe hacer.
- **No apliques nunca una migración solo a producción.** Sandbox primero, siempre.
