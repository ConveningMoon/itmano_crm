# Newsletters — Plan 1: fundamentos, publicación y captación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un tenant pueda crear una serie de newsletter, escribir y publicar una edición a mano, verla en `news.itmano.com`, y que quien se suscriba entre al CRM como lead inscrito en la secuencia vinculada sin contaminar las bandas de calidad.

**Architecture:** La serie es una fila de `acquisition_channels` con `channel_type = 'newsletter'`, así que la vinculación a secuencia, el routing de agente y la analítica de fuente ya existen. Las ediciones viven en una tabla nueva `newsletter_editions` con el cuerpo en bloques JSON validados por zod; el HTML lo compila el servidor en cada render y nunca se guarda. El suscriptor se marca en `metadata` siguiendo el patrón de `is_imported` (migración 080) y se excluye del cálculo de quintiles.

**Tech Stack:** Next.js 16.2 (App Router, Server Components, Server Actions) · React 19.2 · TypeScript strict · Supabase (Postgres + RLS + Storage) · zod · Vitest.

**Spec:** `docs/superpowers/specs/2026-08-24-newsletters-design.md`

**Nota de alcance:** este es el **Plan 1 de 2**. La generación con IA (investigación con `web_search` restringida, redacción con salida estructurada, y el formato 16:9 del Estudio) va en el Plan 2, que se escribe cuando este cierre — depende de interfaces que este plan fija (`NewsletterContent`, el data layer y la validación de publicación) y merece su propio ciclo de revisión. Al terminar este plan el sistema funciona entero sin IA.

## Global Constraints

- **Nunca commits directos a `main`.** Este trabajo va en `feat/newsletters`.
- **Prohibido firmar como IA** en cualquier commit: nada de `Co-Authored-By: Claude`, "generated with", ni emojis.
- **Commits en español**, convencionales (`feat:`, `fix:`, `docs:`), cortos, un cambio lógico cada uno.
- **Migraciones: sandbox primero** (`xpaixcowvyksgluazwzn`), producción después y **preguntando antes**. Producción es `kvmjlrvlnhiarrqxulkr` y tiene datos reales de un cliente.
- **Toda lista de columnas de un `.select()` se arma con `columns()`** de `src/lib/supabase/columns.ts`. Nunca un string suelto.
- **Nada de queries de Supabase desde el cliente.** Server Components hacen fetch, Client Components reciben props.
- **Server Actions siempre devuelven** `{ ok: true, data }` o `{ ok: false, error }`. Nunca lanzan al cliente.
- **Validar con zod** antes de tocar la base.
- **Nunca hardcodear colores hex.** CSS variables de `src/app/globals.css`.
- **TypeScript strict**: nada de `any` sin un comentario `// reason:`.
- **Copy de producto**: español neutro latino, "inversión" nunca "costo/precio/pago", sin emojis, estados vacíos serios.
- Tras cada tarea: `npm run lint` y `npx tsc --noEmit`.
- Tras cualquier migración: `npm run types:db:sandbox`.

---

### Task 1: Contrato de contenido — `NewsletterContentSchema`

Puro, client-safe, sin dependencias de servidor. Es el cimiento: todo lo demás consume estos tipos.

**Files:**
- Create: `src/lib/newsletters/content.ts`
- Test: `tests/newsletters/content.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `NEWSLETTER_CONTENT_VERSION`, `NewsletterContentSchema`, `NewsletterContent`, `NewsletterBlock`, `NewsletterSource`, `NewsletterSourceSchema`, `parseNewsletterContent(raw: unknown): NewsletterContent | null`, `parseNewsletterSources(raw: unknown): NewsletterSource[]`.

- [ ] **Step 1: Crear la carpeta de tests y escribir el test que falla**

```ts
// tests/newsletters/content.test.ts
import { describe, it, expect } from 'vitest'
import {
  NewsletterContentSchema, parseNewsletterContent, parseNewsletterSources,
  NEWSLETTER_CONTENT_VERSION,
} from '@/lib/newsletters/content'

const heading = { type: 'heading', level: 2, text: 'El mercado en agosto' } as const
const stat    = { type: 'stat', label: 'Precio medio', value: '$385.000', sourceIds: ['s1'] } as const

describe('NewsletterContentSchema', () => {
  it('acepta un documento con todos los tipos de bloque', () => {
    const doc = {
      v: NEWSLETTER_CONTENT_VERSION,
      blocks: [
        heading,
        { type: 'paragraph', text: 'Los precios subieron.', sourceIds: ['s1'] },
        { type: 'list', style: 'bullet', items: ['uno', 'dos'] },
        { type: 'image', url: 'https://x.test/a.png', alt: 'Una casa' },
        { type: 'quote', text: 'Citado', attribution: 'NAR' },
        { type: 'callout', tone: 'info', text: 'Ojo con esto' },
        stat,
      ],
    }
    expect(NewsletterContentSchema.safeParse(doc).success).toBe(true)
  })

  it('rechaza un stat sin fuentes', () => {
    const doc = { v: NEWSLETTER_CONTENT_VERSION, blocks: [{ ...stat, sourceIds: [] }] }
    expect(NewsletterContentSchema.safeParse(doc).success).toBe(false)
  })

  it('rechaza una version desconocida', () => {
    expect(NewsletterContentSchema.safeParse({ v: 99, blocks: [heading] }).success).toBe(false)
  })

  it('rechaza un documento sin bloques', () => {
    expect(NewsletterContentSchema.safeParse({ v: NEWSLETTER_CONTENT_VERSION, blocks: [] }).success).toBe(false)
  })

  it('parseNewsletterContent devuelve null ante basura en vez de lanzar', () => {
    expect(parseNewsletterContent(null)).toBeNull()
    expect(parseNewsletterContent({ v: 1 })).toBeNull()
    expect(parseNewsletterContent('texto suelto')).toBeNull()
  })
})

describe('parseNewsletterSources', () => {
  it('acepta fuentes validas y descarta las rotas', () => {
    const parsed = parseNewsletterSources([
      { id: 's1', url: 'https://nar.realtor/x', title: 'Informe', publisher: 'NAR', accessed_at: '2026-08-24' },
      { id: 's2', url: 'no-es-una-url', title: 'Rota', publisher: 'X', accessed_at: '2026-08-24' },
    ])
    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe('s1')
  })

  it('devuelve lista vacia ante basura', () => {
    expect(parseNewsletterSources(null)).toEqual([])
    expect(parseNewsletterSources({ nope: true })).toEqual([])
  })
})
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run tests/newsletters/content.test.ts`
Esperado: FAIL — "Failed to resolve import @/lib/newsletters/content".

- [ ] **Step 3: Escribir la implementación mínima**

```ts
// src/lib/newsletters/content.ts
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

const text = (max: number) => z.string().trim().min(1).max(max)

const HeadingBlock = z.object({
  type: z.literal('heading'), level: z.union([z.literal(2), z.literal(3)]), text: text(200),
})
const ParagraphBlock = z.object({
  type: z.literal('paragraph'), text: text(4000), sourceIds: z.array(z.string()).max(8).optional(),
})
const ListBlock = z.object({
  type: z.literal('list'), style: z.enum(['bullet', 'number']),
  items: z.array(text(400)).min(1).max(20),
})
const ImageBlock = z.object({
  type: z.literal('image'), url: z.string().url(), alt: text(200), caption: z.string().trim().max(300).optional(),
})
const QuoteBlock = z.object({
  type: z.literal('quote'), text: text(600), attribution: z.string().trim().max(160).optional(),
})
const CalloutBlock = z.object({
  type: z.literal('callout'), tone: z.enum(['info', 'warning']), text: text(600),
})
// El único bloque cuyas fuentes son OBLIGATORIAS: un dato numérico sin respaldo
// es exactamente lo que este sistema existe para impedir.
const StatBlock = z.object({
  type: z.literal('stat'), label: text(80), value: text(40),
  sourceIds: z.array(z.string()).min(1).max(8),
})

export const NewsletterBlockSchema = z.discriminatedUnion('type', [
  HeadingBlock, ParagraphBlock, ListBlock, ImageBlock, QuoteBlock, CalloutBlock, StatBlock,
])

export const NewsletterContentSchema = z.object({
  v:      z.literal(NEWSLETTER_CONTENT_VERSION),
  blocks: z.array(NewsletterBlockSchema).min(1, 'La edición necesita al menos un bloque').max(200),
})

