# Newsletters sin series — Plan de implementación

> **Para ejecutores:** usa `superpowers:subagent-driven-development` (recomendado) o
> `superpowers:executing-plans` para ejecutarlo tarea por tarea. Los pasos llevan
> checkbox (`- [ ]`) para seguimiento.

**Goal:** Retirar la serie como entidad que el usuario ve y administra. Un tenant
tiene UNA newsletter; lo que se crea, edita y publica son ediciones.

**Architecture:** El canal (`acquisition_channels` con `channel_type='newsletter'`)
NO desaparece — se vuelve implícito. Sigue siendo lo que sostiene el formulario de
suscripción, la atribución de leads y el vínculo con la secuencia; simplemente lo
crea el sistema y el usuario nunca lo elige. Eso evita migrar datos y conserva toda
la analítica de fuente. Lo que se elimina es la UI de series, el segmento de serie
en las URLs públicas y el `channelId` de todos los formularios.

**Tech Stack:** Next.js 16 App Router · Supabase (Postgres + RLS) · zod · vitest

**Spec:** `docs/superpowers/specs/2026-08-24-newsletters-design.md` — este plan
**revisa** su §"Serie y edición": donde el spec dice que un tenant puede tener varias
series con público y secuencia propios, ahora hay una sola newsletter por tenant.
El resto del spec (bloques, consentimiento, graduación de suscriptor, verificabilidad)
sigue vigente.

## Global Constraints

- Español neutro latino en todo el copy. Sin emojis en superficies de producto.
- Toda tabla lleva `tenant_id`; todo query va acotado por tenant en código **y** por RLS.
- Toda lista de columnas de un `.select()` se arma con `columns()` (`src/lib/supabase/columns.ts`).
- Toda server action devuelve `{ ok: true, data }` o `{ ok: false, error }` y sale por
  `guarded()` (`src/lib/actions/guarded.ts`). Nunca lanza al cliente.
- Migraciones: **sandbox primero** (`xpaixcowvyksgluazwzn`), producción después y
  **preguntando antes**. Tras aplicar, `npm run types:db:sandbox`.
- Nunca commits directos a `main`. El PR lo abre Dylan.
- Prohibido firmar como IA en commits.
- Verificación por tarea: `npx tsc --noEmit`, `npm run lint`, `npm run test:unit`.

**Contexto que ahorra tiempo:** nada de newsletters está en uso real todavía
(confirmado por Dylan, 2026-08-27). No hay URLs públicas compartidas que preservar,
así que **no hacen falta redirecciones** y las ediciones de prueba del sandbox son
desechables.

---

## Estructura de archivos