export const NewsletterSourceSchema = z.object({
  id:           z.string().trim().min(1).max(40),
  url:          z.string().url(),
  title:        text(300),
  publisher:    z.string().trim().max(160).default(''),
  published_at: z.string().trim().max(30).optional(),
  accessed_at:  z.string().trim().max(30),
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
```

- [ ] **Step 4: Ejecutar el test para verificar que pasa**

Run: `npx vitest run tests/newsletters/content.test.ts`
Esperado: PASS, 7 tests.

- [ ] **Step 5: Añadir la suite a `test:unit`**

En `package.json`, en el script `test:unit`, añadir ` tests/newsletters` al final de la lista de rutas (antes del cierre de comillas).

- [ ] **Step 6: Verificar tipos y lint**

Run: `npx tsc --noEmit && npm run lint`
Esperado: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/lib/newsletters/content.ts tests/newsletters/content.test.ts package.json
git commit -m "feat(newsletters): contrato de contenido en bloques"
```

---

### Task 2: Validación de publicación

La regla dura del spec §3.4 vive aquí, pura y testeable sola: sin portada no se publica, y un `stat` cuyas fuentes no existan tampoco.

**Files:**
- Create: `src/lib/newsletters/publishable.ts`
- Test: `tests/newsletters/publishable.test.ts`

**Interfaces:**
- Consumes: `NewsletterContent`, `NewsletterSource` de Task 1.
- Produces: `type PublishBlocker = { code: 'no_cover' | 'no_title' | 'stat_sin_fuente' | 'fuente_inexistente' | 'contenido_invalido'; detail: string }`, `publishBlockers(input: PublishableInput): PublishBlocker[]`, `type PublishableInput = { title: string; coverImageUrl: string | null; content: NewsletterContent | null; sources: NewsletterSource[] }`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// tests/newsletters/publishable.test.ts
import { describe, it, expect } from 'vitest'
import { publishBlockers } from '@/lib/newsletters/publishable'
import { NEWSLETTER_CONTENT_VERSION } from '@/lib/newsletters/content'

const fuente = {
  id: 's1', url: 'https://nar.realtor/x', title: 'Informe', publisher: 'NAR', accessed_at: '2026-08-24',
}
const contenidoOk = {
  v: NEWSLETTER_CONTENT_VERSION,
  blocks: [{ type: 'stat', label: 'Precio medio', value: '$385.000', sourceIds: ['s1'] }],
} as const

const base = {
  title: 'El mercado en agosto',
  coverImageUrl: 'https://x.test/portada.png',
  content: contenidoOk,
  sources: [fuente],
}

describe('publishBlockers', () => {
  it('no bloquea una edicion completa', () => {
    expect(publishBlockers(base)).toEqual([])
  })

  it('bloquea sin portada', () => {
    const codes = publishBlockers({ ...base, coverImageUrl: null }).map(b => b.code)
    expect(codes).toContain('no_cover')
  })

  it('bloquea sin titulo', () => {
    const codes = publishBlockers({ ...base, title: '   ' }).map(b => b.code)
    expect(codes).toContain('no_title')
  })

  it('bloquea un stat cuya fuente no existe en sources', () => {
    const blockers = publishBlockers({ ...base, sources: [] })
    expect(blockers.map(b => b.code)).toContain('fuente_inexistente')
    expect(blockers[0].detail).toContain('Precio medio')
  })

  it('bloquea con contenido invalido', () => {
    const codes = publishBlockers({ ...base, content: null }).map(b => b.code)
    expect(codes).toContain('contenido_invalido')
  })

  it('acumula varios bloqueos a la vez', () => {
    expect(publishBlockers({ title: '', coverImageUrl: null, content: null, sources: [] }).length)
      .toBeGreaterThanOrEqual(3)
  })

  it('un paragraph con sourceId inexistente tambien bloquea', () => {
    const content = {
      v: NEWSLETTER_CONTENT_VERSION,
      blocks: [{ type: 'paragraph', text: 'Dato suelto', sourceIds: ['fantasma'] }],
    } as const
    const codes = publishBlockers({ ...base, content }).map(b => b.code)
    expect(codes).toContain('fuente_inexistente')
  })
})
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run tests/newsletters/publishable.test.ts`
Esperado: FAIL — módulo no encontrado.

- [ ] **Step 3: Escribir la implementación**

```ts
// src/lib/newsletters/publishable.ts
import type { NewsletterContent, NewsletterSource } from './content'

// Qué impide publicar una edición. Puro y client-safe: el editor pinta estos
// bloqueos mientras se escribe y la server action los vuelve a evaluar antes de
// escribir en la base. Las dos puertas usan ESTA función — un check de UI que el
// servidor no repite no es un check.

export interface PublishableInput {
  title:         string
  coverImageUrl: string | null
  content:       NewsletterContent | null
  sources:       NewsletterSource[]
}

export interface PublishBlocker {
  code:   'no_cover' | 'no_title' | 'stat_sin_fuente' | 'fuente_inexistente' | 'contenido_invalido'
  detail: string
}

export function publishBlockers(input: PublishableInput): PublishBlocker[] {
  const blockers: PublishBlocker[] = []

  if (!input.title.trim()) {
    blockers.push({ code: 'no_title', detail: 'La edición necesita un titular.' })
  }
  // La portada es obligatoria también en el esquema (NOT NULL). Aquí se
  // comprueba para dar el motivo antes de que la base lo rechace.
  if (!input.coverImageUrl) {
    blockers.push({ code: 'no_cover', detail: 'La edición necesita una imagen de portada.' })
  }
  if (!input.content) {
    blockers.push({ code: 'contenido_invalido', detail: 'El contenido no es válido o está vacío.' })
    return blockers
  }

  const known = new Set(input.sources.map(s => s.id))

  for (const block of input.content.blocks) {
    if (block.type === 'stat') {
      if (block.sourceIds.length === 0) {
        blockers.push({ code: 'stat_sin_fuente', detail: `El dato "${block.label}" no tiene fuente.` })
        continue
      }
      for (const id of block.sourceIds) {
        if (!known.has(id)) {
          blockers.push({
            code: 'fuente_inexistente',
            detail: `El dato "${block.label}" cita una fuente que ya no existe.`,
          })
        }
      }
    }
    if (block.type === 'paragraph' && block.sourceIds) {
      for (const id of block.sourceIds) {
        if (!known.has(id)) {
          blockers.push({
            code: 'fuente_inexistente',
            detail: 'Un párrafo cita una fuente que ya no existe.',
          })
        }
      }
    }
  }

  return blockers
}
```

- [ ] **Step 4: Ejecutar el test para verificar que pasa**

Run: `npx vitest run tests/newsletters/publishable.test.ts`
Esperado: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/newsletters/publishable.ts tests/newsletters/publishable.test.ts
git commit -m "feat(newsletters): validacion de publicacion"
```

---

### Task 3: Acceso, feature de plan y navegación

**Files:**
- Create: `src/lib/access/newsletters.ts`
- Modify: `src/lib/plans.ts` (interfaz `PlanFeatures` línea ~43 y los tres bloques `features`)
- Modify: `src/components/layout/nav-items.ts`
- Modify: `src/app/(marketing)/planes/page.tsx` (tabla comparativa)
- Test: `tests/access/newsletters.test.ts`

**Interfaces:**
- Consumes: `TenantRole` de `@/lib/auth/tenant-context`, `SubscriptionPlan` y `PLANS` de `@/lib/plans`.
- Produces: `canUseNewsletters(user: { role: TenantRole }, plan: SubscriptionPlan): boolean`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// tests/access/newsletters.test.ts
import { describe, it, expect } from 'vitest'
import { canUseNewsletters } from '@/lib/access/newsletters'
import { PLANS } from '@/lib/plans'

describe('canUseNewsletters', () => {
  it('growth y partner tienen la feature; esencial no', () => {
    expect(PLANS.esencial.features.newsletters).toBe(false)
    expect(PLANS.growth.features.newsletters).toBe(true)
    expect(PLANS.partner.features.newsletters).toBe(true)
  })

  it('los roles de tenant pueden usarla en un plan que la incluye', () => {
    expect(canUseNewsletters({ role: 'agent_owner' }, 'growth')).toBe(true)
    expect(canUseNewsletters({ role: 'agent' }, 'growth')).toBe(true)
  })

  it('ningun rol la usa en un plan que no la incluye', () => {
    expect(canUseNewsletters({ role: 'agent_owner' }, 'esencial')).toBe(false)
    expect(canUseNewsletters({ role: 'agent' }, 'esencial')).toBe(false)
  })

  it('super_admin la usa siempre, tambien en esencial', () => {
    expect(canUseNewsletters({ role: 'super_admin' }, 'esencial')).toBe(true)
  })
})
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run tests/access/newsletters.test.ts`
Esperado: FAIL — módulo no encontrado.

- [ ] **Step 3: Añadir la feature a `PlanFeatures`**

En `src/lib/plans.ts`, dentro de `interface PlanFeatures`, después de `customSendingDomain`:

```ts
  /**
   * Newsletters: contenido editorial publicado con captación de suscriptores.
   * Consume presupuesto de IA de forma recurrente y publica con la marca del
   * cliente, así que acompaña a los planes que ya incluyen dominio propio y
   * analítica completa.
   */
  newsletters: boolean
```

Y en cada bloque `features`: `newsletters: false` en `esencial`, `newsletters: true` en `growth` y en `partner`.

- [ ] **Step 4: Escribir el gate**

```ts
// src/lib/access/newsletters.ts
import type { TenantRole } from '@/lib/auth/tenant-context'
import { PLANS, type SubscriptionPlan } from '@/lib/plans'

// Control de acceso de Newsletters — aislado igual que canUseStudio y
// canAccessCarouselEngine. Úsalo en la página Y en CADA server action: una
// server action es un endpoint HTTP, la ruta no es la única puerta.
//
// A diferencia del Estudio, aquí manda el PLAN y no el rol: es una feature
// vendible. super_admin la ve siempre — es el equipo de ITMANO operando la
// cuenta del cliente.
export function canUseNewsletters(user: { role: TenantRole }, plan: SubscriptionPlan): boolean {
  if (user.role === 'super_admin') return true
  return PLANS[plan].features.newsletters
}
```

- [ ] **Step 5: Ejecutar el test para verificar que pasa**

Run: `npx vitest run tests/access/newsletters.test.ts`
Esperado: PASS, 4 tests.

- [ ] **Step 6: Añadir el ítem de nav**

En `src/components/layout/nav-items.ts`, en el array `navItems`, entre `Propiedades` y `Fuentes`:

```ts
  { label: 'Newsletters',   href: '/newsletters', icon: 'Newspaper' },
```

- [ ] **Step 7: Añadir la fila a la tabla de planes**

En `src/app/(marketing)/planes/page.tsx`, junto a las demás filas de comparación:

```tsx
      { label: 'Newsletters', values: ['—', 'Incluidas', 'Incluidas'] },
```

- [ ] **Step 8: Verificar tipos y lint**

Run: `npx tsc --noEmit && npm run lint`
Esperado: sin errores. Si `tsc` se queja de `newsletters` faltante en algún bloque `features`, es que quedó un plan sin actualizar — añádelo.

- [ ] **Step 9: Commit**

```bash
git add src/lib/access/newsletters.ts tests/access/newsletters.test.ts src/lib/plans.ts src/components/layout/nav-items.ts "src/app/(marketing)/planes/page.tsx"
git commit -m "feat(newsletters): gate de acceso, feature de plan y nav"
```

---

### Task 4: Migración 105 — esquema

**Files:**
- Create: `supabase/migrations/105_newsletters.sql`

**Interfaces:**
- Consumes: nada.
- Produces: tabla `newsletter_editions`, valor `'newsletter'` en `acquisition_channels.channel_type`, columna `tenants.newsletter_source_domains`, bucket `newsletter-media`.

- [ ] **Step 1: Escribir la migración**

```sql
-- 105 · Newsletters: contenido editorial con captación de suscriptores.
--
-- La serie ES un canal de adquisición (channel_type = 'newsletter'), no una
-- tabla nueva: así hereda email_sequence_id, hosted_page, agent_id y toda la
-- analítica de fuente sin escribir una línea. Lo editorial de la serie vive en
-- metadata/hosted_page, que ya es el patrón de las páginas alojadas.
--
-- Sólo las EDICIONES necesitan tabla propia.

-- ── 1) La serie como tipo de canal ───────────────────────────────────────────
alter table public.acquisition_channels
  drop constraint if exists acquisition_channels_channel_type_valid;
alter table public.acquisition_channels
  add constraint acquisition_channels_channel_type_valid
  check (channel_type = any (array[
    'lead_magnet', 'event', 'contact_form', 'manychat_flow', 'manual', 'newsletter'
  ]));

-- ── 2) Allowlist de fuentes del tenant (la usa el Plan 2, se crea ya) ────────
alter table public.tenants
  add column if not exists newsletter_source_domains text[];