### Se crea
| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/110_newsletter_sin_series.sql` | `category` en ediciones, `edition_id` en vistas, índice único del canal por tenant |
| `src/lib/newsletters/channel.ts` | `ensureNewsletterChannel` / `ensureNewsletterSequence` — el canal y la secuencia implícitos |
| `src/lib/newsletters/category.ts` | `NEWSLETTER_CATEGORIES` + etiquetas. Puro, client-safe |
| `src/lib/data/newsletter-stats.ts` | Métricas por edición y totales del tenant |
| `src/app/(hosted)/nl/[tenantSlug]/[editionSlug]/page.tsx` | Edición pública (sustituye a la ruta con serie) |
| `src/app/(dashboard)/newsletters/editions-list.tsx` | La nueva `/newsletters`: tabla de ediciones + estadísticas |
| `src/app/api/newsletters/view/route.ts` | Beacon de vista por edición |

### Se modifica
| Archivo | Cambio |
|---|---|
| `src/lib/data/newsletters.ts` | Fuera `NewsletterSeries` y sus lecturas; `getEditionsForTenant` |
| `src/app/(dashboard)/newsletters/actions.ts` | Fuera las 5 actions de serie; `channelId` sale de los inputs |
| `src/app/(dashboard)/newsletters/page.tsx` | Renderiza `EditionsList` |
| `src/app/(dashboard)/newsletters/nueva/*` | Sin selector de serie |
| `src/app/(dashboard)/newsletters/[id]/*` | Selector de categoría; sin serie |
| `src/app/(dashboard)/newsletters/generate-modal.tsx`, `import-modal.tsx` | Sin selector de serie |
| `src/app/(hosted)/nl/[tenantSlug]/page.tsx` | Archivo + formulario de suscripción, antes en la serie |
| `src/app/(hosted)/nl/[tenantSlug]/shared.ts` | Sin `getPublicSeries*`; rutas de dos segmentos |
| `src/lib/newsletters/revalidate.ts` | Rutas sin serie |
| `src/lib/services/newsletter-integration-prompt.ts` | Contrato sin serie |
| `src/lib/hosted-page.ts` | `hostedNewsletterUrl(tenantSlug, editionSlug?)` |

### Se elimina
- `src/app/(dashboard)/newsletters/serie/` (página y detalle)
- `src/app/(dashboard)/newsletters/series-list.tsx`, `series-modal.tsx`
- `src/app/(hosted)/nl/[tenantSlug]/[seriesSlug]/` (la subcarpeta entera; su
  `subscribe-form.tsx` se **mueve** a `nl/[tenantSlug]/`)

---

### Task 1: Esquema

**Files:**
- Create: `supabase/migrations/110_newsletter_sin_series.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerado, no a mano)
- Create: `src/lib/newsletters/category.ts`
- Test: `tests/newsletters/category.test.ts`

**Interfaces:**
- Produces: `NEWSLETTER_CATEGORIES: readonly NewsletterCategory[]`,
  `type NewsletterCategory = 'informativo' | 'educativo' | 'analisis' | 'anuncio'`,
  `CATEGORY_LABELS: Record<NewsletterCategory, string>`,
  `parseCategory(raw: unknown): NewsletterCategory` (cae a `'informativo'`).

- [ ] **Step 1: Escribe el test de categoría**

```ts
// tests/newsletters/category.test.ts
import { describe, it, expect } from 'vitest'
import {
  NEWSLETTER_CATEGORIES, CATEGORY_LABELS, parseCategory,
} from '@/lib/newsletters/category'

describe('categorías de edición', () => {
  it('toda categoría tiene etiqueta en español', () => {
    for (const c of NEWSLETTER_CATEGORIES) {
      expect(CATEGORY_LABELS[c]).toBeTruthy()
      expect(CATEGORY_LABELS[c]).not.toBe(c)
    }
  })

  it('parseCategory acepta las válidas', () => {
    for (const c of NEWSLETTER_CATEGORIES) expect(parseCategory(c)).toBe(c)
  })

  it('parseCategory cae a informativo ante cualquier basura', () => {
    // La columna es NOT NULL con default: una fila nunca debería traer otra
    // cosa, pero el parse defensivo evita que una fila vieja rompa la lista.
    for (const malo of [null, undefined, '', 'otra', 42, {}]) {
      expect(parseCategory(malo)).toBe('informativo')
    }
  })
})
```

- [ ] **Step 2: Corre el test y confirma que falla**

`npx vitest run tests/newsletters/category.test.ts` → FAIL, módulo no existe.

- [ ] **Step 3: Escribe `src/lib/newsletters/category.ts`**

```ts
// El tipo de una edición. Es una ETIQUETA para el lector, no una estructura:
// no tiene público propio, ni secuencia propia, ni página propia. Si algún día
// necesitara cualquiera de esas tres cosas, habríamos reinventado las series.
//
// Puro y client-safe: lo usan el editor, la lista del CRM y la página pública.

export const NEWSLETTER_CATEGORIES = [
  'informativo', 'educativo', 'analisis', 'anuncio',
] as const

export type NewsletterCategory = typeof NEWSLETTER_CATEGORIES[number]

export const CATEGORY_LABELS: Record<NewsletterCategory, string> = {
  informativo: 'Informativo',
  educativo:   'Educativo',
  analisis:    'Análisis',
  anuncio:     'Anuncio',
}

const VALIDAS = new Set<string>(NEWSLETTER_CATEGORIES)

/** Parse defensivo: una fila nunca debería traer otra cosa, pero si la trae
 *  no puede tumbar la lista entera. */
export function parseCategory(raw: unknown): NewsletterCategory {
  return typeof raw === 'string' && VALIDAS.has(raw)
    ? (raw as NewsletterCategory)
    : 'informativo'
}
```

- [ ] **Step 4: Corre el test y confirma que pasa**

- [ ] **Step 5: Escribe la migración 110**

```sql
-- 110 · Newsletters sin series.
--
-- La serie deja de ser algo que el usuario ve. El canal NO desaparece: sigue
-- sosteniendo el formulario de suscripción, la atribución de leads y el vínculo
-- con la secuencia. Lo que cambia es que lo crea el sistema y hay UNO por
-- tenant. Por eso aquí no se borra nada: se añade el índice que hace imposible
-- un segundo canal de newsletter por tenant, y las dos columnas nuevas.

-- 1) Un solo canal de newsletter por tenant. Parcial, para no estorbar al resto
--    de tipos de canal, y sin tocar los archivados (que ya no cuentan).
create unique index if not exists acquisition_channels_una_newsletter_por_tenant
  on public.acquisition_channels (tenant_id)
  where channel_type = 'newsletter' and archived_at is null;

-- 2) Categoría de la edición: etiqueta para el lector.
alter table public.newsletter_editions
  add column if not exists category text not null default 'informativo';

alter table public.newsletter_editions
  drop constraint if exists newsletter_editions_category_check;
alter table public.newsletter_editions
  add constraint newsletter_editions_category_check
  check (category = any (array['informativo','educativo','analisis','anuncio']));

comment on column public.newsletter_editions.category is
  'Tipo de contenido de la edición, para el lector. No agrupa público ni
   secuencia: eso sería una serie, que es justo lo que esta migración retira.';

-- 3) Vistas por EDICIÓN. channel_page_views ya cuenta vistas por canal, pero
--    con una sola newsletter por tenant ese número deja de decir nada útil:
--    lo que hay que comparar es qué edición se lee. Nullable porque las vistas
--    de los demás canales (lead magnets, eventos) no tienen edición.
alter table public.channel_page_views
  add column if not exists edition_id uuid
  references public.newsletter_editions(id) on delete cascade;

create index if not exists channel_page_views_edition_idx
  on public.channel_page_views (edition_id)
  where edition_id is not null;

-- `anon` escribe vistas por el beacon; necesita poder poner la columna.
grant insert (edition_id) on public.channel_page_views to anon;
```

- [ ] **Step 6: Aplica al sandbox y regenera tipos**

Aplica con el MCP de Supabase sobre `xpaixcowvyksgluazwzn`, luego:
`npm run types:db:sandbox`

Comprueba que `newsletter_editions.category` y `channel_page_views.edition_id`
aparecen en `src/lib/supabase/database.types.ts`.

- [ ] **Step 7: Declara la divergencia en el test de paridad**

En `tests/schema/parity.test.ts`, dentro de `POR_RAMA_EN_CURSO`:

```ts
  // feat/newsletters-sin-series: la 110 está aplicada SÓLO al sandbox, a la
  // espera del permiso para producción. Retirar al aplicarla allí.
  'tabla:newsletter_editions': 'migración 110 (sin series): sólo en sandbox',
  'tabla:channel_page_views':  'migración 110 (sin series): sólo en sandbox',
```

- [ ] **Step 8: Verifica y commitea**

```bash
npx tsc --noEmit && npm run lint && npm run test:unit
git add supabase/migrations/110_newsletter_sin_series.sql src/lib/newsletters/category.ts src/lib/supabase/database.types.ts tests/newsletters/category.test.ts tests/schema/parity.test.ts
git commit -m "feat(newsletters): categoria de edicion y vistas por edicion"
```

---

### Task 2: El canal y la secuencia implícitos

**Files:**
- Create: `src/lib/newsletters/channel.ts`
- Test: `tests/newsletters/channel-slug.test.ts`

**Interfaces:**
- Consumes: `genPublicId` — hoy es privada en `newsletters/actions.ts`; **muévela**
  a `src/lib/newsletters/slug.ts` y expórtala, para que canal y actions usen una sola.
- Produces:
  - `ensureNewsletterChannel(db, tenantId): Promise<{ id: string; publicId: string } | { error: string }>`
  - `ensureNewsletterSequence(db, tenantId, channelId): Promise<string | null>` (id de la secuencia)

- [ ] **Step 1: Escribe el test del slug/publicId**

```ts
// tests/newsletters/channel-slug.test.ts
import { describe, it, expect } from 'vitest'
import { genPublicId } from '@/lib/newsletters/slug'

describe('genPublicId', () => {
  it('cumple el CHECK de la base: ^chn_[a-z0-9]{12}$', () => {
    for (let i = 0; i < 200; i++) {
      expect(genPublicId()).toMatch(/^chn_[a-z0-9]{12}$/)
    }
  })

  it('no repite en 500 tiradas', () => {
    const vistos = new Set(Array.from({ length: 500 }, () => genPublicId()))
    expect(vistos.size).toBe(500)
  })
})
```

- [ ] **Step 2: Corre el test y confirma que falla** (la función aún es privada)

- [ ] **Step 3: Mueve `genPublicId` a `slug.ts` y escribe `channel.ts`**

Corta `genPublicId` de `src/app/(dashboard)/newsletters/actions.ts` (con su
comentario sobre el CHECK), pégala en `src/lib/newsletters/slug.ts` con `export`,
e impórtala de vuelta en `actions.ts`.

```ts
// src/lib/newsletters/channel.ts
import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { genPublicId } from './slug'

// El canal de newsletter de un tenant: implícito, único y creado por el sistema.
//
// Antes el usuario creaba "series" y elegía una al escribir cada edición. Nadie
// pidió varias newsletters —ningún portal inmobiliario las tiene— y el precio
// eran cuatro pasos antes de poder escribir: crear la serie, vincularle una
// secuencia, elegirla al crear la edición, y descubrir que el formulario de
// suscripción no apuntaba a nada hasta hacer todo lo anterior.
//
// El canal se queda porque es lo que sostiene el formulario público, la
// atribución de leads y el vínculo con la secuencia. Lo que se retira es que el
// usuario lo vea. Un índice único parcial (migración 110) garantiza que no
// pueda haber dos.