comment on column public.tenants.newsletter_source_domains is
  'Dominios que la búsqueda web puede consultar como fuente al generar
   newsletters con IA. Máximo 64. null = ese tenant no puede generar con IA.';

-- ── 3) Ediciones ─────────────────────────────────────────────────────────────
create table if not exists public.newsletter_editions (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            text not null references public.tenants(id) on delete cascade,
  channel_id           uuid not null references public.acquisition_channels(id) on delete cascade,
  slug                 text not null,
  title                text not null,
  dek                  text,
  language             text not null default 'es',
  translation_group_id uuid,
  -- Portada OBLIGATORIA por esquema, no por la UI: una edición sin portada no
  -- debe poder existir ni aunque alguien escriba directo en la base.
  cover_image_url      text not null,
  cover_source         text not null default 'upload'
                       check (cover_source in ('upload', 'studio', 'ai')),
  content              jsonb not null default '{"v":1,"blocks":[]}'::jsonb,
  sources              jsonb not null default '[]'::jsonb,
  data_as_of           date,
  status               text not null default 'draft'
                       check (status in ('draft', 'published', 'archived')),
  published_at         timestamptz,
  ai_generated         boolean not null default false,
  ai_run               jsonb,
  unpublished_by_billing boolean not null default false,
  created_by_agent_id  text references public.agents(id) on delete set null,
  created_by_user_id   uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint newsletter_editions_language_check check (language = any (array[
    'es','en','pt','fr','de','it','zh','ja','ko','ru','ar','hi','vi','tl','ht','pl','uk','tr','nl'
  ]))
);

create unique index if not exists newsletter_editions_channel_slug_idx
  on public.newsletter_editions (channel_id, slug);
create index if not exists newsletter_editions_tenant_status_idx
  on public.newsletter_editions (tenant_id, channel_id, status);
create index if not exists newsletter_editions_translation_idx
  on public.newsletter_editions (translation_group_id)
  where translation_group_id is not null;

-- ── 4) RLS ───────────────────────────────────────────────────────────────────
alter table public.newsletter_editions enable row level security;

create policy newsletter_editions_tenant_all on public.newsletter_editions
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- El público sólo ve lo publicado y no degradado por billing.
create policy newsletter_editions_anon_read on public.newsletter_editions
  for select to anon
  using (status = 'published' and unpublished_by_billing = false);

-- ── 5) Grants por COLUMNA para anon ──────────────────────────────────────────
-- Mismo criterio que properties: la policy limita FILAS, los grants limitan
-- COLUMNAS. Consecuencia: el lector público debe pedir columnas explícitas —
-- un select('*') devuelve 401. Es intencional.
revoke all on public.newsletter_editions from anon;
grant select (
  id, tenant_id, channel_id, slug, title, dek, language, translation_group_id,
  cover_image_url, content, sources, data_as_of, status, published_at, created_at
) on public.newsletter_editions to anon;

grant select, insert, update, delete on public.newsletter_editions to authenticated, service_role;

-- ── 6) updated_at ────────────────────────────────────────────────────────────
create or replace function public.touch_newsletter_edition()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists newsletter_editions_touch on public.newsletter_editions;
create trigger newsletter_editions_touch
  before update on public.newsletter_editions
  for each row execute function public.touch_newsletter_edition();