type AdminClient = ReturnType<typeof createAdminClient>

const CHANNEL_COLUMNS = columns('acquisition_channels', [
  'id', 'public_id', 'email_sequence_id',
])

/** Nombre y slug fijos: el usuario no los elige porque no elige el canal. */
const NOMBRE = 'Newsletter'
const SLUG   = 'newsletter'

/**
 * El canal de newsletter del tenant, creándolo si no existe.
 *
 * Idempotente. La carrera de dos creaciones simultáneas la resuelve el índice
 * único: si el insert choca, se relee — no se propaga el error, porque el
 * resultado que el llamador quería (que el canal exista) se cumplió igual.
 */
export async function ensureNewsletterChannel(
  db: AdminClient,
  tenantId: string,
): Promise<{ id: string; publicId: string; sequenceId: string | null } | { error: string }> {
  const leer = async () => {
    const { data } = await db
      .from('acquisition_channels')
      .select(CHANNEL_COLUMNS)
      .eq('tenant_id', tenantId)
      .eq('channel_type', 'newsletter')
      .is('archived_at', null)
      .maybeSingle()
    return data as { id: string; public_id: string; email_sequence_id: string | null } | null
  }

  const existente = await leer()
  if (existente) {
    return { id: existente.id, publicId: existente.public_id, sequenceId: existente.email_sequence_id }
  }

  const { data, error } = await db.from('acquisition_channels').insert({
    tenant_id:    tenantId,
    public_id:    genPublicId(),
    channel_type: 'newsletter',
    name:         NOMBRE,
    slug:         SLUG,
  }).select(CHANNEL_COLUMNS).maybeSingle()

  if (error || !data) {
    // Choque del índice único = otro request lo creó primero. Releer es la
    // respuesta correcta, no un error.
    const tras = await leer()
    if (tras) return { id: tras.id, publicId: tras.public_id, sequenceId: tras.email_sequence_id }
    return { error: error?.message ?? 'No se pudo preparar tu newsletter.' }
  }

  const fila = data as { id: string; public_id: string; email_sequence_id: string | null }
  return { id: fila.id, publicId: fila.public_id, sequenceId: fila.email_sequence_id }
}

const SEQUENCE_COLUMNS = columns('email_sequences', ['id'])

/**
 * La secuencia de seguimiento de la newsletter, creándola y vinculándola si no
 * la hay. Devuelve su id, o null si no se pudo (best-effort: una edición se
 * puede escribir sin secuencia; lo que no se puede es fallar por esto).
 *
 * Nace VACÍA a propósito y la UI lo dice con un aviso: una secuencia sin pasos
 * no envía nada, y crear correos por nuestra cuenta —con el nombre y la voz de
 * una agencia que no hemos leído— es peor que no crearlos.
 */
export async function ensureNewsletterSequence(
  db: AdminClient,
  tenantId: string,
  channelId: string,
): Promise<string | null> {
  try {
    const { data: canal } = await db
      .from('acquisition_channels')
      .select(columns('acquisition_channels', ['email_sequence_id']))
      .eq('id', channelId).maybeSingle()
    const yaVinculada = (canal as { email_sequence_id: string | null } | null)?.email_sequence_id
    if (yaVinculada) return yaVinculada

    const { data, error } = await db.from('email_sequences').insert({
      tenant_id:       tenantId,
      name:            'Newsletter',
      language:        'es',
      activation_type: 'form',
      active:          true,
    }).select(SEQUENCE_COLUMNS).maybeSingle()
    if (error || !data) return null

    const sequenceId = (data as { id: string }).id
    await db.from('acquisition_channels')
      .update({ email_sequence_id: sequenceId })
      .eq('id', channelId).eq('tenant_id', tenantId)
    return sequenceId
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Corre el test y confirma que pasa**

- [ ] **Step 5: Verifica el canal implícito contra el sandbox**

Script desechable en la raíz del repo (bórralo después):

```js
// tmp-canal.mjs — comprueba idempotencia contra el sandbox
import fs from 'node:fs'; import ws from 'ws'
const env = {}
for (const l of fs.readFileSync('.env.development.local','utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g,'')
}
const { createClient } = await import('@supabase/supabase-js')
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth:{autoRefreshToken:false,persistSession:false}, realtime:{transport:ws} })
const { data } = await db.from('acquisition_channels')
  .select('id, public_id, email_sequence_id')
  .eq('tenant_id','tenant-tenant-test').eq('channel_type','newsletter').is('archived_at',null)
console.log('canales de newsletter del tenant:', data?.length, JSON.stringify(data))
```

Espera: **exactamente 1** (el índice único lo garantiza). Si hay más de uno de
antes, archiva los sobrantes a mano antes de seguir — el índice es parcial sobre
`archived_at is null`, así que archivar basta.

- [ ] **Step 6: Commitea**

```bash
git add src/lib/newsletters/channel.ts src/lib/newsletters/slug.ts "src/app/(dashboard)/newsletters/actions.ts" tests/newsletters/channel-slug.test.ts
git commit -m "feat(newsletters): canal y secuencia implicitos por tenant"
```

---

### Task 3: La capa de datos deja de hablar de series

**Files:**
- Modify: `src/lib/data/newsletters.ts`
- Create: `src/lib/data/newsletter-stats.ts`
- Test: `tests/newsletters/stats.test.ts`

**Interfaces:**
- Produces:
  - `getEditionsForTenant(tenantId): Promise<NewsletterEdition[]>` — todas, cualquier estado, más reciente primero.
  - `NewsletterEdition` gana `category: NewsletterCategory`.
  - `getNewsletterStats(tenantId): Promise<{ totals: NewsletterTotals; byEdition: Map<string, EditionStats> }>`
  - `interface EditionStats { views: number; subscribers: number }`
  - `interface NewsletterTotals { subscribers: number; published: number; drafts: number; views: number }`
- Se eliminan: `NewsletterSeries`, `getSeriesForTenant`, `getArchivedSeriesForTenant`,
  `getSeriesById`, `getEditionsForSeries`.

- [ ] **Step 1: Escribe el test de agregación pura**

Extrae la agregación a una función pura para poder probarla sin base:

```ts
// tests/newsletters/stats.test.ts
import { describe, it, expect } from 'vitest'
import { aggregateStats } from '@/lib/data/newsletter-stats'

describe('aggregateStats', () => {
  const ediciones = [
    { id: 'e1', status: 'published' as const },
    { id: 'e2', status: 'published' as const },
    { id: 'e3', status: 'draft' as const },
  ]

  it('cuenta vistas por edición y en total', () => {
    const r = aggregateStats(ediciones, [
      { edition_id: 'e1' }, { edition_id: 'e1' }, { edition_id: 'e2' },
    ], [])
    expect(r.byEdition.get('e1')?.views).toBe(2)
    expect(r.byEdition.get('e2')?.views).toBe(1)
    expect(r.byEdition.get('e3')?.views).toBe(0)
    expect(r.totals.views).toBe(3)
  })

  it('no cuenta vistas de ediciones que ya no existen', () => {
    // El FK es ON DELETE CASCADE, así que no debería pasar — pero una vista
    // huérfana no puede inflar el total del tenant.
    const r = aggregateStats(ediciones, [{ edition_id: 'borrada' }], [])
    expect(r.totals.views).toBe(0)
  })

  it('atribuye suscriptores a la edición que los captó', () => {
    const r = aggregateStats(ediciones, [], [
      { edition_id: 'e1' }, { edition_id: null }, { edition_id: 'e1' },
    ])
    expect(r.byEdition.get('e1')?.subscribers).toBe(2)
    // El de edition_id null se suscribió desde la portada: cuenta en el total
    // del tenant, no en ninguna edición.
    expect(r.totals.subscribers).toBe(3)
  })

  it('separa publicadas de borradores', () => {
    const r = aggregateStats(ediciones, [], [])
    expect(r.totals.published).toBe(2)
    expect(r.totals.drafts).toBe(1)
  })
})
```

- [ ] **Step 2: Corre el test y confirma que falla**

- [ ] **Step 3: Escribe `newsletter-stats.ts`**

`aggregateStats(editions, views, subscribers)` pura + `getNewsletterStats(tenantId)`
que lee y delega. Las lecturas:
- vistas: `channel_page_views` del tenant con `edition_id not null`
- suscriptores: `leads` del tenant con `acquisition_channel_id = <canal>`, leyendo
  `metadata->'newsletter_subscriber'->>'edition_id'` como `edition_id`
- ediciones: `newsletter_editions` del tenant (`id`, `status`)

Sólo `archived` queda fuera de `drafts` y `published`.

- [ ] **Step 4: Corre el test y confirma que pasa**

- [ ] **Step 5: Reescribe `src/lib/data/newsletters.ts`**

Borra `NewsletterSeries`, `listSeries`, `getSeriesForTenant`,
`getArchivedSeriesForTenant`, `getSeriesById`, `getEditionsForSeries`.
Añade `category` a `EDITION_COLUMNS` y a `mapEdition` (vía `parseCategory`).
Añade:

```ts
export async function getEditionsForTenant(tenantId: string): Promise<NewsletterEdition[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('newsletter_editions')
    .select(EDITION_COLUMNS)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  // reason: el cliente de Supabase no está tipado en este repo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map(mapEdition)
}
```

- [ ] **Step 6: Verifica y commitea**

`npx tsc --noEmit` fallará en todos los consumidores de series — es lo esperado;
se arreglan en las tareas 4–6. **No commitees con `tsc` roja**: haz esta tarea y
la 4 en el mismo commit si hace falta, o deja los consumidores compilando con
`getEditionsForTenant` antes de borrar lo viejo.

---

### Task 4: Las actions pierden `channelId`

**Files:**
- Modify: `src/app/(dashboard)/newsletters/actions.ts`
- Test: `tests/newsletters/import-shape.test.ts` (nuevo)

**Interfaces:**
- Se eliminan: `createSeries`, `updateSeries`, `archiveSeries`, `restoreSeries`,
  `deleteSeries`, `getSeriesIntegrationPrompt` (vuelve como `getNewsletterIntegrationPrompt()`
  sin argumentos en la Task 8).
- Cambian de firma (fuera `channelId`):
  - `createEdition(input)` — `EditionInput` sin `channelId`
  - `createEditionFromJson({ json })`
  - `generateEditionWithAi({ topic, language })`
- `EditionInput` gana `category: z.enum(NEWSLETTER_CATEGORIES)`.

- [ ] **Step 1: Escribe el test de la forma de importación sin serie**

```ts
// tests/newsletters/import-shape.test.ts
import { describe, it, expect } from 'vitest'
import { buildImportPrompt } from '@/lib/newsletters/import-prompt'

describe('el prompt de importación no pide serie', () => {
  it('no menciona series ni channelId', () => {
    const p = buildImportPrompt()
    expect(p).not.toMatch(/serie/i)
    expect(p).not.toContain('channelId')
  })

  it('sí documenta la categoría', () => {
    expect(buildImportPrompt()).toContain('"category"')
  })
})
```

- [ ] **Step 2: Corre el test y confirma que falla**

- [ ] **Step 3: Aplica los cambios**

En cada action que creaba una edición, sustituye
`resolveEditionChannel(g.db, g.tenantId, d.channelId)` por:

```ts
  const canal = await ensureNewsletterChannel(g.db, g.tenantId)
  if ('error' in canal) return { ok: false, error: canal.error }
  // La secuencia se prepara aquí y no al suscribirse: así el usuario la ve en
  // /emails desde su primera edición y puede escribirle los correos antes de
  // que llegue nadie. Best-effort: sin secuencia se puede escribir igual.
  await ensureNewsletterSequence(g.db, g.tenantId, canal.id)
```

Y `revalidateAll(g.tenantSlug)` — sin slug de serie (ver Task 5).

Borra `resolveEditionChannel`, las cinco actions de serie, `SERIES_STATE_COLUMNS`,
`SeriesRow`, `loadSeriesForWrite`, `SeriesInput`, `ownerAgentFor`.
Añade `category` a `EditionInput` y al `ImportedEdition` (opcional, default
`'informativo'`), y documéntala en `buildImportPrompt`.

- [ ] **Step 4: Corre el test y confirma que pasa**

- [ ] **Step 5: Verifica y commitea**

```bash
npx tsc --noEmit && npm run lint && npm run test:unit
git commit -am "feat(newsletters): las ediciones ya no eligen serie"
```

---

### Task 5: Las URLs públicas pierden el segmento de serie

**Files:**
- Create: `src/app/(hosted)/nl/[tenantSlug]/[editionSlug]/page.tsx`
- Move: `nl/[tenantSlug]/[seriesSlug]/subscribe-form.tsx` → `nl/[tenantSlug]/subscribe-form.tsx`
- Delete: `src/app/(hosted)/nl/[tenantSlug]/[seriesSlug]/` (carpeta completa)
- Modify: `nl/[tenantSlug]/page.tsx`, `nl/[tenantSlug]/shared.ts`,
  `src/lib/newsletters/revalidate.ts`, `src/lib/hosted-page.ts`
- Test: `tests/newsletters/hosted-url.test.ts` (ya existe — actualízalo)

**Interfaces:**
- `hostedNewsletterUrl(tenantSlug: string, editionSlug?: string): string`
- `getPublicEditions(tenantId): Promise<PublicEdition[]>` — sin `channelId`
- Se eliminan de `shared.ts`: `getPublicSeries`, `getPublicSeriesList`, `getPublicSeriesPaths`

- [ ] **Step 1: Actualiza el test de URLs**

```ts
// tests/newsletters/hosted-url.test.ts
import { describe, it, expect } from 'vitest'
import { hostedNewsletterUrl } from '@/lib/hosted-page'

describe('hostedNewsletterUrl', () => {
  it('la portada de la newsletter del tenant', () => {
    expect(hostedNewsletterUrl('aj-real-estate'))
      .toBe('https://news.itmano.com/aj-real-estate')
  })

  it('una edición cuelga directamente del tenant, sin serie', () => {
    expect(hostedNewsletterUrl('aj-real-estate', 'mercado-agosto'))
      .toBe('https://news.itmano.com/aj-real-estate/mercado-agosto')
  })
})
```

- [ ] **Step 2: Corre el test y confirma que falla**

- [ ] **Step 3: Aplica los cambios**

`hosted-page.ts`: la función pasa a dos argumentos.

`shared.ts`: borra las tres funciones de serie. `getPublicNewsletterPaths()` devuelve
`{ tenantSlug, editionSlug }`. `getPublicEditions(tenantId)` pierde el parámetro
`channelId` (con una sola newsletter por tenant, filtrar por canal sobra).

`nl/[tenantSlug]/page.tsx`: pasa a ser el archivo completo — lista de ediciones
publicadas **más el formulario de suscripción** (que antes vivía en la serie).
Su `generateStaticParams` sale de `getPublicTenantSlugs()`.

`nl/[tenantSlug]/[editionSlug]/page.tsx`: copia de la ruta de tres segmentos
quitando la resolución de serie, con `generateStaticParams` desde
`getPublicNewsletterPaths()`.

`revalidate.ts`: quita la resolución de slug de canal; las rutas son
`/nl/<tenant>` y `/nl/<tenant>/<edicion>`.

- [ ] **Step 4: Corre el test y confirma que pasa**

- [ ] **Step 5: Verifica el build y las rutas**

```bash
npm run build
```

Espera en la tabla de rutas: `● /nl/[tenantSlug]` y `● /nl/[tenantSlug]/[editionSlug]`,
y **ninguna** `[seriesSlug]`.

- [ ] **Step 6: Commitea**

```bash
git commit -am "feat(newsletters): las ediciones cuelgan del tenant, sin serie"
```

---

### Task 6: `/newsletters` pasa a ser la lista de ediciones con estadísticas

**Files:**
- Create: `src/app/(dashboard)/newsletters/editions-list.tsx`
- Modify: `src/app/(dashboard)/newsletters/page.tsx`
- Delete: `series-list.tsx`, `series-modal.tsx`, `serie/` (carpeta completa)

**Interfaces:**
- Consumes: `getEditionsForTenant`, `getNewsletterStats`, `CATEGORY_LABELS`
- Produces: `<EditionsList editions stats tenantSlug sequenceId canWrite myUserId isAgent />`

- [ ] **Step 1: Escribe `editions-list.tsx`**

Una tabla, una fila por edición, con columnas: **Titular** (enlaza al editor),
**Categoría**, **Estado**, **Fecha**, **Vistas**, **Suscriptores**, y las acciones
que hoy viven en `series-detail.tsx` (Ver, Editar, Despublicar, Archivar,
Restaurar, Eliminar) — **muévelas tal cual**, incluidos sus `ConfirmDialog`.

Arriba, una tira de totales: suscriptores, ediciones publicadas, borradores, vistas.

Bajo la tira, y sólo si la secuencia vinculada no tiene pasos, el aviso:

> Tu secuencia **Newsletter** todavía no tiene correos, así que quien se
> suscriba no recibirá nada. [Añadir el primero →](/emails/<sequenceId>)

- [ ] **Step 2: Reescribe `page.tsx`**

Llama a `ensureNewsletterChannel` + `ensureNewsletterSequence` antes de leer: así
la newsletter existe desde la primera visita y el formulario público responde sin
que el usuario haya hecho nada.

- [ ] **Step 3: Borra lo viejo**

```bash
git rm -r "src/app/(dashboard)/newsletters/serie"
git rm "src/app/(dashboard)/newsletters/series-list.tsx" "src/app/(dashboard)/newsletters/series-modal.tsx"
```

- [ ] **Step 4: Verifica en el navegador**

Levanta el preview, entra con `/api/dev/login`, abre `/newsletters`. Comprueba:
lista de ediciones con sus columnas, la tira de totales, el aviso de secuencia
vacía, y que archivar → eliminar sigue funcionando.

- [ ] **Step 5: Commitea**

```bash
npx tsc --noEmit && npm run lint && npm run test:unit
git commit -am "feat(newsletters): la portada del CRM lista ediciones con sus estadisticas"
```

---

### Task 7: Vistas por edición

**Files:**
- Create: `src/app/api/newsletters/view/route.ts`
- Modify: `src/app/(hosted)/nl/[tenantSlug]/[editionSlug]/page.tsx` (beacon)
- Test: `tests/newsletters/view-beacon.test.ts`

**Interfaces:**
- `POST /api/newsletters/view` · body `text/plain` con JSON `{ editionId }`
- Responde `200` siempre (un beacon no se puede reintentar; ver `intake/[publicId]/view`)

- [ ] **Step 1: Escribe el test del validador del beacon**

```ts
// tests/newsletters/view-beacon.test.ts
import { describe, it, expect } from 'vitest'
import { parseViewPayload } from '@/app/api/newsletters/view/payload'

describe('parseViewPayload', () => {
  it('acepta un uuid de edición', () => {
    expect(parseViewPayload('{"editionId":"7f1c1e2a-0000-4000-8000-000000000001"}'))
      .toBe('7f1c1e2a-0000-4000-8000-000000000001')
  })

  it('rechaza cualquier otra cosa sin lanzar', () => {
    // El beacon no se puede reintentar: un payload roto se descarta en
    // silencio, nunca tumba el request.
    for (const malo of ['', 'no-json', '{}', '{"editionId":"x"}', '{"editionId":null}']) {
      expect(parseViewPayload(malo)).toBeNull()
    }
  })
})
```

- [ ] **Step 2: Corre el test y confirma que falla**

- [ ] **Step 3: Escribe `payload.ts` y `route.ts`**

El handler resuelve `tenant_id` y `channel_id` **desde la edición**, no del cliente:
lo que llega de fuera es sólo el id de la edición. Inserta en `channel_page_views`
con `edition_id`, reutilizando el `visitor_fingerprint` de la ruta hermana.

- [ ] **Step 4: Corre el test y confirma que pasa**

- [ ] **Step 5: Añade el beacon a la página pública de la edición**

Componente cliente mínimo con `navigator.sendBeacon` en un `useEffect`, igual que
`hosted-form.tsx:102`. `text/plain` para no disparar preflight.

- [ ] **Step 6: Verifica contra el sandbox**

Abre una edición publicada en el preview y comprueba la fila:

```sql
select edition_id, count(*) from channel_page_views
where edition_id is not null group by edition_id;
```

- [ ] **Step 7: Commitea**

```bash
git commit -am "feat(newsletters): vistas por edicion"
```

---

### Task 8: Prompt de integración y limpieza final

**Files:**
- Modify: `src/lib/services/newsletter-integration-prompt.ts`
- Modify: `tests/newsletters/integration-prompt.test.ts`
- Modify: `src/app/(dashboard)/newsletters/actions.ts` (`getNewsletterIntegrationPrompt`)
- Modify: `CLAUDE.md`, `docs/superpowers/specs/2026-08-24-newsletters-design.md`

**Interfaces:**
- `getNewsletterIntegrationPrompt(): Promise<Result<{ prompt: string }>>` — sin argumentos
- `buildNewsletterIntegrationPrompt` pierde `seriesName`; `archiveUrl` es la del tenant

- [ ] **Step 1: Actualiza el test del prompt**

Sustituye las aserciones que mencionan la serie por:

```ts
  it('no menciona series', () => {
    expect(buildNewsletterIntegrationPrompt(BASE)).not.toMatch(/serie/i)
  })

  it('el endpoint usa el public_id de la newsletter del tenant', () => {
    expect(buildNewsletterIntegrationPrompt(BASE))
      .toContain('POST https://app.itmano.com/api/intake/chn_abc123def456/submit')
  })
```

- [ ] **Step 2: Corre el test y confirma que falla**

- [ ] **Step 3: Aplica los cambios**

El botón "Integración" se mueve de `series-detail.tsx` (borrado) a la cabecera de
`editions-list.tsx`. La sección de lectura pública del prompt añade `category` a
las columnas documentadas.

- [ ] **Step 4: Corre el test y confirma que pasa**

- [ ] **Step 5: Actualiza la documentación**

En `CLAUDE.md`, la fila de la tabla "Antes de tocar cada dominio" y cualquier
mención a series. En el spec, marca la sección de series como **superada por
`docs/superpowers/plans/2026-08-27-newsletters-sin-series.md`** con la fecha.

- [ ] **Step 6: Verificación completa**

```bash
npx tsc --noEmit && npm run lint && npm run test:unit && npm run build
```

- [ ] **Step 7: Commitea y pushea**

```bash
git commit -am "docs(newsletters): el modelo sin series"
git push origin feat/newsletters-sin-series
```

---

## Fuera de alcance

- **Migración de datos.** No hay contenido real en producción (Dylan, 2026-08-27).
  Si al aplicar la 110 a producción hubiera más de una serie viva por tenant, el
  índice único fallará: archiva las sobrantes antes.
- **Redirecciones de URLs viejas.** Nada se publicó.
- **Correos iniciales de la secuencia.** Nace vacía y la UI lo dice.
- **Sustituir la categoría por algo con público propio.** Si alguna vez lo pide,
  eso son series otra vez y hay que discutirlo, no implementarlo.

## Decisiones que necesitan tu visto bueno antes de la Task 1

1. **Las cuatro categorías**: informativo · educativo · análisis · anuncio.
2. **La secuencia nace vacía** con aviso en pantalla, en vez de generarle correos.
3. **`aggregateStats` atribuye el suscriptor a la edición desde la que se suscribió**
   (requiere que el formulario mande el `editionId`); quien se suscriba desde la
   portada cuenta sólo en el total del tenant.