-- ── 7) Bucket de medios ──────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('newsletter-media', 'newsletter-media', true)
on conflict (id) do nothing;
```

- [ ] **Step 2: Verificar el nombre real de la función de tenant actual**

Antes de aplicar, confirmar cómo resuelven el tenant las policies existentes:

Run: `grep -rn "current_tenant_id\|auth.jwt()" supabase/migrations/*.sql | head -5`

Si las policies del repo usan otra expresión (por ejemplo un `auth.jwt() ->> 'tenant_id'` directo), **copiar esa misma expresión** en la policy de arriba en vez de `public.current_tenant_id()`. Una policy que no coincide con las demás es un agujero de aislamiento.

- [ ] **Step 3: Aplicar al SANDBOX**

Aplicar `105_newsletters.sql` al proyecto `xpaixcowvyksgluazwzn` con `apply_migration` del MCP de Supabase.
**No aplicar a producción en este paso.** Producción va al final del plan y se pregunta antes.

- [ ] **Step 4: Verificar que quedó como se esperaba**

Ejecutar con `execute_sql` contra el sandbox:

```sql
select column_name, is_nullable from information_schema.columns
where table_schema='public' and table_name='newsletter_editions' order by ordinal_position;
select polname from pg_policies where tablename='newsletter_editions';
```

Esperado: `cover_image_url` con `is_nullable = NO`; dos policies.

- [ ] **Step 5: Regenerar tipos**

Run: `npm run types:db:sandbox`
Esperado: `src/lib/supabase/database.types.ts` incluye `newsletter_editions`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/105_newsletters.sql src/lib/supabase/database.types.ts
git commit -m "feat(newsletters): esquema de ediciones y serie como canal"
```

---

### Task 5: Migración 106 — el suscriptor fuera de los quintiles

Esta es la tarea con más riesgo del plan: toca `leads_list` y `refresh_quality_bands`, que sostienen la lista de leads y las bandas de calidad de todos los tenants.

**Files:**
- Create: `supabase/migrations/106_newsletter_subscriber.sql`

**Interfaces:**
- Consumes: la tabla de Task 4.
- Produces: columna `is_subscriber` en la vista `leads_list`; `refresh_quality_bands()` excluyendo suscriptores.

- [ ] **Step 1: Capturar la definición ACTUAL de los dos objetos**

Con `execute_sql` contra el sandbox:

```sql
select pg_get_viewdef('public.leads_list'::regclass, true);
select pg_get_functiondef('public.refresh_quality_bands'::regproc);
```

Guardar ambas salidas. La migración las recrea **enteras** con un único cambio cada una — no se pueden parchear a trozos, y recrearlas de memoria pierde columnas.

- [ ] **Step 2: Escribir la migración**

Pegar la definición capturada de `leads_list` y añadir **una sola línea** junto a `is_imported`:

```sql
-- 106 · El suscriptor de newsletter no define la calidad de la cartera.
--
-- refresh_quality_bands calcula quintiles sobre todo lead en etapa nuevo o
-- nutricion. Un suscriptor entra con fit_profile vacío (fit_score 0),
-- form_baseline +10 y etapa nuevo: score ≈ 10.
--
-- Con 60 leads reales y 400 suscriptores el p80 cae de ~70 a ~15 y TODA la
-- cartera pasa a banda "alta". La banda —el mecanismo que dirige la atención
-- del agente— deja de significar nada, sin error y sin síntoma.
--
-- Es el mismo problema que resolvió la 080 con los leads importados, y la misma
-- solución: no hace falta una etapa nueva, hace falta la PROCEDENCIA.
--
-- El suscriptor SÍ sigue contando en la analítica por fuente: ahí es donde
-- aporta, porque mide de dónde vino.

drop view if exists public.leads_list;

create view public.leads_list
with (security_invoker = on) as
select
  l.*,
  jsonb_exists(coalesce(l.metadata, '{}'::jsonb), 'imported') as is_imported,
  -- Llegó por el formulario de una newsletter y todavía no ha mostrado
  -- intención. Se le quita la marca al graduarse (ver §3.5 del spec).
  jsonb_exists(coalesce(l.metadata, '{}'::jsonb), 'newsletter_subscriber') as is_subscriber,
  -- [RESTO DE LA DEFINICIÓN CAPTURADA EN EL PASO 1, SIN CAMBIOS]
  ...
;

revoke all on public.leads_list from anon;
grant select on public.leads_list to authenticated, service_role;

create or replace function public.refresh_quality_bands()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count integer := 0;
begin
  insert into tenant_quality_bands (tenant_id, p20, p40, p60, p80, active_leads, computed_at)
  select
    t.tenant_id,
    percentile_cont(0.2) within group (order by t.q)::int,
    percentile_cont(0.4) within group (order by t.q)::int,
    percentile_cont(0.6) within group (order by t.q)::int,
    percentile_cont(0.8) within group (order by t.q)::int,
    count(*)::int,
    now()
  from (
    select l.tenant_id, coalesce(l.quality_score, 0) as q
    from   leads l
    -- Solo cartera VIVA: cerrar un buen lead no debe degradar a los demás.
    where  l.stage not in ('en_proceso','cerrado','perdido')
    -- Y sólo PROSPECTOS: un lector de la newsletter no define qué es un lead
    -- "alta" para esta agencia.
      and  not jsonb_exists(coalesce(l.metadata, '{}'::jsonb), 'newsletter_subscriber')
  ) t
  group by t.tenant_id
  on conflict (tenant_id) do update
  set p20 = excluded.p20, p40 = excluded.p40, p60 = excluded.p60,
      p80 = excluded.p80, active_leads = excluded.active_leads,
      computed_at = excluded.computed_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;
```

- [ ] **Step 3: Aplicar al sandbox y comprobar que las bandas siguen vivas**

Aplicar con `apply_migration` al sandbox, y después:

```sql
select public.refresh_quality_bands();
select tenant_id, active_leads, p80, computed_at from tenant_quality_bands;
```

Esperado: la función devuelve un entero ≥ 1 y `computed_at` es de ahora. **Si `computed_at` no se actualiza, la función está fallando en silencio** — es exactamente el fallo que estuvo escondido entre la 083 y la 098. No seguir hasta que se actualice.

- [ ] **Step 4: Comprobar que `leads_list` no perdió columnas**

```sql
select count(*) from information_schema.columns
where table_schema='public' and table_name='leads_list';
select id, is_imported, is_subscriber from public.leads_list limit 3;
```

Esperado: el conteo es el de antes **+1**, y la consulta de las tres columnas no falla.

- [ ] **Step 5: Correr la suite de scoring**

Run: `npm run test:scoring`
Esperado: PASS. Esta suite pega a la base remota — no la corras en paralelo con nada.

- [ ] **Step 6: Regenerar tipos y commit**

```bash
npm run types:db:sandbox
git add supabase/migrations/106_newsletter_subscriber.sql src/lib/supabase/database.types.ts
git commit -m "feat(newsletters): excluir suscriptores del calculo de bandas"
```

---

### Task 6: Data layer

**Files:**
- Create: `src/lib/data/newsletters.ts`

**Interfaces:**
- Consumes: `NewsletterContent`, `NewsletterSource`, `parseNewsletterContent`, `parseNewsletterSources` (Task 1); `columns()` de `@/lib/supabase/columns`.
- Produces:
  - `interface NewsletterSeries { id, tenantId, name, slug, active, emailSequenceId, emailSequenceName, agentId, subscriberCount, lastEditionAt, editionCount }`
  - `interface NewsletterEdition { id, tenantId, channelId, slug, title, dek, language, translationGroupId, coverImageUrl, coverSource, content, sources, dataAsOf, status, publishedAt, aiGenerated, unpublishedByBilling, createdByAgentId, createdByUserId, createdAt, updatedAt }`
  - `getSeriesForTenant(tenantId: string): Promise<NewsletterSeries[]>`
  - `getSeriesById(id: string, tenantId: string): Promise<NewsletterSeries | null>`
  - `getEditionsForSeries(channelId: string, tenantId: string): Promise<NewsletterEdition[]>`
  - `getEditionById(id: string, tenantId: string): Promise<NewsletterEdition | null>`

- [ ] **Step 1: Escribir el módulo**

```ts
// src/lib/data/newsletters.ts
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import {
  parseNewsletterContent, parseNewsletterSources,
  type NewsletterContent, type NewsletterSource,
} from '@/lib/newsletters/content'

// Acceso a datos de newsletters. La SERIE es una fila de acquisition_channels
// con channel_type = 'newsletter'; las EDICIONES son tabla propia.

export type NewsletterStatus      = 'draft' | 'published' | 'archived'
export type NewsletterCoverSource = 'upload' | 'studio' | 'ai'

export interface NewsletterSeries {
  id:                string
  tenantId:          string
  name:              string
  slug:              string
  active:            boolean
  emailSequenceId:   string | null
  emailSequenceName: string | null
  agentId:           string | null
  subscriberCount:   number
  editionCount:      number
  lastEditionAt:     string | null
}

export interface NewsletterEdition {
  id:                   string
  tenantId:             string
  channelId:            string
  slug:                 string
  title:                string
  dek:                  string | null
  language:             string
  translationGroupId:   string | null
  coverImageUrl:        string
  coverSource:          NewsletterCoverSource
  content:              NewsletterContent | null
  sources:              NewsletterSource[]
  dataAsOf:             string | null
  status:               NewsletterStatus
  publishedAt:          string | null
  aiGenerated:          boolean
  unpublishedByBilling: boolean
  createdByAgentId:     string | null
  createdByUserId:      string | null
  createdAt:            string
  updatedAt:            string
}

const SERIES_COLUMNS = columns('acquisition_channels', [
  'id', 'tenant_id', 'name', 'slug', 'active', 'email_sequence_id', 'agent_id',
])

const EDITION_COLUMNS = columns('newsletter_editions', [
  'id', 'tenant_id', 'channel_id', 'slug', 'title', 'dek', 'language',
  'translation_group_id', 'cover_image_url', 'cover_source', 'content', 'sources',
  'data_as_of', 'status', 'published_at', 'ai_generated', 'unpublished_by_billing',
  'created_by_agent_id', 'created_by_user_id', 'created_at', 'updated_at',
])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// reason: el cliente de Supabase no está tipado en este repo; `columns()` ya
// validó la lista contra el esquema, que es lo que el cast podría esconder.
function mapEdition(row: any): NewsletterEdition {
  return {
    id:                   row.id,
    tenantId:             row.tenant_id,
    channelId:            row.channel_id,
    slug:                 row.slug,
    title:                row.title,
    dek:                  row.dek ?? null,
    language:             row.language,
    translationGroupId:   row.translation_group_id ?? null,
    coverImageUrl:        row.cover_image_url,
    coverSource:          row.cover_source,
    content:              parseNewsletterContent(row.content),
    sources:              parseNewsletterSources(row.sources),
    dataAsOf:             row.data_as_of ?? null,
    status:               row.status,
    publishedAt:          row.published_at ?? null,
    aiGenerated:          row.ai_generated === true,
    unpublishedByBilling: row.unpublished_by_billing === true,
    createdByAgentId:     row.created_by_agent_id ?? null,
    createdByUserId:      row.created_by_user_id ?? null,
    createdAt:            row.created_at,
    updatedAt:            row.updated_at,
  }
}

export async function getSeriesForTenant(tenantId: string): Promise<NewsletterSeries[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('acquisition_channels')
    .select(SERIES_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('channel_type', 'newsletter')
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // reason: ver mapEdition.
  const rows = (data ?? []) as any[]
  if (rows.length === 0) return []

  const ids = rows.map(r => r.id as string)

  // Conteos en dos consultas agregadas en vez de N+1: pocas series, muchos leads.
  const [{ data: leadRows }, { data: editionRows }, { data: seqRows }] = await Promise.all([
    db.from('leads').select('acquisition_channel_id').in('acquisition_channel_id', ids),
    db.from('newsletter_editions').select('channel_id, published_at').in('channel_id', ids),
    db.from('email_sequences').select('id, name').eq('tenant_id', tenantId),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // reason: ver mapEdition.
  const seqName = new Map<string, string>(((seqRows ?? []) as any[]).map(s => [s.id, s.name]))
  const subs = new Map<string, number>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // reason: ver mapEdition.
  for (const l of (leadRows ?? []) as any[]) {
    subs.set(l.acquisition_channel_id, (subs.get(l.acquisition_channel_id) ?? 0) + 1)
  }
  const editions = new Map<string, { count: number; last: string | null }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // reason: ver mapEdition.
  for (const e of (editionRows ?? []) as any[]) {
    const cur = editions.get(e.channel_id) ?? { count: 0, last: null }
    cur.count += 1
    if (e.published_at && (!cur.last || e.published_at > cur.last)) cur.last = e.published_at
    editions.set(e.channel_id, cur)
  }

  return rows.map(r => ({
    id:                r.id,
    tenantId:          r.tenant_id,
    name:              r.name,
    slug:              r.slug,
    active:            r.active === true,
    emailSequenceId:   r.email_sequence_id ?? null,
    emailSequenceName: r.email_sequence_id ? (seqName.get(r.email_sequence_id) ?? null) : null,
    agentId:           r.agent_id ?? null,
    subscriberCount:   subs.get(r.id) ?? 0,
    editionCount:      editions.get(r.id)?.count ?? 0,
    lastEditionAt:     editions.get(r.id)?.last ?? null,
  }))
}

export async function getSeriesById(id: string, tenantId: string): Promise<NewsletterSeries | null> {
  const all = await getSeriesForTenant(tenantId)
  return all.find(s => s.id === id) ?? null
}

export async function getEditionsForSeries(channelId: string, tenantId: string): Promise<NewsletterEdition[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('newsletter_editions')
    .select(EDITION_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // reason: ver mapEdition.
  return ((data ?? []) as any[]).map(mapEdition)
}

export async function getEditionById(id: string, tenantId: string): Promise<NewsletterEdition | null> {
  const db = createAdminClient()
  const { data } = await db
    .from('newsletter_editions')
    .select(EDITION_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return data ? mapEdition(data) : null
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Esperado: sin errores. Si `columns('newsletter_editions', ...)` marca una columna, es que `database.types.ts` no se regeneró tras la migración — vuelve a `npm run types:db:sandbox`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/newsletters.ts
git commit -m "feat(newsletters): capa de datos"
```

---

### Task 7: Compilador de bloques a HTML

**Files:**
- Create: `src/lib/newsletters/render.ts`
- Test: `tests/newsletters/render.test.ts`

**Interfaces:**
- Consumes: `NewsletterContent`, `NewsletterSource` de Task 1.
- Produces: `renderNewsletterHtml(content: NewsletterContent, sources: NewsletterSource[]): string`, `escapeHtml(value: string): string`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// tests/newsletters/render.test.ts
import { describe, it, expect } from 'vitest'
import { renderNewsletterHtml, escapeHtml } from '@/lib/newsletters/render'
import { NEWSLETTER_CONTENT_VERSION, type NewsletterContent } from '@/lib/newsletters/content'

const fuente = {
  id: 's1', url: 'https://nar.realtor/x', title: 'Informe NAR', publisher: 'NAR', accessed_at: '2026-08-24',
}

describe('escapeHtml', () => {
  it('escapa los cinco caracteres peligrosos', () => {
    expect(escapeHtml(`<script>&"'`)).toBe('&lt;script&gt;&amp;&quot;&#39;')
  })
})

describe('renderNewsletterHtml', () => {
  it('escapa el texto de usuario en cada tipo de bloque', () => {
    const content: NewsletterContent = {
      v: NEWSLETTER_CONTENT_VERSION,
      blocks: [
        { type: 'heading', level: 2, text: '<img src=x onerror=alert(1)>' },
        { type: 'paragraph', text: '<script>alert(1)</script>' },
        { type: 'quote', text: '<b>no</b>', attribution: '<i>tampoco</i>' },
      ],
    }
    const html = renderNewsletterHtml(content, [])
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('onerror=')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renderiza los niveles de heading como h2 y h3', () => {
    const content: NewsletterContent = {
      v: NEWSLETTER_CONTENT_VERSION,
      blocks: [
        { type: 'heading', level: 2, text: 'Dos' },
        { type: 'heading', level: 3, text: 'Tres' },
      ],
    }
    const html = renderNewsletterHtml(content, [])
    expect(html).toContain('<h2>Dos</h2>')
    expect(html).toContain('<h3>Tres</h3>')
  })

  it('pinta las fuentes citadas al pie con su enlace', () => {
    const content: NewsletterContent = {
      v: NEWSLETTER_CONTENT_VERSION,
      blocks: [{ type: 'stat', label: 'Precio medio', value: '$385.000', sourceIds: ['s1'] }],
    }
    const html = renderNewsletterHtml(content, [fuente])
    expect(html).toContain('https://nar.realtor/x')
    expect(html).toContain('Informe NAR')
  })

  it('no pinta la seccion de fuentes cuando ninguna se cita', () => {
    const content: NewsletterContent = {
      v: NEWSLETTER_CONTENT_VERSION,
      blocks: [{ type: 'paragraph', text: 'Sin datos' }],
    }
    expect(renderNewsletterHtml(content, [fuente])).not.toContain('nar.realtor')
  })

  it('ignora una url de imagen que no sea http', () => {
    const content: NewsletterContent = {
      v: NEWSLETTER_CONTENT_VERSION,
      blocks: [{ type: 'image', url: 'javascript:alert(1)', alt: 'x' }],
    }
    expect(renderNewsletterHtml(content, [])).not.toContain('javascript:')
  })
})
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run tests/newsletters/render.test.ts`
Esperado: FAIL — módulo no encontrado.

- [ ] **Step 3: Escribir la implementación**

```ts
// src/lib/newsletters/render.ts
import 'server-only'
import type { NewsletterContent, NewsletterSource } from './content'

// Compilador único de bloques → HTML. Lo usan la página pública y la vista
// previa del editor. Nunca dupliques esta lógica en otro lado.
//
// Seguridad: TODO texto que venga del usuario o de una IA se escapa antes de
// interpolar. Es lo que permite que el contenido se guarde como datos y no como
// HTML: aquí no hay nada que sanear porque nada llega ya marcado.

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Sólo http(s). Corta javascript:, data: y cualquier otro esquema. */
function safeUrl(raw: string): string | null {
  try {
    const u = new URL(raw)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

export function renderNewsletterHtml(
  content: NewsletterContent,
  sources: NewsletterSource[],
): string {
  const cited = new Set<string>()
  const parts: string[] = []

  for (const block of content.blocks) {
    switch (block.type) {
      case 'heading':
        parts.push(`<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`)
        break
      case 'paragraph':
        block.sourceIds?.forEach(id => cited.add(id))
        parts.push(`<p>${escapeHtml(block.text)}</p>`)
        break
      case 'list': {
        const tag   = block.style === 'number' ? 'ol' : 'ul'
        const items = block.items.map(i => `<li>${escapeHtml(i)}</li>`).join('')
        parts.push(`<${tag}>${items}</${tag}>`)
        break
      }
      case 'image': {
        const url = safeUrl(block.url)
        if (!url) break
        const caption = block.caption
          ? `<figcaption>${escapeHtml(block.caption)}</figcaption>`
          : ''
        parts.push(
          `<figure><img src="${escapeHtml(url)}" alt="${escapeHtml(block.alt)}" loading="lazy" />${caption}</figure>`,
        )
        break
      }
      case 'quote': {
        const attribution = block.attribution
          ? `<cite>${escapeHtml(block.attribution)}</cite>`
          : ''
        parts.push(`<blockquote><p>${escapeHtml(block.text)}</p>${attribution}</blockquote>`)
        break
      }
      case 'callout':
        parts.push(
          `<aside class="nl-callout nl-callout-${block.tone}">${escapeHtml(block.text)}</aside>`,
        )
        break
      case 'stat':
        block.sourceIds.forEach(id => cited.add(id))
        parts.push(
          `<div class="nl-stat"><span class="nl-stat-value">${escapeHtml(block.value)}</span>` +
          `<span class="nl-stat-label">${escapeHtml(block.label)}</span></div>`,
        )
        break
    }
  }

  // Sólo se listan las fuentes REALMENTE citadas: una lista con fuentes que el
  // texto no usa es ruido que aparenta rigor.
  const used = sources.filter(s => cited.has(s.id))
  if (used.length > 0) {
    const items = used.map(s => {
      const url = safeUrl(s.url)
      const label = escapeHtml(s.publisher ? `${s.title} — ${s.publisher}` : s.title)
      return url
        ? `<li><a href="${escapeHtml(url)}" rel="nofollow noopener" target="_blank">${label}</a></li>`
        : `<li>${label}</li>`
    }).join('')
    parts.push(`<section class="nl-sources"><h2>Fuentes</h2><ol>${items}</ol></section>`)
  }

  return parts.join('\n')
}
```

- [ ] **Step 4: Ejecutar el test para verificar que pasa**

Run: `npx vitest run tests/newsletters/render.test.ts`
Esperado: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/newsletters/render.ts tests/newsletters/render.test.ts
git commit -m "feat(newsletters): compilador de bloques a html"
```

---

### Task 8: Server actions

**Files:**
- Create: `src/app/(dashboard)/newsletters/actions.ts`

**Interfaces:**
- Consumes: `canUseNewsletters` (Task 3), `publishBlockers` (Task 2), `NewsletterContentSchema` y `NewsletterSourceSchema` (Task 1), `getEditionById` (Task 6).
- Produces: `createSeries`, `updateSeries`, `createEdition`, `updateEdition`, `publishEdition`, `unpublishEdition`, `deleteEdition`, `uploadNewsletterMedia(formData: FormData): Promise<Result<{ url: string }>>`. Todas devuelven `{ ok: true; data: T } | { ok: false; error: string }`.

- [ ] **Step 1: Leer una acción equivalente para copiar convenciones**

Run: `sed -n '1,70p' "src/app/(dashboard)/sources/actions.ts"`

Fíjate en: cómo obtiene el contexto (`requireTenantContext`), la forma del retorno, y dónde llama a `revalidatePath`. Cópialas.

- [ ] **Step 2: Escribir las acciones**

```ts
// src/app/(dashboard)/newsletters/actions.ts
'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { canUseNewsletters } from '@/lib/access/newsletters'
import { publishBlockers } from '@/lib/newsletters/publishable'
import { NewsletterContentSchema, NewsletterSourceSchema } from '@/lib/newsletters/content'
import { getEditionById } from '@/lib/data/newsletters'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

// Cada action revalida su ruta pública además de la del CRM: publicar tiene que
// verse ya, no en la próxima ventana de ISR.
function revalidateAll(tenantSlug: string, seriesSlug?: string, editionSlug?: string) {
  revalidatePath('/newsletters')
  revalidatePath(`/nl/${tenantSlug}`)
  if (seriesSlug) revalidatePath(`/nl/${tenantSlug}/${seriesSlug}`)
  if (seriesSlug && editionSlug) revalidatePath(`/nl/${tenantSlug}/${seriesSlug}/${editionSlug}`)
}

function slugify(raw: string): string {
  return raw
    // \u0300-\u036f = marcas diacriticas combinantes. Escapadas a proposito:
    // escritas como caracteres literales son invisibles en el editor y no
    // sobreviven a un cambio de codificación del archivo.
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** Contexto + gate de plan. Toda action pasa por aquí: la ruta no es la única puerta. */
async function guard() {
  const ctx = await requireTenantContext()
  if (!ctx.tenant_id) return { ctx: null, error: 'Selecciona un tenant primero.' as const }
  const db = createAdminClient()
  const { data: tenantRow } = await db
    .from('tenants').select('slug, subscription_plan').eq('id', ctx.tenant_id).maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // reason: el cliente de Supabase no está tipado en este repo.
  const row = tenantRow as any
  const plan = (row?.subscription_plan ?? 'esencial') as 'esencial' | 'growth' | 'partner'
  if (!canUseNewsletters({ role: ctx.role }, plan)) {
    return { ctx: null, error: 'Tu plan no incluye newsletters.' as const }
  }
  return { ctx, db, tenantSlug: (row?.slug as string) ?? '', error: null }
}

const SeriesInput = z.object({
  name:            z.string().trim().min(1, 'La serie necesita un nombre').max(120),
  emailSequenceId: z.string().uuid().nullable(),
  agentId:         z.string().nullable(),
})

export async function createSeries(input: unknown): Promise<Result<{ id: string }>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }
  const parsed = SeriesInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const publicId = `chn_${Math.random().toString(36).slice(2, 14).padEnd(12, '0')}`
  const { data, error } = await g.db.from('acquisition_channels').insert({
    tenant_id:         g.ctx.tenant_id,
    public_id:         publicId,
    channel_type:      'newsletter',
    name:              parsed.data.name,
    slug:              slugify(parsed.data.name),
    email_sequence_id: parsed.data.emailSequenceId,
    agent_id:          parsed.data.agentId,
  }).select('id').maybeSingle()

  if (error) return { ok: false, error: error.message }
  revalidateAll(g.tenantSlug)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // reason: ver guard().
  return { ok: true, data: { id: (data as any).id } }
}

export async function updateSeries(id: string, input: unknown): Promise<Result<null>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }
  const parsed = SeriesInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const { error } = await g.db.from('acquisition_channels').update({
    name:              parsed.data.name,
    email_sequence_id: parsed.data.emailSequenceId,
    agent_id:          parsed.data.agentId,
  }).eq('id', id).eq('tenant_id', g.ctx.tenant_id).eq('channel_type', 'newsletter')

  if (error) return { ok: false, error: error.message }
  revalidateAll(g.tenantSlug)
  return { ok: true, data: null }
}

const EditionInput = z.object({
  channelId:     z.string().uuid(),
  title:         z.string().trim().min(1, 'La edición necesita un titular').max(200),
  dek:           z.string().trim().max(400).nullable(),
  language:      z.string().trim().min(2).max(3),
  coverImageUrl: z.string().url('La edición necesita una imagen de portada'),
  coverSource:   z.enum(['upload', 'studio', 'ai']),
  content:       NewsletterContentSchema,
  sources:       z.array(NewsletterSourceSchema).max(40),
  dataAsOf:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
})

export async function createEdition(input: unknown): Promise<Result<{ id: string }>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }
  const parsed = EditionInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const { data, error } = await g.db.from('newsletter_editions').insert({
    tenant_id:           g.ctx.tenant_id,
    channel_id:          d.channelId,
    slug:                `${slugify(d.title)}-${Date.now().toString(36)}`,
    title:               d.title,
    dek:                 d.dek,
    language:            d.language,
    cover_image_url:     d.coverImageUrl,
    cover_source:        d.coverSource,
    content:             d.content,
    sources:             d.sources,
    data_as_of:          d.dataAsOf,
    status:              'draft',
    created_by_agent_id: g.ctx.agent_id ?? null,
    created_by_user_id:  g.ctx.user_id,
  }).select('id').maybeSingle()

  if (error) return { ok: false, error: error.message }
  revalidateAll(g.tenantSlug)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // reason: ver guard().
  return { ok: true, data: { id: (data as any).id } }
}

export async function updateEdition(id: string, input: unknown): Promise<Result<null>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }
  const parsed = EditionInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const { error } = await g.db.from('newsletter_editions').update({
    title:           d.title,
    dek:             d.dek,
    language:        d.language,
    cover_image_url: d.coverImageUrl,
    cover_source:    d.coverSource,
    content:         d.content,
    sources:         d.sources,
    data_as_of:      d.dataAsOf,
  }).eq('id', id).eq('tenant_id', g.ctx.tenant_id)

  if (error) return { ok: false, error: error.message }
  revalidateAll(g.tenantSlug)
  return { ok: true, data: null }
}

export async function publishEdition(id: string): Promise<Result<null>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }

  const edition = await getEditionById(id, g.ctx.tenant_id)
  if (!edition) return { ok: false, error: 'Esa edición no existe.' }

  // La MISMA función que usa el editor para deshabilitar el botón. Un check de
  // UI que el servidor no repite no es un check.
  //
  // `edition.content` y `edition.sources` ya vienen parseados por mapEdition
  // (data/newsletters.ts) — no los vuelvas a pasar por parseNewsletterContent.
  const blockers = publishBlockers({
    title:         edition.title,
    coverImageUrl: edition.coverImageUrl,
    content:       edition.content,
    sources:       edition.sources,
  })
  if (blockers.length > 0) return { ok: false, error: blockers[0].detail }

  const { error } = await g.db.from('newsletter_editions')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', id).eq('tenant_id', g.ctx.tenant_id)

  if (error) return { ok: false, error: error.message }
  revalidateAll(g.tenantSlug, undefined, edition.slug)
  return { ok: true, data: null }
}

export async function unpublishEdition(id: string): Promise<Result<null>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }
  const { error } = await g.db.from('newsletter_editions')
    .update({ status: 'draft' })
    .eq('id', id).eq('tenant_id', g.ctx.tenant_id)
  if (error) return { ok: false, error: error.message }
  revalidateAll(g.tenantSlug)
  return { ok: true, data: null }
}

export async function deleteEdition(id: string): Promise<Result<null>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }
  const { error } = await g.db.from('newsletter_editions')
    .delete().eq('id', id).eq('tenant_id', g.ctx.tenant_id)
  if (error) return { ok: false, error: error.message }
  revalidateAll(g.tenantSlug)
  return { ok: true, data: null }
}

// ── Subida de medios ─────────────────────────────────────────────────────────
// La usa el CoverPicker y el bloque de imagen. Sube con el cliente service-role
// (nunca desde el navegador) y devuelve la URL pública ya resuelta.

const MAX_MEDIA_BYTES = 8 * 1024 * 1024
const ALLOWED_MEDIA   = ['image/png', 'image/jpeg', 'image/webp']

export async function uploadNewsletterMedia(formData: FormData): Promise<Result<{ url: string }>> {
  const g = await guard()
  if (!g.ctx) return { ok: false, error: g.error }

  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, error: 'No llegó ningún archivo.' }
  if (file.size > MAX_MEDIA_BYTES) return { ok: false, error: 'La imagen supera los 8 MB.' }
  if (!ALLOWED_MEDIA.includes(file.type)) {
    return { ok: false, error: 'Formato no admitido. Usa PNG, JPG o WebP.' }
  }

  const ext  = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${g.ctx.tenant_id}/${crypto.randomUUID()}.${ext}`

  const { error } = await g.db.storage
    .from('newsletter-media')
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) return { ok: false, error: `No se pudo subir la imagen: ${error.message}` }

  const { data } = g.db.storage.from('newsletter-media').getPublicUrl(path)
  return { ok: true, data: { url: data.publicUrl } }
}
```

- [ ] **Step 3: Verificar el nombre real de la columna del plan**

Run: `grep -rn "subscription_plan\|plan" src/lib/subscriptions.ts | head -8`

Si la columna del tenant no se llama `subscription_plan`, corregir el `.select()` de `guard()`. `columns()` no cubre este caso porque el select va inline — si prefieres, muévelo a `columns('tenants', [...])`.

- [ ] **Step 4: Verificar tipos y lint**

Run: `npx tsc --noEmit && npm run lint`
Esperado: sin errores.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/newsletters/actions.ts"
git commit -m "feat(newsletters): server actions de series y ediciones"
```

---

### Task 9: Página índice `/newsletters`

**Files:**
- Create: `src/app/(dashboard)/newsletters/page.tsx`
- Create: `src/app/(dashboard)/newsletters/series-list.tsx`
- Create: `src/app/(dashboard)/newsletters/new-series-modal.tsx`

**Interfaces:**
- Consumes: `getSeriesForTenant` (Task 6), `createSeries` (Task 8), `canUseNewsletters` (Task 3).
- Produces: la ruta `/newsletters`.

- [ ] **Step 1: Leer la página equivalente para copiar convenciones**

Run: `sed -n '1,60p' "src/app/(dashboard)/sources/page.tsx"`

Fíjate en: cómo obtiene el contexto, cómo carga los datos en el Server Component y cómo pasa props al Client Component.

- [ ] **Step 2: Escribir el Server Component**

`page.tsx` es servidor: obtiene `requireTenantContext()`, resuelve el plan del tenant, y:
- Si `canUseNewsletters` es false → renderiza el bloque de upgrade con el patrón que ya usa el repo (busca uno con `grep -rn "plan no incluye\|Actualiza tu plan" --include=*.tsx src | head -3` y cópialo).
- Si es true → `const series = await getSeriesForTenant(ctx.tenant_id)` y renderiza `<SeriesList series={series} sequences={...} agents={...} />`.

Las secuencias para el selector salen de `getSequencesForTenant` en `src/lib/data/email-sequences.ts` (verificar el nombre exacto con `grep -n "^export async function" src/lib/data/email-sequences.ts`).

- [ ] **Step 3: Escribir `series-list.tsx` (Client Component)**

`'use client'`. Recibe `series`, `sequences` y `agents` por props. Renderiza:
- Encabezado con el botón **Nueva edición** (primario) y **Nueva serie** (secundario).
- Una tarjeta por serie: nombre, secuencia vinculada (o "Sin secuencia vinculada"), `subscriberCount` suscriptores, `editionCount` ediciones, fecha de la última, y enlace a la página pública.
- Estado vacío serio: *"Todavía no hay ninguna serie. Una serie agrupa las ediciones que comparten público y secuencia de seguimiento."* Sin emojis, sin chistes.

Hovers con clase CSS + `<style>` inline al inicio del componente, que es el patrón del repo. Colores solo con variables de `globals.css`. Radio de tarjeta 12px, de botón 8px.

- [ ] **Step 4: Escribir `new-series-modal.tsx`**

`'use client'`. Formulario con nombre, selector de secuencia (opcional) y selector de agente (opcional). Al enviar llama a `createSeries` y muestra `error` si `ok` es false. Nunca lanza.

- [ ] **Step 5: Verificar en el navegador**

```bash
npm run dev
```

Entrar con `/api/dev/login?secret=<DEV_LOGIN_SECRET>&email=dj.vergara54321@gmail.com`, ir a `/newsletters`, crear una serie y comprobar que aparece en la lista y también en `/sources` (es un canal).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/newsletters/"
git commit -m "feat(newsletters): indice de series"
```

---

### Task 10: Editor de edición

**Files:**
- Create: `src/app/(dashboard)/newsletters/[id]/page.tsx`
- Create: `src/app/(dashboard)/newsletters/[id]/edition-editor.tsx`
- Create: `src/app/(dashboard)/newsletters/[id]/block-list.tsx`
- Create: `src/app/(dashboard)/newsletters/[id]/sources-panel.tsx`
- Create: `src/app/(dashboard)/newsletters/[id]/cover-picker.tsx`
- Create: `src/app/(dashboard)/newsletters/nueva/page.tsx`

**Interfaces:**
- Consumes: `getEditionById`, `getSeriesForTenant` (Task 6); `updateEdition`, `publishEdition`, `unpublishEdition` (Task 8); `publishBlockers` (Task 2); `renderNewsletterHtml` — **no**, el preview del cliente NO importa `render.ts` (es `server-only`): el preview se pinta con JSX equivalente en `block-list.tsx`.
- Produces: las rutas `/newsletters/[id]` y `/newsletters/nueva`.

- [ ] **Step 1: Escribir el Server Component de `[id]`**

Carga `getEditionById(id, ctx.tenant_id)`, `notFound()` si no existe, y pasa la edición y la serie a `<EditionEditor />`. Aplica `requireSelfOrManager` igual que `properties/[id]/page.tsx` para que un `agent` sólo edite lo suyo (`grep -n "requireSelfOrManager" -r src/lib/auth/guards.ts` para la firma exacta).

- [ ] **Step 2: Escribir `edition-editor.tsx`**

`'use client'`. Estado local con la edición completa. Layout de dos columnas (`display: grid; gridTemplateColumns: 1fr 1fr` en ≥1024px, una columna debajo).

Fijo arriba: portada (`<CoverPicker />`), campo `data_as_of`, y el estado (`Borrador` / `Publicada`).

Botón **Publicar**: deshabilitado si `publishBlockers(...)` devuelve algo, con el primer `detail` como texto de ayuda debajo. Al pulsar llama a `updateEdition` y después a `publishEdition`.

- [ ] **Step 3: Escribir `block-list.tsx`**

`'use client'`. Columna izquierda: los bloques editables, cada uno con su formulario según `type`, botones de subir/bajar/eliminar, y un menú "Añadir bloque" con los siete tipos.

Columna derecha: la vista previa, en JSX que espeja `renderNewsletterHtml` — mismos elementos y mismas clases (`nl-callout`, `nl-stat`, `nl-sources`). React escapa el texto por defecto, así que el preview es seguro sin trabajo extra.

Un bloque `stat` sin `sourceIds` válidos se pinta con borde de advertencia (`var(--border-danger)` o el token de peligro que exista en `globals.css` — compruébalo antes con `grep -n "danger\|error" src/app/globals.css | head -5`).

- [ ] **Step 4: Escribir `sources-panel.tsx`**

`'use client'`. Lista de fuentes con url, título, medio y fecha de consulta. Añadir, editar y eliminar. Al eliminar una fuente citada por algún bloque, avisa de cuántos bloques la citan **antes** de borrarla — si no, el bloqueo aparece después sin explicación.

- [ ] **Step 5: Escribir `cover-picker.tsx`**

`'use client'`. Dos vías en este plan: **subir archivo** (llama a `uploadNewsletterMedia(formData)` de la Task 8 y guarda la `url` que devuelve, con `coverSource: 'upload'`) y **elegir de la biblioteca del Estudio** (`getStudioImages` de `src/lib/data/studio.ts`, con `coverSource: 'studio'` — verificar el nombre exacto con `grep -n "^export async function" src/lib/data/studio.ts`).

La tercera vía (**generar con IA**) va en el Plan 2: deja el botón visible y deshabilitado con el texto *"Disponible próximamente"*.

- [ ] **Step 6: Escribir `/newsletters/nueva`**

Formulario mínimo: serie, titular, idioma y portada. Al enviar llama a `createEdition` y redirige a `/newsletters/<id>`.

- [ ] **Step 7: Verificar en el navegador**

Con `npm run dev`: crear una edición, añadir un bloque `stat` sin fuente y comprobar que **Publicar** está deshabilitado; añadir la fuente y comprobar que se habilita; publicar.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/newsletters/"
git commit -m "feat(newsletters): editor de ediciones con panel de fuentes"
```

---

### Task 11: Páginas públicas

**Files:**
- Modify: `src/lib/hosted-page.ts` (`HOSTED_SUBDOMAIN_REWRITE`, ~línea 14)
- Create: `src/app/(hosted)/nl/[tenantSlug]/shared.ts`
- Create: `src/app/(hosted)/nl/[tenantSlug]/page.tsx`
- Create: `src/app/(hosted)/nl/[tenantSlug]/[seriesSlug]/page.tsx`
- Create: `src/app/(hosted)/nl/[tenantSlug]/[seriesSlug]/[editionSlug]/page.tsx`
- Test: `tests/newsletters/hosted-url.test.ts`

**Interfaces:**
- Consumes: `renderNewsletterHtml` (Task 7).
- Produces: `hostedNewsletterUrl(tenantSlug: string, seriesSlug?: string, editionSlug?: string): string` en `hosted-page.ts`; y en `shared.ts`: `getPublicTenant`, `getPublicSeries`, `getPublicEditions`, `getPublicEdition`, `getPublicNewsletterPaths`.

- [ ] **Step 1: Escribir el test de URL que falla**

```ts
// tests/newsletters/hosted-url.test.ts
import { describe, it, expect } from 'vitest'
import { hostedNewsletterUrl, HOSTED_SUBDOMAIN_REWRITE } from '@/lib/hosted-page'

describe('hostedNewsletterUrl', () => {
  it('el subdominio news reescribe a /nl', () => {
    expect(HOSTED_SUBDOMAIN_REWRITE.news).toBe('/nl')
  })

  it('arma las tres profundidades', () => {
    expect(hostedNewsletterUrl('aj')).toBe('https://news.itmano.com/aj')
    expect(hostedNewsletterUrl('aj', 'mercado')).toBe('https://news.itmano.com/aj/mercado')
    expect(hostedNewsletterUrl('aj', 'mercado', 'agosto-2026'))
      .toBe('https://news.itmano.com/aj/mercado/agosto-2026')
  })
})
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run tests/newsletters/hosted-url.test.ts`
Esperado: FAIL — `hostedNewsletterUrl` no existe.

- [ ] **Step 3: Añadir el subdominio y el helper**

En `src/lib/hosted-page.ts`, en `HOSTED_SUBDOMAIN_REWRITE`, añadir `news: '/nl',`. Y al lado de `hostedPropertiesUrl`:

```ts
/** URL pública de una newsletter: portada, serie o edición. */
export function hostedNewsletterUrl(
  tenantSlug: string, seriesSlug?: string, editionSlug?: string,
): string {
  const path = [tenantSlug, seriesSlug, editionSlug].filter(Boolean).join('/')
  return `https://news.${HOSTED_BASE_DOMAIN}/${path}`
}
```

El proxy no se toca: el rewrite por host de `src/proxy.ts:28` lee este mapa.

- [ ] **Step 4: Ejecutar el test para verificar que pasa**

Run: `npx vitest run tests/newsletters/hosted-url.test.ts`
Esperado: PASS, 2 tests.

- [ ] **Step 5: Escribir `shared.ts`**

Server-only. Lee con `createAdminClient()` pero seleccionando **las mismas columnas que la migración concedió a `anon`** — nunca `ai_run`, `created_by_*` ni `unpublished_by_billing`. Filtra siempre por `status = 'published'` y `unpublished_by_billing = false`.

Incluye `getPublicNewsletterPaths(): Promise<{ tenantSlug, seriesSlug, editionSlug }[]>` que devuelve `[]` si la lectura falla: **un build no debe caerse porque la base no responda.**

- [ ] **Step 6: Escribir las tres páginas con ISR**

Cada una:

```ts
export const revalidate = 300
export async function generateStaticParams() { /* … */ }
```

**Las dos cosas.** Sin `generateStaticParams` el segmento dinámico no entra al manifiesto de prerender y `revalidate` se ignora en silencio: la ruta se renderiza entera en cada visita. Está verificado y documentado en `src/app/(hosted)/web/[tenantSlug]/shared.ts` — léelo antes de escribir estas páginas.

La página de edición inyecta el HTML de `renderNewsletterHtml` con `dangerouslySetInnerHTML`. **Es seguro y sólo aquí**: ese HTML lo produjo el compilador de Task 7, que escapa todo texto de usuario. Deja un comentario diciéndolo, o el próximo lector lo tomará por un descuido.

Añadir `generateMetadata` con título, descripción y `openGraph.images` apuntando a `cover_image_url`.

- [ ] **Step 7: Verificar el host del bucket en `next.config.ts`**

Run: `grep -n "remotePatterns" -A 15 next.config.ts`

Si el host de `newsletter-media` no está en la lista, añadirlo. `next/image` bloquea hosts no listados y esto ya causó una falla silenciosa de imágenes con las propiedades. El host es el mismo de `studio-images` (ambos buckets viven en el mismo proyecto Supabase), así que probablemente ya esté — **compruébalo, no lo asumas**.

- [ ] **Step 8: Verificar en el navegador**

Con `npm run dev`, abrir `http://localhost:3000/nl/<tenant-slug>/<serie>/<edicion>`. Comprobar que se ve la edición publicada, que las fuentes salen al pie con sus enlaces, y que un borrador da 404.

- [ ] **Step 9: Commit**

```bash
git add src/lib/hosted-page.ts "src/app/(hosted)/nl/" tests/newsletters/hosted-url.test.ts
git commit -m "feat(newsletters): paginas publicas alojadas"
```

---

### Task 12: Suscripción — formulario, consentimiento y marca del lead

La tarea que cierra el circuito: de visitante a lead inscrito en la secuencia.

**Files:**
- Modify: `src/app/api/intake/[publicId]/submit/route.ts`
- Create: `src/app/(hosted)/nl/[tenantSlug]/[seriesSlug]/subscribe-form.tsx`
- Test: `tests/newsletters/subscriber-marking.test.ts`

**Interfaces:**
- Consumes: el canal de tipo `newsletter` (Task 4).
- Produces: `shouldAssessFit(channelType: string, fitProfile: Record<string, unknown> | null): boolean` y `subscriberMetadata(args: { channelId: string; consentText: string; sourceUrl: string }): Record<string, unknown>`, ambas exportadas desde `src/lib/newsletters/subscriber.ts`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// tests/newsletters/subscriber-marking.test.ts
import { describe, it, expect } from 'vitest'
import { shouldAssessFit, subscriberMetadata } from '@/lib/newsletters/subscriber'

describe('shouldAssessFit', () => {
  it('no gasta IA en una suscripcion a newsletter', () => {
    expect(shouldAssessFit('newsletter', null)).toBe(false)
    expect(shouldAssessFit('newsletter', {})).toBe(false)
  })

  it('tampoco gasta IA en un formulario que no recogio ninguna dimension', () => {
    expect(shouldAssessFit('lead_magnet', {})).toBe(false)
    expect(shouldAssessFit('lead_magnet', null)).toBe(false)
  })

  it('si gasta IA cuando hay fit real', () => {
    expect(shouldAssessFit('lead_magnet', { timeline: 'under_3_months' })).toBe(true)
    expect(shouldAssessFit('contact_form', { financing: 'cash' })).toBe(true)
  })

  it('una suscripcion con fit real tampoco analiza: el canal manda', () => {
    expect(shouldAssessFit('newsletter', { timeline: 'under_3_months' })).toBe(false)
  })
})

describe('subscriberMetadata', () => {
  it('guarda la prueba del consentimiento', () => {
    const meta = subscriberMetadata({
      channelId: 'abc', consentText: 'Acepto recibir comunicaciones.', sourceUrl: 'https://news.itmano.com/aj/mercado',
    })
    const sub = meta.newsletter_subscriber as Record<string, unknown>
    expect(sub.channel_id).toBe('abc')
    expect(sub.consent).toMatchObject({
      text: 'Acepto recibir comunicaciones.',
      source_url: 'https://news.itmano.com/aj/mercado',
    })
    expect(typeof (sub.consent as Record<string, unknown>).at).toBe('string')
    expect(typeof sub.at).toBe('string')
  })
})
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run tests/newsletters/subscriber-marking.test.ts`
Esperado: FAIL — módulo no encontrado.

- [ ] **Step 3: Escribir el módulo**

```ts
// src/lib/newsletters/subscriber.ts

// Cómo entra un suscriptor de newsletter al CRM. Puro y client-safe para poder
// probarlo sin base de datos.

/**
 * Si vale la pena gastar IA analizando el fit de este lead.
 *
 * La pregunta NO es "¿es suscriptor?" sino "¿hay algo que analizar?": un
 * formulario de suscripción pide email y nombre, así que el fit_profile sale
 * vacío y el modelo produciría un briefing sobre la nada, cobrando por ello.
 * Formulado así protege además el caso de un lead magnet mal configurado que no
 * recoge ninguna dimensión.
 *
 * El canal `newsletter` se excluye siempre: aunque un día su formulario recoja
 * dimensiones, un lector no es un prospecto hasta que muestra intención — y
 * entonces lo analizan las rutas que ya existen (respuesta de email, formulario
 * de contacto, otro intake).
 */
export function shouldAssessFit(
  channelType: string,
  fitProfile: Record<string, unknown> | null,
): boolean {
  if (channelType === 'newsletter') return false
  if (!fitProfile) return false
  return Object.keys(fitProfile).length > 0
}

/**
 * La marca que hace `is_subscriber` verdadero en leads_list y saca al lead del
 * cálculo de quintiles (migración 106). Mismo mecanismo que `metadata.imported`
 * de la 080.
 *
 * `consent` guarda la PRUEBA del consentimiento: el RGPD no exige doble opt-in,
 * pero sí exige poder demostrarlo (art. 7.1), y eso no se puede añadir
 * retroactivamente a una lista ya capturada.
 */
export function subscriberMetadata(args: {
  channelId:   string
  consentText: string
  sourceUrl:   string
}): Record<string, unknown> {
  const at = new Date().toISOString()
  return {
    newsletter_subscriber: {
      at,
      channel_id: args.channelId,
      consent: { text: args.consentText, source_url: args.sourceUrl, at },
    },
  }
}
```

- [ ] **Step 4: Ejecutar el test para verificar que pasa**

Run: `npx vitest run tests/newsletters/subscriber-marking.test.ts`
Esperado: PASS, 5 tests.

- [ ] **Step 5: Enganchar en el intake**

En `src/app/api/intake/[publicId]/submit/route.ts`:

1. Importar: `import { shouldAssessFit, subscriberMetadata } from '@/lib/newsletters/subscriber'`.
2. Al construir el `metadata` del lead que se inserta, si `channelType === 'newsletter'`, fusionar `subscriberMetadata({ channelId, consentText, sourceUrl })`. El `consentText` y el `sourceUrl` llegan en el body — añadirlos al schema zod del endpoint como opcionales (`consent_text`, `source_url`), y **rechazar el envío con 400 si `channelType === 'newsletter'` y no viene `consent_text`**: sin prueba de consentimiento no se guarda el suscriptor.
3. Sustituir la línea 440:

```ts
  after(() => assessLeadFit({ leadId, tenantId, reason: 'form_submit' }))
```

por:

```ts
  // Sin fit que analizar no se gasta IA. Ver shouldAssessFit: la newsletter
  // entra siempre por aquí, y se gradúa sola cuando el lead muestra intención
  // por cualquiera de las otras rutas que ya llaman a assessLeadFit.
  if (shouldAssessFit(channelType, fitProfile)) {
    after(() => assessLeadFit({ leadId, tenantId, reason: 'form_submit' }))
  }
```

Comprobar cómo se llama la variable del fit en ese archivo (`grep -n "fitProfile\|fit_profile" "src/app/api/intake/[publicId]/submit/route.ts" | head`) y usar el nombre real.

**No se toca `enrollLeadInSequence`**: ya funciona, porque la serie es un canal con `email_sequence_id`.

- [ ] **Step 6: Escribir el formulario de suscripción**

`subscribe-form.tsx`, `'use client'`. Campos: email (requerido), nombre (requerido), y **casilla de consentimiento no premarcada** cuyo texto literal viaja como `consent_text`. Postea al endpoint de intake con el `public_id` del canal.

Copy de la casilla — español neutro, sin prometer lo que la fase 1 no hace:

> *Acepto recibir comunicaciones de [Agencia] por correo. Puedo darme de baja en cualquier momento.*

**No escribir "recibirás cada edición en tu correo":** en esta fase no se envían las ediciones a la lista (ver §10 del spec). Lo que recibe el suscriptor es la secuencia vinculada.

- [ ] **Step 7: Probar el circuito completo**

Con `npm run dev` contra el sandbox:
1. Vincular una secuencia a la serie desde `/newsletters`.
2. Abrir la página pública de la serie y suscribirse con un correo `@example.com`.
3. Comprobar en el sandbox con `execute_sql`:

```sql
select id, email, stage, current_score, is_subscriber
from leads_list where email = '<el correo>';
select status, current_step_order from lead_sequence_runs where lead_id = '<id>';
```

Esperado: `is_subscriber = true`, y una corrida de secuencia activa.

4. Comprobar que **no** entra en los quintiles:

```sql
select public.refresh_quality_bands();
select active_leads from tenant_quality_bands where tenant_id = '<tenant>';
```

Esperado: `active_leads` **no** aumentó por el suscriptor.

- [ ] **Step 8: Commit**

```bash
git add src/lib/newsletters/subscriber.ts tests/newsletters/subscriber-marking.test.ts "src/app/api/intake/[publicId]/submit/route.ts" "src/app/(hosted)/nl/"
git commit -m "feat(newsletters): suscripcion con consentimiento y marca de lead"
```

---

### Task 13: Degradación por billing

**Files:**
- Modify: `src/app/api/cron/billing-lifecycle/route.ts`

**Interfaces:**
- Consumes: `unpublished_by_billing` de Task 4.
- Produces: nada nuevo.

- [ ] **Step 1: Leer cómo se degradan las propiedades**

Run: `grep -n "unpublished_by_billing" -B 10 -A 10 "src/app/api/cron/billing-lifecycle/route.ts"`

Copiar exactamente ese mecanismo: al degradar se marca y se despublica; al restaurar sólo vuelve lo que la columna marcó.

- [ ] **Step 2: Aplicar el mismo tratamiento a `newsletter_editions`**

Junto al bloque de propiedades, añadir el equivalente sobre `newsletter_editions` (marcar `unpublished_by_billing = true` y `status = 'draft'` al degradar; al restaurar, devolver a `published` sólo las que tengan la marca y limpiarla).

- [ ] **Step 3: Verificar tipos y lint**

Run: `npx tsc --noEmit && npm run lint`
Esperado: sin errores.

- [ ] **Step 4: Correr la suite de billing**

Run: `npm run test:billing`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/cron/billing-lifecycle/route.ts"
git commit -m "feat(newsletters): degradar ediciones al caer la suscripcion"
```

---

### Task 14: Aislamiento por tenant y paridad de esquema

**Files:**
- Create: `tests/rls/newsletters.test.ts`
- Modify: `tests/schema/parity.test.ts` (listas de excepciones)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: nada nuevo.

- [ ] **Step 1: Leer el setup de RLS y un test existente**

Run: `sed -n '1,50p' tests/rls/setup.ts && ls tests/rls/`

Usar `asUser()` para obtener un token real, igual que los demás.

- [ ] **Step 2: Escribir el test de aislamiento**

Cubrir cuatro cosas:
1. Un `agent_owner` del tenant A no ve ediciones del tenant B.
2. `anon` ve una edición `published` y **no** ve una `draft`.
3. `anon` **no** ve una edición con `unpublished_by_billing = true` aunque esté `published`.
4. `anon` recibe error al pedir una columna vedada (`ai_run`), y un `select` de las columnas concedidas funciona.

El punto 4 es el que protege el contrato de grants por columna: sin él, un `select('*')` colado en el futuro rompería la página pública en producción y no antes.

- [ ] **Step 3: Ejecutar la suite**

Run: `npm run test:rls`
Esperado: PASS. **No la corras en paralelo con `test:scoring`, `test:ai-limits` ni con un build** — comparten fixtures contra la base remota.

- [ ] **Step 4: Correr la paridad de esquema**

Run: `npm run test:schema`
Esperado: FAIL, señalando que las migraciones 105 y 106 están en el sandbox y no en producción. Es correcto en este punto: la rama está aplicada sólo al sandbox.

Declarar esa diferencia en las listas de excepciones de `tests/schema/parity.test.ts`, con el motivo:

```ts
// Rama feat/newsletters: 105 y 106 aplicadas sólo al sandbox hasta que se
// aprueben en producción. VACIAR ESTA LISTA AL MERGEAR.
```

- [ ] **Step 5: Correr toda la suite unitaria**

Run: `npm run test:unit`
Esperado: PASS, incluyendo `tests/newsletters` y `tests/access/newsletters.test.ts`.

- [ ] **Step 6: Build completo**

Run: `npm run build`
Esperado: sin errores. Comprobar en la salida que las rutas `/nl/...` aparecen como estáticas o ISR, no como dinámicas — si salen dinámicas, falta `generateStaticParams` en alguna.

- [ ] **Step 7: Commit y push**

```bash
git add tests/rls/newsletters.test.ts tests/schema/parity.test.ts
git commit -m "test(newsletters): aislamiento por tenant y paridad de esquema"
git push -u origin feat/newsletters
```

---

### Task 15: Producción

**Files:** ninguno. Es una tarea de despliegue.

- [ ] **Step 1: PREGUNTAR ANTES DE ESCRIBIR EN PRODUCCIÓN**

**No apliques nada a `kvmjlrvlnhiarrqxulkr` sin permiso explícito de Dylan en esta conversación.** Producción tiene los datos reales de A&J.

Presentar: qué hacen las migraciones 105 y 106, y en particular que la 106 **recrea `leads_list` y `refresh_quality_bands`**, de los que depende `/leads` y toda la banda de calidad. Es la parte con riesgo real.

- [ ] **Step 2: Con permiso — aplicar 105 y 106 a producción**

Con `apply_migration`, en orden, verificando entre una y otra.

- [ ] **Step 3: Verificar producción inmediatamente**

```sql
select public.refresh_quality_bands();
select tenant_id, active_leads, p80, computed_at from tenant_quality_bands;
select count(*) from public.leads_list;
```

Esperado: `computed_at` de ahora, `active_leads` igual que antes de la migración (en producción todavía no hay suscriptores), y `leads_list` responde.

Abrir `/leads` en `app.itmano.com` y confirmar que carga. Es la página que rompió la migración 082 por exactamente este motivo.

- [ ] **Step 4: Vaciar las excepciones de paridad y regenerar tipos desde producción**

```bash
npm run types:db
npm run test:schema
```

Quitar de `tests/schema/parity.test.ts` las excepciones añadidas en la Task 14. **Una excepción que se queda deja de vigilar una migración de verdad.**

- [ ] **Step 5: Commit final**

```bash
git add tests/schema/parity.test.ts src/lib/supabase/database.types.ts
git commit -m "chore(newsletters): migraciones aplicadas a produccion"
git push
```

- [ ] **Step 6: Avisar a Dylan de que abra el PR**

El PR lo abre Dylan manualmente, siempre. No lo crees tú.

---

## Qué queda para el Plan 2

Cuando este plan cierre, el sistema funciona entero sin IA. El Plan 2 añade:

1. `tenants.newsletter_source_domains` editable en Ajustes → Tu negocio (la columna ya existe desde la Task 4), con validación de hostnames y tope de 64.
2. Investigación: Claude Sonnet 5 con `web_search_20260209` + `allowed_domains`, gate de `assertAiWithinLimit` antes de gastar, y la unidad de coste de búsqueda ($10 / 1.000) en el ledger.
3. Redacción: Sonnet 5 con `output_config.format` sobre `NewsletterContentSchema` — el esquema de la Task 1 se reutiliza tal cual.
4. Formato `16:9` en `src/lib/studio/canvas.ts` + plantilla editorial, y la tercera vía del `CoverPicker`.
5. Modal "Generar con IA" con la allowlist a la vista.

Nada de eso cambia el esquema ni las interfaces que este plan fija.
