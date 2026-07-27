# Paddle Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un tenant de ITMANO CRM pueda pagar su suscripción con Paddle desde el CRM, y que al dejar de pagar el sistema degrade su cuenta de forma gradual y no destructiva.

**Architecture:** La transacción de checkout se crea en el servidor (nunca en el navegador) y el cliente solo abre el overlay con el `transactionId`. Un webhook idempotente traduce los eventos de Paddle a la fila `subscriptions` del tenant mediante un **reductor puro** sin acceso a base de datos. El enforcement vive en un **único helper puro**, `getTenantAccess`, que toda la app consulta. Las dos piezas puras concentran la lógica de negocio y se testean sin red.

**Tech Stack:** Next.js 16.2.10 (App Router) · React 19.2.4 · TypeScript strict · `@paddle/paddle-node-sdk@3.8.0` · `@paddle/paddle-js@1.6.4` · Supabase Postgres + RLS · Vitest 2.1.9 · zod 4.4.3

**Spec:** `docs/superpowers/specs/2026-07-27-paddle-billing-design.md`

## Global Constraints

- **Nunca commitear secretos.** `.env.example` lista solo nombres de variable.
- **Nunca hardcodear datos de tenant.** Ningún `aj-real-estate` en código compartido.
- **RLS obligatoria** en toda tabla nueva. Escrituras solo por service role.
- **Sin `any` sin un comentario `// reason:`.** El repo usa `// eslint-disable-next-line @typescript-eslint/no-explicit-any` sobre los accesos a filas de Supabase; seguir ese patrón exacto.
- **Server Actions devuelven `{ ok: true, data }` o `{ ok: false, error }`.** Nunca lanzan al cliente.
- **Copy en español neutro latino.** Dinero siempre `"inversión"`, nunca "costo"/"precio"/"pago"/"cargo". Sin emojis en superficies de producto.
- **Colores solo por variables CSS** de `globals.css`. Ningún hex hardcodeado.
- **Commits Conventional**, imperativo, minúscula tras el tipo, ≤72 caracteres el asunto. Rama `feat/paddle-billing`, nunca `main`.
- **Antes de abrir PR:** `npm run build` y `npm run lint` limpios.
- **Migraciones: aplicar Y versionar.** Archivo en `supabase/migrations/` + `apply_migration` vía MCP de Supabase, en el mismo commit.
- **Valores de negocio fijos** (del spec): Esencial $59/mes y $590/año · Growth $129/mes y $1,290/año · Partner desde $249/mes y $2,490/año · descuento anual "2 meses gratis" · tax-exclusive · solo USD · cuota degradada 200 emails/mes · cap degradado 3 propiedades publicadas · gracia de propiedades 14 días · liberación de dominio 60 días · runs pausados >30 días se completan.

---

## Fases

**Fase 1 (Tareas 1–9) — Cobro funcionando.** Entregable independiente y desplegable: un tenant puede pagar y el CRM refleja su estado. Sin degradación todavía (equivale al comportamiento actual para quien no paga).

**Fase 2 (Tareas 10–15) — Degradación.** Añade el enforcement. Depende de la Fase 1 pero no la modifica.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/paddle/env.ts` | Lee y valida las variables de entorno; expone el cliente del SDK y los price IDs estándar |
| `src/lib/paddle/reducer.ts` | **Puro.** Traduce un evento de Paddle a un patch de la fila `subscriptions` |
| `src/lib/paddle/checkout.ts` | Crea la transacción server-side y la sesión del portal de cliente |
| `src/lib/subscriptions/access.ts` | **Puro.** La regla única de qué puede hacer un tenant según su estado |
| `src/app/api/webhooks/paddle/route.ts` | Verifica firma, deduplica, aplica el patch |
| `src/app/api/cron/billing-lifecycle/route.ts` | Plazos de 14 y 60 días |
| `scripts/paddle-catalog.ts` | Crea productos y precios por API en sandbox o live |
| `supabase/migrations/070_paddle_billing.sql` | Columnas nuevas + tabla de eventos |
| `tests/billing/*.test.ts` | Suite del reductor y del helper de acceso |

Los dos archivos puros (`reducer.ts`, `access.ts`) no importan nada de Supabase ni de red: es lo que permite testearlos como unidades rápidas.

---

### Task 1: Dependencias, entorno y cliente de Paddle

**Files:**
- Modify: `package.json`
- Create: `src/lib/paddle/env.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: nada.
- Produces: `getPaddle(): Paddle` · `paddleEnvironment(): 'sandbox' | 'production'` · `resolveStandardPriceId(plan: SubscriptionPlan, cycle: BillingCycle): string | null` · `type BillingCycle = 'month' | 'year'`

- [ ] **Step 1: Instalar los SDKs**

```bash
npm install @paddle/paddle-node-sdk@3.8.0 @paddle/paddle-js@1.6.4
```

- [ ] **Step 2: Crear el módulo de entorno**

Crear `src/lib/paddle/env.ts`:

```ts
import 'server-only'
import { Paddle, Environment } from '@paddle/paddle-node-sdk'
import type { SubscriptionPlan } from '@/lib/subscriptions'

// Único punto donde se leen las credenciales de Paddle. Sandbox y Live son
// cuentas SEPARADAS: distintos IDs de precio, keys y client tokens. Por eso los
// price IDs viven en variables de entorno — el go-live no toca código.

export type BillingCycle = 'month' | 'year'

export function paddleEnvironment(): 'sandbox' | 'production' {
  return process.env.NEXT_PUBLIC_PADDLE_ENV === 'production' ? 'production' : 'sandbox'
}

let cached: Paddle | null = null

export function getPaddle(): Paddle {
  if (cached) return cached
  const apiKey = process.env.PADDLE_API_KEY
  if (!apiKey) throw new Error('PADDLE_API_KEY no está configurada')
  cached = new Paddle(apiKey, {
    environment: paddleEnvironment() === 'production' ? Environment.production : Environment.sandbox,
  })
  return cached
}

// Los precios de Partner son por trato y viven en subscriptions.paddle_price_id,
// no aquí. Esta tabla cubre solo los planes de catálogo estándar.
const STANDARD_PRICE_ENV: Record<'esencial' | 'growth', Record<BillingCycle, string>> = {
  esencial: { month: 'PADDLE_PRICE_ESENCIAL_MONTH', year: 'PADDLE_PRICE_ESENCIAL_YEAR' },
  growth:   { month: 'PADDLE_PRICE_GROWTH_MONTH',   year: 'PADDLE_PRICE_GROWTH_YEAR'   },
}

export function resolveStandardPriceId(plan: SubscriptionPlan, cycle: BillingCycle): string | null {
  if (plan === 'partner') return null
  const varName = STANDARD_PRICE_ENV[plan][cycle]
  return process.env[varName] ?? null
}
```

- [ ] **Step 3: Documentar las variables (sin valores)**

Añadir al final de `.env.example`:

```
# ─── Paddle Billing ───────────────────────────────────────────────────────────
# Sandbox: https://sandbox-vendors.paddle.com · Live: https://vendors.paddle.com
# API key y client token: Developer Tools → Authentication
# Webhook secret: Developer Tools → Notifications → Edit destination → Secret Key
# OJO: las API keys caducan a los 90 dias por defecto (maximo 1 anio).
NEXT_PUBLIC_PADDLE_ENV=
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=
PADDLE_API_KEY=
PADDLE_NOTIFICATION_WEBHOOK_SECRET=
PADDLE_PRICE_ESENCIAL_MONTH=
PADDLE_PRICE_ESENCIAL_YEAR=
PADDLE_PRICE_GROWTH_MONTH=
PADDLE_PRICE_GROWTH_YEAR=
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/paddle/env.ts .env.example
git commit -m "feat(billing): sdk de paddle y modulo de entorno"
```

---

### Task 2: Migración 070

**Files:**
- Create: `supabase/migrations/070_paddle_billing.sql`

**Interfaces:**
- Consumes: nada.
- Produces: columnas `subscriptions.billing_cycle | paddle_customer_id | paddle_subscription_id | paddle_price_id | current_period_end | cancel_at | billing_exempt | degraded_at | last_event_at`; tabla `paddle_webhook_events`; columna `properties.unpublished_by_billing`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/070_paddle_billing.sql`:

```sql
-- 070 · Paddle Billing (fase Comercialización → Billing).
--
-- La migración 054 anticipaba: "cuando llegue el billing real, esta tabla gana
-- las columnas del proveedor sin romper nada". Esto es eso.
--
-- Modelo: Esencial y Growth se compran con un botón (precio estándar en env);
-- Partner se negocia y su precio a medida vive en paddle_price_id. El trial
-- sigue FUERA de Paddle (registro operativo del super_admin).

alter table subscriptions
  add column if not exists billing_cycle          text,
  add column if not exists paddle_customer_id     text,
  add column if not exists paddle_subscription_id text,
  add column if not exists paddle_price_id        text,
  add column if not exists current_period_end     timestamptz,
  add column if not exists cancel_at              timestamptz,
  add column if not exists billing_exempt         boolean not null default false,
  add column if not exists degraded_at            timestamptz,
  add column if not exists last_event_at          timestamptz;

alter table subscriptions drop constraint if exists subscriptions_billing_cycle_check;
alter table subscriptions add constraint subscriptions_billing_cycle_check
  check (billing_cycle is null or billing_cycle in ('month', 'year'));

-- Una suscripción de Paddle pertenece a un solo tenant.
create unique index if not exists subscriptions_paddle_subscription_id_key
  on subscriptions (paddle_subscription_id)
  where paddle_subscription_id is not null;

-- Estados nuevos: past_due y paused llegan de Paddle. cancel_requested y
-- change_requested se CONSERVAN: siguen sirviendo para Partner, que se negocia.
alter table subscriptions drop constraint if exists subscriptions_status_check;
alter table subscriptions add constraint subscriptions_status_check
  check (status in ('trial', 'active', 'past_due', 'paused',
                    'cancel_requested', 'change_requested', 'cancelled'));

-- A&J Real Estate: piloto en cortesía, nunca toca Paddle.
-- OJO: el id del tenant es 'tenant-aj'. 'aj-real-estate' es el SLUG, no el id —
-- usarlo aquí no coincidiría con ninguna fila y la exención fallaría en silencio.
-- Verificado contra la base el 2026-07-27.
update subscriptions set billing_exempt = true where tenant_id = 'tenant-aj';

-- ── Registro de eventos de webhook ───────────────────────────────────────────
-- Doble función: deduplicar el at-least-once de Paddle (event_id como PK) y
-- dejar traza de auditoría para cuando un cobro no cuadre.
create table if not exists paddle_webhook_events (
  event_id     text        primary key,
  event_type   text        not null,
  occurred_at  timestamptz not null,
  tenant_id    text        references tenants(id) on delete set null,
  payload      jsonb       not null,
  processed_at timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists paddle_webhook_events_tenant_idx
  on paddle_webhook_events (tenant_id, occurred_at desc);

alter table paddle_webhook_events enable row level security;

-- Solo ITMANO ve el log de cobros. Escrituras solo por service role.
-- Postgres no soporta CREATE POLICY IF NOT EXISTS, así que el drop previo es lo
-- que hace re-aplicable esta migración. (054 no lo lleva y por eso no se puede
-- re-aplicar; aquí no repetimos el descuido.)
drop policy if exists "paddle_webhook_events_select" on paddle_webhook_events;
create policy "paddle_webhook_events_select"
  on paddle_webhook_events for select
  using (is_super_admin());

-- ── Propiedades despublicadas por impago ─────────────────────────────────────
-- Imprescindible para la reactivación: sin este flag no se puede distinguir una
-- propiedad que despublicó el sistema de una que el cliente despublicó a
-- propósito, y se le republicaría una casa ya vendida.
alter table properties
  add column if not exists unpublished_by_billing boolean not null default false;
```

- [ ] **Step 2: Aplicar la migración a la base**

Usar la herramienta MCP `mcp__supabase__apply_migration` con `name: "070_paddle_billing"` y el contenido completo del archivo como `query`.

- [ ] **Step 3: Verificar que se aplicó**

Usar `mcp__supabase__execute_sql` con:

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='subscriptions'
  and column_name in ('billing_cycle','paddle_customer_id','paddle_subscription_id',
                      'paddle_price_id','current_period_end','cancel_at',
                      'billing_exempt','degraded_at','last_event_at')
order by column_name;
```

Expected: 9 filas. Después verificar `properties.unpublished_by_billing` y la tabla `paddle_webhook_events` de la misma forma.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/070_paddle_billing.sql
git commit -m "feat(billing): migracion 070 — columnas de paddle y log de eventos"
```

---

### Task 3: Ciclo anual en `plans.ts`

**Files:**
- Modify: `src/lib/plans.ts`
- Modify: `src/lib/subscriptions.ts`

**Interfaces:**
- Consumes: `BillingCycle` de Task 1.
- Produces: `PlanDefinition.priceAnnualUsd: number` · `PlanDefinition.inversionAnual: string` · `PlanDefinition.annualSavingsUsd: number` · `ANNUAL_MONTHS_CHARGED = 10` · `BILLING_CYCLE_LABELS`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/billing/plans-annual.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PLANS, PLAN_ORDER, ANNUAL_MONTHS_CHARGED } from '@/lib/plans'

describe('ciclo anual', () => {
  it('cobra 10 meses por 12 en todos los planes', () => {
    expect(ANNUAL_MONTHS_CHARGED).toBe(10)
    for (const key of PLAN_ORDER) {
      const p = PLANS[key]
      const monthly = p.priceUsd ?? p.basePriceUsd!
      expect(p.priceAnnualUsd).toBe(monthly * ANNUAL_MONTHS_CHARGED)
    }
  })

  it('el ahorro es de dos mensualidades', () => {
    for (const key of PLAN_ORDER) {
      const p = PLANS[key]
      const monthly = p.priceUsd ?? p.basePriceUsd!
      expect(p.annualSavingsUsd).toBe(monthly * 2)
    }
  })

  it('los importes anuales coinciden con los publicados en el spec', () => {
    expect(PLANS.esencial.priceAnnualUsd).toBe(590)
    expect(PLANS.growth.priceAnnualUsd).toBe(1290)
    expect(PLANS.partner.priceAnnualUsd).toBe(2490)
  })

  it('no publica un equivalente mensual del anual', () => {
    // 590/12 = 49.17 — redondear prometeria menos de lo que se cobra.
    for (const key of PLAN_ORDER) {
      expect(PLANS[key].inversionAnual).not.toMatch(/mes/)
    }
  })
})
```

- [ ] **Step 2: Añadir el script de test y correrlo para verlo fallar**

Añadir a `package.json` en `scripts`, después de `"test:carousels"`:

```json
"test:billing": "vitest run tests/billing"
```

Run: `npm run test:billing`
Expected: FAIL — `ANNUAL_MONTHS_CHARGED` no existe.

- [ ] **Step 3: Implementar en `plans.ts`**

Añadir a la interfaz `PlanDefinition`, después de `basePriceUsd`:

```ts
  /** Inversión anual en USD. Se cobran 10 meses y se usan 12. */
  priceAnnualUsd: number
  /** String de inversión anual ("$590 / año"). */
  inversionAnual: string
  /** Ahorro frente a 12 mensualidades, en USD. */
  annualSavingsUsd: number
```

Añadir antes de `export const PLANS`:

```ts
// ─── Ciclo anual ──────────────────────────────────────────────────────────────
// "2 meses gratis" (16.7%). Se descarta un descuento mayor: en Growth el
// presupuesto de IA es $30/mes = $360/año contra $1,290 de ingreso — 28% del
// revenue como COGS — y en posicionamiento premium un 25% off lee como
// liquidación. DELIBERADAMENTE no se publica un equivalente mensual del anual:
// $590/12 = $49.17, y redondear a "$49/mes" prometería menos de lo que se cobra
// (misma convención que aiTokensLabel: nunca prometer de más).
export const ANNUAL_MONTHS_CHARGED = 10
```

Y en cada plan, tras `inversion`:

```ts
    // esencial
    priceAnnualUsd:   590,
    inversionAnual:   '$590 / año',
    annualSavingsUsd: 118,
```

```ts
    // growth
    priceAnnualUsd:   1290,
    inversionAnual:   '$1,290 / año',
    annualSavingsUsd: 258,
```

```ts
    // partner
    priceAnnualUsd:   2490,
    inversionAnual:   'desde $2,490 / año',
    annualSavingsUsd: 498,
```

- [ ] **Step 4: Añadir los labels de ciclo en `subscriptions.ts`**

Añadir tras `SUBSCRIPTION_STATUS_LABELS`:

```ts
export type BillingCycle = 'month' | 'year'

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  month: 'Mensual',
  year:  'Anual',
}
```

Y ampliar `SubscriptionStatus` y sus labels con los estados que llegan de Paddle:

```ts
export type SubscriptionStatus =
  | 'trial' | 'active' | 'past_due' | 'paused'
  | 'cancel_requested' | 'change_requested' | 'cancelled'
```

```ts
  past_due: 'Inversión pendiente',
  paused:   'Suscripción en pausa',
```

- [ ] **Step 5: Correr los tests**

Run: `npm run test:billing`
Expected: PASS, 4 tests.

- [ ] **Step 6: Verificar tipos y commitear**

Run: `npx tsc --noEmit` → sin errores.

```bash
git add src/lib/plans.ts src/lib/subscriptions.ts tests/billing/plans-annual.test.ts package.json
git commit -m "feat(billing): ciclo anual con dos meses gratis en la fuente de planes"
```

---

### Task 4: Script de catálogo

**Files:**
- Create: `scripts/paddle-catalog.ts`

**Interfaces:**
- Consumes: `getPaddle()` de Task 1; `PLANS` de Task 3.
- Produces: ejecutable por CLI; imprime los price IDs para pegar en las variables de entorno.

- [ ] **Step 1: Escribir el script**

Crear `scripts/paddle-catalog.ts`:

```ts
/**
 * Crea el catálogo de ITMANO CRM en Paddle. Versionado a propósito: sandbox y
 * live deben salir idénticos, y un catálogo creado a clics no es auditable.
 *
 *   npx tsx scripts/paddle-catalog.ts --env=sandbox
 *   npx tsx scripts/paddle-catalog.ts --env=live
 *   npx tsx scripts/paddle-catalog.ts --env=live --partner --tenant=tecnocasa --monthly=349 --annual=3490
 *
 * Imprime los price IDs. Hay que pegarlos en .env.local y en Vercel.
 * Tax-exclusive y solo USD (decisiones del spec §3).
 */
import { config as dotenvConfig } from 'dotenv'
import { Paddle, Environment } from '@paddle/paddle-node-sdk'
import { PLANS, ANNUAL_MONTHS_CHARGED } from '../src/lib/plans'

dotenvConfig({ path: '.env.local' })

function arg(name: string): string | undefined {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`))
  return hit?.split('=')[1]
}
const has = (name: string) => process.argv.includes(`--${name}`)

const env = arg('env') === 'live' ? 'live' : 'sandbox'
const apiKey = process.env.PADDLE_API_KEY
if (!apiKey) throw new Error('PADDLE_API_KEY no está configurada en .env.local')

const paddle = new Paddle(apiKey, {
  environment: env === 'live' ? Environment.production : Environment.sandbox,
})

const usd = (dollars: number) => ({ amount: String(Math.round(dollars * 100)), currencyCode: 'USD' as const })

async function createPlan(name: string, description: string, monthly: number, annual: number) {
  const product = await paddle.products.create({
    name,
    description,
    taxCategory: 'standard',
  })

  const monthPrice = await paddle.prices.create({
    productId:    product.id,
    description:  `${name} — mensual`,
    unitPrice:    usd(monthly),
    billingCycle: { interval: 'month', frequency: 1 },
  })

  const yearPrice = await paddle.prices.create({
    productId:    product.id,
    description:  `${name} — anual (${ANNUAL_MONTHS_CHARGED} meses cobrados)`,
    unitPrice:    usd(annual),
    billingCycle: { interval: 'year', frequency: 1 },
  })

  console.log(`\n${name}`)
  console.log(`  product : ${product.id}`)
  console.log(`  mensual : ${monthPrice.id}  ($${monthly})`)
  console.log(`  anual   : ${yearPrice.id}  ($${annual})`)
  return { product, monthPrice, yearPrice }
}

async function main() {
  console.log(`Creando catálogo en Paddle [${env}]…`)

  if (has('partner')) {
    const tenant  = arg('tenant')
    const monthly = Number(arg('monthly'))
    const annual  = Number(arg('annual'))
    if (!tenant || !monthly || !annual) {
      throw new Error('Uso: --partner --tenant=<id> --monthly=<usd> --annual=<usd>')
    }
    await createPlan(
      `ITMANO CRM — Partner (${tenant})`,
      'Plan Partner a medida. Pegar el price id en subscriptions.paddle_price_id del tenant.',
      monthly,
      annual,
    )
    return
  }

  const e = await createPlan('ITMANO CRM — Esencial', PLANS.esencial.blurb, PLANS.esencial.priceUsd!, PLANS.esencial.priceAnnualUsd)
  const g = await createPlan('ITMANO CRM — Growth',   PLANS.growth.blurb,   PLANS.growth.priceUsd!,   PLANS.growth.priceAnnualUsd)

  console.log('\n─── Pegar en .env.local y en Vercel ───')
  console.log(`PADDLE_PRICE_ESENCIAL_MONTH=${e.monthPrice.id}`)
  console.log(`PADDLE_PRICE_ESENCIAL_YEAR=${e.yearPrice.id}`)
  console.log(`PADDLE_PRICE_GROWTH_MONTH=${g.monthPrice.id}`)
  console.log(`PADDLE_PRICE_GROWTH_YEAR=${g.yearPrice.id}`)
  console.log('\nPartner se crea por trato con --partner (ver cabecera del script).')
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 2: Verificar que compila sin ejecutarlo**

Run: `npx tsc --noEmit`
Expected: sin errores. **No ejecutar el script todavía** — requiere `PADDLE_API_KEY` de sandbox, que la pone Dylan.

- [ ] **Step 3: Commit**

```bash
git add scripts/paddle-catalog.ts
git commit -m "feat(billing): script versionado del catalogo de paddle"
```

---

### Task 5: El reductor puro de eventos

Esta es la pieza de lógica más delicada del plan. Es pura a propósito: sin red, sin Supabase, testeable al instante.

**Files:**
- Create: `src/lib/paddle/reducer.ts`
- Create: `tests/billing/reducer.test.ts`

**Interfaces:**
- Consumes: `SubscriptionStatus`, `SubscriptionPlan` de `@/lib/subscriptions`; `BillingCycle` de Task 1.
- Produces:
  - `mapPaddleStatus(paddleStatus: string): SubscriptionStatus`
  - `isDegraded(status: SubscriptionStatus): boolean`
  - `reduceSubscriptionEvent(event: PaddleSubscriptionEvent, current: SubscriptionSnapshot): SubscriptionPatch | null`
  - `interface PaddleSubscriptionEvent { eventId, eventType, occurredAt, subscriptionId, customerId, status, priceId, billingCycle, currentPeriodEnd, cancelAt, customData }`
  - `interface SubscriptionSnapshot { status, lastEventAt, degradedAt }`
  - `interface SubscriptionPatch` (campos snake_case listos para el `update` de Supabase)

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/billing/reducer.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  mapPaddleStatus,
  isDegraded,
  reduceSubscriptionEvent,
  type PaddleSubscriptionEvent,
  type SubscriptionSnapshot,
} from '@/lib/paddle/reducer'

const baseEvent: PaddleSubscriptionEvent = {
  eventId:          'evt_001',
  eventType:        'subscription.created',
  occurredAt:       '2026-08-01T10:00:00.000Z',
  subscriptionId:   'sub_123',
  customerId:       'ctm_123',
  status:           'active',
  priceId:          'pri_growth_month',
  billingCycle:     'month',
  currentPeriodEnd: '2026-09-01T10:00:00.000Z',
  cancelAt:         null,
  customData:       { tenant_id: 'tenant-x' },
}

const fresh: SubscriptionSnapshot = { status: 'trial', lastEventAt: null, degradedAt: null }

describe('mapPaddleStatus', () => {
  it('trialing y active dan acceso completo', () => {
    expect(mapPaddleStatus('trialing')).toBe('active')
    expect(mapPaddleStatus('active')).toBe('active')
  })

  it('mapea los estados de impago', () => {
    expect(mapPaddleStatus('past_due')).toBe('past_due')
    expect(mapPaddleStatus('paused')).toBe('paused')
    expect(mapPaddleStatus('canceled')).toBe('cancelled')
  })
})

describe('isDegraded', () => {
  it('past_due NO degrada — la tarjeta puede fallar sin ser impago', () => {
    expect(isDegraded('past_due')).toBe(false)
  })

  it('paused y cancelled degradan', () => {
    expect(isDegraded('paused')).toBe(true)
    expect(isDegraded('cancelled')).toBe(true)
  })

  it('trial y active no degradan', () => {
    expect(isDegraded('trial')).toBe(false)
    expect(isDegraded('active')).toBe(false)
  })
})

describe('reduceSubscriptionEvent', () => {
  it('escribe los identificadores de paddle y limpia el trial', () => {
    const patch = reduceSubscriptionEvent(baseEvent, fresh)!
    expect(patch.paddle_subscription_id).toBe('sub_123')
    expect(patch.paddle_customer_id).toBe('ctm_123')
    expect(patch.paddle_price_id).toBe('pri_growth_month')
    expect(patch.billing_cycle).toBe('month')
    expect(patch.status).toBe('active')
    expect(patch.trial_ends_at).toBeNull()
    expect(patch.last_event_at).toBe('2026-08-01T10:00:00.000Z')
  })

  it('descarta un evento anterior al ultimo aplicado', () => {
    const stale = { ...baseEvent, occurredAt: '2026-07-01T00:00:00.000Z' }
    const current: SubscriptionSnapshot = {
      status: 'active', lastEventAt: '2026-08-01T10:00:00.000Z', degradedAt: null,
    }
    expect(reduceSubscriptionEvent(stale, current)).toBeNull()
  })

  it('descarta un evento con el mismo occurred_at (reentrega)', () => {
    const current: SubscriptionSnapshot = {
      status: 'active', lastEventAt: '2026-08-01T10:00:00.000Z', degradedAt: null,
    }
    expect(reduceSubscriptionEvent(baseEvent, current)).toBeNull()
  })

  it('marca degraded_at al pasar a cancelled', () => {
    const ev = { ...baseEvent, eventType: 'subscription.canceled', status: 'canceled', occurredAt: '2026-09-01T00:00:00.000Z' }
    const current: SubscriptionSnapshot = { status: 'active', lastEventAt: '2026-08-01T10:00:00.000Z', degradedAt: null }
    const patch = reduceSubscriptionEvent(ev, current)!
    expect(patch.status).toBe('cancelled')
    expect(patch.degraded_at).toBe('2026-09-01T00:00:00.000Z')
  })

  it('no reinicia degraded_at si ya estaba degradado', () => {
    const ev = { ...baseEvent, status: 'paused', occurredAt: '2026-10-01T00:00:00.000Z' }
    const current: SubscriptionSnapshot = {
      status: 'cancelled', lastEventAt: '2026-09-01T00:00:00.000Z', degradedAt: '2026-09-01T00:00:00.000Z',
    }
    const patch = reduceSubscriptionEvent(ev, current)!
    expect(patch.degraded_at).toBe('2026-09-01T00:00:00.000Z')
  })

  it('limpia degraded_at al reactivar', () => {
    const ev = { ...baseEvent, status: 'active', occurredAt: '2026-11-01T00:00:00.000Z' }
    const current: SubscriptionSnapshot = {
      status: 'cancelled', lastEventAt: '2026-10-01T00:00:00.000Z', degradedAt: '2026-09-01T00:00:00.000Z',
    }
    const patch = reduceSubscriptionEvent(ev, current)!
    expect(patch.status).toBe('active')
    expect(patch.degraded_at).toBeNull()
  })

  it('LA TRAMPA: cancelar un anual NO degrada mientras el periodo siga pagado', () => {
    // Paddle deja status=active con un scheduled_change a fin de periodo.
    // Degradar aqui le cortaria el servicio a alguien que ya pago 12 meses.
    const ev: PaddleSubscriptionEvent = {
      ...baseEvent,
      eventType:        'subscription.updated',
      occurredAt:       '2026-09-01T00:00:00.000Z',
      status:           'active',
      billingCycle:     'year',
      cancelAt:         '2027-08-01T10:00:00.000Z',
      currentPeriodEnd: '2027-08-01T10:00:00.000Z',
    }
    const current: SubscriptionSnapshot = { status: 'active', lastEventAt: '2026-08-01T10:00:00.000Z', degradedAt: null }
    const patch = reduceSubscriptionEvent(ev, current)!
    expect(patch.status).toBe('active')
    expect(patch.degraded_at).toBeNull()
    expect(patch.cancel_at).toBe('2027-08-01T10:00:00.000Z')
  })
})
```

- [ ] **Step 2: Correr los tests para verlos fallar**

Run: `npm run test:billing`
Expected: FAIL — `Cannot find module '@/lib/paddle/reducer'`.

- [ ] **Step 3: Implementar el reductor**

Crear `src/lib/paddle/reducer.ts`:

```ts
// Reductor PURO de eventos de Paddle → patch de la fila `subscriptions`.
// Sin red, sin Supabase, sin Date.now(): toda la lógica de negocio del billing
// vive aquí y se testea como unidad. El route handler solo persiste el patch.

import type { SubscriptionStatus } from '@/lib/subscriptions'
import type { BillingCycle } from '@/lib/paddle/env'

export interface PaddleSubscriptionEvent {
  eventId:          string
  eventType:        string
  occurredAt:       string
  subscriptionId:   string
  customerId:       string
  /** Estado crudo de Paddle: trialing | active | past_due | paused | canceled */
  status:           string
  priceId:          string | null
  billingCycle:     BillingCycle | null
  currentPeriodEnd: string | null
  /** Cancelación agendada a fin de período. */
  cancelAt:         string | null
  customData:       Record<string, unknown> | null
}

export interface SubscriptionSnapshot {
  status:      SubscriptionStatus
  lastEventAt: string | null
  degradedAt:  string | null
}

export interface SubscriptionPatch {
  status:                  SubscriptionStatus
  /**
   * Solo se escribe si el evento lo trae en custom_data. Lo inyecta
   * createCheckoutTransaction, que es quien sabe con certeza qué se compró
   * (incluido Partner, cuyo precio es a medida). Sin esto, un tenant que compra
   * Growth se quedaría con el plan por defecto y recibiría cuotas de Esencial.
   */
  plan?:                   SubscriptionPlan
  billing_cycle:           BillingCycle | null
  paddle_customer_id:      string
  paddle_subscription_id:  string
  paddle_price_id:         string | null
  current_period_end:      string | null
  cancel_at:               string | null
  degraded_at:             string | null
  last_event_at:           string
  /** Al empezar a pagar el trial deja de existir. */
  trial_ends_at:           null
  updated_at:              string
}

// NOTA: `requested_plan` NO se toca aquí a propósito. Una solicitud sales-led la
// resuelve un humano desde el Centro de control; una renovación rutinaria de
// Paddle no debe hacerla desaparecer sin que nadie la haya atendido.

const STATUS_MAP: Record<string, SubscriptionStatus> = {
  trialing: 'active',   // trialing de Paddle = acceso completo, igual que active
  active:   'active',
  past_due: 'past_due',
  paused:   'paused',
  canceled: 'cancelled',
}

export function mapPaddleStatus(paddleStatus: string): SubscriptionStatus {
  return STATUS_MAP[paddleStatus] ?? 'active'
}

/**
 * Estados que activan el modo degradado. `past_due` NO está: un fallo de tarjeta
 * no es un impago — Paddle Retain hace el dunning primero (spec §10.4).
 */
export function isDegraded(status: SubscriptionStatus): boolean {
  return status === 'paused' || status === 'cancelled'
}

/**
 * Traduce un evento a un patch, o devuelve null si el evento es viejo.
 *
 * Paddle no garantiza el orden de entrega, así que un evento con `occurredAt`
 * anterior o igual al último aplicado se descarta: aplicarlo revertiría el
 * estado a uno ya superado.
 */
const PLAN_VALUES: SubscriptionPlan[] = ['esencial', 'growth', 'partner']

/** Lee el plan de custom_data, solo si es uno de los valores válidos. */
function planFromCustomData(customData: Record<string, unknown> | null): SubscriptionPlan | undefined {
  const raw = customData?.plan
  return typeof raw === 'string' && PLAN_VALUES.includes(raw as SubscriptionPlan)
    ? (raw as SubscriptionPlan)
    : undefined
}

export function reduceSubscriptionEvent(
  event: PaddleSubscriptionEvent,
  current: SubscriptionSnapshot,
): SubscriptionPatch | null {
  // Comparación NUMÉRICA, nunca lexicográfica. Los dos lados vienen de
  // formateadores distintos: Paddle emite "2026-08-01T10:00:00.635628Z" y
  // Postgres devuelve "2026-08-01 10:00:00.635628+00" — con espacio en vez de
  // 'T'. Como texto, cualquier fecha de Paddle resulta "mayor" que cualquiera
  // de Postgres (0x54 > 0x20) y la guardia no filtraría NADA. Date.parse es
  // puro, así que no rompe la pureza del reductor.
  const prev = current.lastEventAt ? Date.parse(current.lastEventAt) : NaN
  const now  = Date.parse(event.occurredAt)
  if (!Number.isNaN(prev) && !Number.isNaN(now) && now <= prev) return null

  const status   = mapPaddleStatus(event.status)
  const degraded = isDegraded(status)

  // degraded_at ancla los plazos de 14 y 60 días: se fija en la ENTRADA al modo
  // degradado y no se toca mientras siga degradado, para que los plazos no se
  // reinicien con cada evento. Solo un 'active' real lo limpia — `past_due` es
  // un reintento de cobro, no una vuelta al buen estado, así que preserva el
  // ancla en lugar de reiniciar los relojes de 14 y 60 días.
  const degradedAt = degraded
    ? (current.degradedAt ?? event.occurredAt)
    : (status === 'active' ? null : current.degradedAt)

  const plan = planFromCustomData(event.customData)

  return {
    status,
    ...(plan ? { plan } : {}),
    billing_cycle:          event.billingCycle,
    paddle_customer_id:     event.customerId,
    paddle_subscription_id: event.subscriptionId,
    paddle_price_id:        event.priceId,
    current_period_end:     event.currentPeriodEnd,
    cancel_at:              event.cancelAt,
    degraded_at:            degradedAt,
    last_event_at:          event.occurredAt,
    trial_ends_at:          null,
    updated_at:             event.occurredAt,
  }
}
```

- [ ] **Step 4: Correr los tests**

Run: `npm run test:billing`
Expected: PASS, todos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/paddle/reducer.ts tests/billing/reducer.test.ts
git commit -m "feat(billing): reductor puro de eventos de suscripcion de paddle"
```

---

### Task 6: El webhook

**Files:**
- Create: `src/app/api/webhooks/paddle/route.ts`
- Create: `src/lib/paddle/persist.ts`

**Interfaces:**
- Consumes: `getPaddle()` (Task 1), `reduceSubscriptionEvent` (Task 5).
- Produces: `applySubscriptionEvent(event: PaddleSubscriptionEvent): Promise<'applied' | 'stale' | 'no_tenant'>`

- [ ] **Step 1: Escribir el persistidor**

Crear `src/lib/paddle/persist.ts`:

```ts
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { reduceSubscriptionEvent, type PaddleSubscriptionEvent, type SubscriptionSnapshot } from '@/lib/paddle/reducer'
import type { SubscriptionStatus } from '@/lib/subscriptions'

/**
 * Resuelve el tenant de un evento. El puente es `custom_data.tenant_id`, que se
 * fija al CREAR la transacción en el servidor y que Paddle copia a la
 * suscripción. Fallback por paddle_subscription_id para eventos posteriores
 * cuyo custom_data pudiera venir vacío.
 */
async function resolveTenantId(event: PaddleSubscriptionEvent): Promise<string | null> {
  const fromCustomData = event.customData?.tenant_id
  if (typeof fromCustomData === 'string' && fromCustomData) return fromCustomData

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('subscriptions')
    .select('tenant_id')
    .eq('paddle_subscription_id', event.subscriptionId)
    .maybeSingle()
  // Tragar este error devolvería 'no_tenant' → 200 → Paddle deja de reintentar y
  // el evento se pierde por un fallo puramente transitorio de lectura.
  if (error) throw new Error(`No se pudo resolver el tenant del evento: ${error.message}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data as any)?.tenant_id as string | undefined) ?? null
}

export async function applySubscriptionEvent(
  event: PaddleSubscriptionEvent,
): Promise<'applied' | 'stale' | 'no_tenant'> {
  const tenantId = await resolveTenantId(event)
  if (!tenantId) {
    // 'no_tenant' acaba en un 200 (Paddle no debe reintentar algo que nunca va a
    // resolverse solo), así que este log es la ÚNICA señal de que pasó. La fila
    // de paddle_webhook_events conserva el payload íntegro con processed_at NULL
    // y es recuperable a mano — pero solo si alguien se entera.
    console.error(JSON.stringify({
      service: 'paddle-webhook', event_id: event.eventId, event_type: event.eventType,
      subscription_id: event.subscriptionId, error: 'no_tenant',
    }))
    return 'no_tenant'
  }

  const supabase = createAdminClient()
  const { data: row, error: readError } = await supabase
    .from('subscriptions')
    .select('status, last_event_at, degraded_at')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  // Un fallo de lectura NO puede degradar a los defaults: con lastEventAt null
  // se desactiva la guardia de orden del reductor, y con degradedAt null se
  // reinician los relojes de 14 y 60 días. Mejor 500 y que Paddle reintente.
  if (readError) throw new Error(`No se pudo leer la suscripción de ${tenantId}: ${readError.message}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = row as any
  const snapshot: SubscriptionSnapshot = {
    status:      (r?.status as SubscriptionStatus) ?? 'active',
    lastEventAt: (r?.last_event_at as string | null) ?? null,
    degradedAt:  (r?.degraded_at as string | null) ?? null,
  }

  const patch = reduceSubscriptionEvent(event, snapshot)
  if (!patch) return 'stale'

  const { data: updated, error } = await supabase
    .from('subscriptions').update(patch).eq('tenant_id', tenantId).select('tenant_id')
  if (error) throw new Error(`No se pudo aplicar el evento de Paddle: ${error.message}`)
  // PostgREST NO devuelve error cuando el WHERE no encuentra filas. Sin este
  // chequeo, un cobro real contra un tenant sin fila en `subscriptions` se le
  // reportaría a Paddle como 200 OK y se marcaría processed_at, mintiendo en la
  // traza. Ocurre de verdad: el alta de tenant inserta la suscripción en
  // best-effort (admin/actions.ts), así que puede faltar.
  if (!updated?.length) throw new Error(`Sin fila de subscriptions para el tenant ${tenantId}`)

  await supabase
    .from('paddle_webhook_events')
    .update({ tenant_id: tenantId, processed_at: new Date().toISOString() })
    .eq('event_id', event.eventId)

  return 'applied'
}
```

- [ ] **Step 2: Escribir el route handler**

Crear `src/app/api/webhooks/paddle/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getPaddle } from '@/lib/paddle/env'
import { applySubscriptionEvent } from '@/lib/paddle/persist'
import type { PaddleSubscriptionEvent } from '@/lib/paddle/reducer'
import type { BillingCycle } from '@/lib/paddle/env'
import { createAdminClient } from '@/lib/supabase/admin'

// Webhook de Paddle Billing. Cuatro reglas no negociables (spec §5):
//   1. Body CRUDO — cualquier parseo previo invalida la firma HMAC.
//   2. Verificar antes de confiar — unmarshal valida firma y ventana de replay.
//   3. Idempotencia por event_id — Paddle garantiza entrega at-least-once.
//   4. Orden — el reductor descarta eventos anteriores al último aplicado.

// Se manejan TODOS los eventos de suscripción, no solo created/updated/canceled.
// La doc de Paddle dice que subscription.updated "may also occur immediately
// after a dedicated lifecycle event" — "puede", no "siempre". Apostar a esa
// palabra dejaría el modo degradado inerte si Paddle no emitiera el updated tras
// un past_due o un paused. Manejar los dedicados no cuesta nada: todos llevan la
// misma entidad Subscription, el reductor decide por `status`, y los duplicados
// los absorben la PK de event_id y la guardia de orden.
const HANDLED = new Set([
  'subscription.created',
  'subscription.updated',
  'subscription.activated',
  'subscription.trialing',
  'subscription.past_due',
  'subscription.paused',
  'subscription.resumed',
  'subscription.canceled',
])

export async function POST(request: NextRequest) {
  const signature = request.headers.get('paddle-signature') ?? ''
  const secret    = process.env.PADDLE_NOTIFICATION_WEBHOOK_SECRET

  if (!secret) {
    console.error(JSON.stringify({ service: 'paddle-webhook', error: 'missing_secret' }))
    return NextResponse.json({ error: 'not configured' }, { status: 500 })
  }

  // Regla 1: el cuerpo tal cual llegó.
  const raw = await request.text()

  // Regla 2: verificar antes de confiar.
  let event
  try {
    event = await getPaddle().webhooks.unmarshal(raw, secret, signature)
  } catch {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }
  if (!event) return NextResponse.json({ error: 'invalid payload' }, { status: 400 })

  const supabase = createAdminClient()

  // Regla 3: el event_id es PK. Si ya existe, este evento ya se procesó.
  const { error: dupError } = await supabase.from('paddle_webhook_events').insert({
    event_id:    event.eventId,
    event_type:  event.eventType,
    occurred_at: event.occurredAt,
    payload:     JSON.parse(raw),
  })
  if (dupError) {
    if (dupError.code !== '23505') { // 23505 = unique_violation
      console.error(JSON.stringify({ service: 'paddle-webhook', error: dupError.message }))
      return NextResponse.json({ error: 'storage failed' }, { status: 500 })
    }
    // Ya existe la fila — pero eso NO significa que el evento se aplicara. Si un
    // intento anterior insertó la fila y luego murió aplicando el patch,
    // `processed_at` sigue en NULL y hay que reintentar: darlo por duplicado
    // sellaría el evento sin efecto PARA SIEMPRE, porque el reintento de Paddle
    // volvería a chocar con la misma PK. Reprocesar es seguro: si el intento
    // anterior sí escribió, el reductor lo descarta por `occurred_at`.
    const { data: prev, error: prevError } = await supabase
      .from('paddle_webhook_events')
      .select('processed_at')
      .eq('event_id', event.eventId)
      .maybeSingle()
    if (prevError) {
      console.error(JSON.stringify({ service: 'paddle-webhook', error: prevError.message }))
      return NextResponse.json({ error: 'storage failed' }, { status: 500 })
    }
    if (prev?.processed_at) return NextResponse.json({ ok: true, duplicate: true })
  }

  if (!HANDLED.has(event.eventType)) return NextResponse.json({ ok: true, ignored: true })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = event.data as any
  const normalized: PaddleSubscriptionEvent = {
    eventId:          event.eventId,
    eventType:        event.eventType,
    occurredAt:       event.occurredAt,
    subscriptionId:   d.id,
    customerId:       d.customerId,
    status:           d.status,
    priceId:          d.items?.[0]?.price?.id ?? null,
    billingCycle:     (d.billingCycle?.interval as BillingCycle | undefined) ?? null,
    currentPeriodEnd: d.currentBillingPeriod?.endsAt ?? null,
    cancelAt:         d.scheduledChange?.action === 'cancel' ? (d.scheduledChange.effectiveAt ?? null) : null,
    customData:       (d.customData as Record<string, unknown> | null) ?? null,
  }

  try {
    const result = await applySubscriptionEvent(normalized)
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    console.error(JSON.stringify({
      service: 'paddle-webhook', event_id: event.eventId,
      error: err instanceof Error ? err.message : String(err),
    }))
    // 500 para que Paddle reintente.
    return NextResponse.json({ error: 'processing failed' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Confirmar que el proxy no bloquea la ruta**

Leer `src/proxy.ts` y verificar que `/api/webhooks/*` está fuera del matcher de auth (el webhook de Resend ya vive ahí, así que debería estarlo). Si el matcher es una denylist que no incluye `/api`, no hay cambio. **Si hubiera que tocar el matcher, actualizar `tests/auth/middleware-matcher.test.ts` en el mismo commit** — refleja el literal.

- [ ] **Step 4: Verificar tipos y lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/paddle/route.ts src/lib/paddle/persist.ts
git commit -m "feat(billing): webhook de paddle idempotente con verificacion de firma"
```

---

### Task 7: Checkout y portal de cliente

**Files:**
- Create: `src/lib/paddle/checkout.ts`
- Create: `src/app/(dashboard)/settings/billing-actions.ts`

**Interfaces:**
- Consumes: `getPaddle`, `resolveStandardPriceId` (Task 1).
- Produces:
  - `createCheckoutTransaction(tenantId, plan, cycle): Promise<{ transactionId: string }>`
  - `createPortalUrl(tenantId): Promise<string>`
  - Server actions `startCheckout(plan, cycle)` y `openBillingPortal()`

- [ ] **Step 1: Escribir el módulo de checkout**

Crear `src/lib/paddle/checkout.ts`:

```ts
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPaddle, resolveStandardPriceId, type BillingCycle } from '@/lib/paddle/env'
import type { SubscriptionPlan } from '@/lib/subscriptions'

/**
 * Crea la transacción EN EL SERVIDOR y devuelve su id para que el navegador
 * abra el overlay con `Paddle.Checkout.open({ transactionId })`.
 *
 * Por qué server-side y no `items:[{priceId}]` desde el cliente (spec §2):
 *   1. Partner tiene precio por trato, guardado en subscriptions.paddle_price_id.
 *      Solo el servidor lo conoce; exponerlo al navegador sería filtrarlo.
 *   2. El tenant_id no puede venir del cliente — se inyecta como custom_data
 *      desde la sesión autenticada, y Paddle lo copia a la suscripción.
 *   3. Abrir el checkout con customer.id obliga a pasar además los ids de
 *      address y business; con transactionId no hace falta.
 */
export async function createCheckoutTransaction(
  tenantId: string,
  plan: SubscriptionPlan,
  cycle: BillingCycle,
): Promise<{ transactionId: string }> {
  const supabase = createAdminClient()
  const { data: row } = await supabase
    .from('subscriptions')
    .select('paddle_price_id, paddle_customer_id')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = row as any
  // Partner: precio negociado en la fila. Esencial/Growth: catálogo estándar.
  const priceId = plan === 'partner'
    ? (r?.paddle_price_id as string | null)
    : resolveStandardPriceId(plan, cycle)

  if (!priceId) {
    throw new Error(
      plan === 'partner'
        ? 'Este equipo aún no tiene una inversión Partner asignada. Contacta a ITMANO.'
        : 'La configuración de planes no está completa. Contacta a ITMANO.',
    )
  }

  const customerId = (r?.paddle_customer_id as string | null) ?? undefined

  // custom_data es el puente con el webhook: Paddle lo copia de la transacción
  // a la suscripción. Va el tenant_id (para saber a quién pertenece) y el plan
  // (para saber qué compró — este es el único punto del sistema que lo sabe con
  // certeza, incluido Partner, cuyo precio es a medida y no está en ningún env).
  // El error del SDK NO puede salir tal cual hacia el navegador: un ApiError de
  // Paddle trae `detail` en inglés y, en los 4xx de recurso inválido, suele
  // incluir el propio priceId — justo lo que no debe cruzar al cliente cuando es
  // el precio negociado de un Partner. Se registra completo en el servidor y se
  // devuelve un mensaje genérico en español.
  try {
    const txn = await getPaddle().transactions.create({
      items: [{ priceId, quantity: 1 }],
      ...(customerId ? { customerId } : {}),
      customData: { tenant_id: tenantId, plan },
    })
    return { transactionId: txn.id }
  } catch (err) {
    console.error(JSON.stringify({
      service: 'paddle-checkout', tenant_id: tenantId, plan, cycle,
      error: err instanceof Error ? err.message : String(err),
    }))
    throw new Error('No se pudo iniciar el proceso de inversión. Intenta de nuevo o contacta a ITMANO.')
  }
}

/**
 * URL autenticada del portal de cliente de Paddle (cambiar tarjeta, ver
 * facturas, cancelar). Es de UN SOLO USO y vida corta: se genera on-demand y
 * nunca se cachea ni se persiste.
 */
export async function createPortalUrl(tenantId: string): Promise<string> {
  const supabase = createAdminClient()
  const { data: row } = await supabase
    .from('subscriptions')
    .select('paddle_customer_id, paddle_subscription_id')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = row as any
  const customerId = r?.paddle_customer_id as string | null
  if (!customerId) throw new Error('Este equipo todavía no tiene una suscripción activa en Paddle.')

  const subscriptionId = r?.paddle_subscription_id as string | null

  // Mismo criterio que en el checkout: el error crudo del SDK se queda en el
  // servidor y al cliente le llega un mensaje en español, sin identificadores.
  try {
    const session = await getPaddle().customerPortalSessions.create(
      customerId,
      subscriptionId ? [subscriptionId] : [],
    )
    return session.urls.general.overview
  } catch (err) {
    console.error(JSON.stringify({
      service: 'paddle-portal', tenant_id: tenantId,
      error: err instanceof Error ? err.message : String(err),
    }))
    throw new Error('No se pudo abrir el portal de inversión. Intenta de nuevo o contacta a ITMANO.')
  }
}
```

- [ ] **Step 2: Escribir las server actions**

Crear `src/app/(dashboard)/settings/billing-actions.ts`:

```ts
'use server'

import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { requireWriteAccess } from '@/lib/auth/guards'
import { createCheckoutTransaction, createPortalUrl } from '@/lib/paddle/checkout'
import type { SubscriptionPlan } from '@/lib/subscriptions'
import type { BillingCycle } from '@/lib/paddle/env'

const PLAN_VALUES: SubscriptionPlan[] = ['esencial', 'growth', 'partner']

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export async function startCheckout(
  plan: string,
  cycle: string,
): Promise<Result<{ transactionId: string }>> {
  const ctx    = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const tenantId = ctx.tenant_id
  if (!tenantId) return { ok: false, error: 'Selecciona un equipo desde el centro de control.' }

  if (!PLAN_VALUES.includes(plan as SubscriptionPlan)) return { ok: false, error: 'Plan inválido.' }
  if (cycle !== 'month' && cycle !== 'year') return { ok: false, error: 'Ciclo de facturación inválido.' }

  try {
    const data = await createCheckoutTransaction(tenantId, plan as SubscriptionPlan, cycle as BillingCycle)
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo iniciar el proceso.' }
  }
}

export async function openBillingPortal(): Promise<Result<{ url: string }>> {
  const ctx    = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const tenantId = ctx.tenant_id
  if (!tenantId) return { ok: false, error: 'Selecciona un equipo desde el centro de control.' }

  try {
    const url = await createPortalUrl(tenantId)
    return { ok: true, data: { url } }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo abrir el portal.' }
  }
}
```

- [ ] **Step 3: Confirmar la firma de `requireWriteAccess`**

Leer `src/lib/auth/guards.ts` y verificar que `requireWriteAccess(ctx)` devuelve `{ ok: false; error: string } | null` (es el patrón usado en `settings/actions.ts:397`). Si la forma difiere, ajustar el tipo `Result` para que encaje.

- [ ] **Step 4: Verificar tipos y lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/paddle/checkout.ts "src/app/(dashboard)/settings/billing-actions.ts"
git commit -m "feat(billing): transaccion de checkout server-side y portal de cliente"
```

---

### Task 8: Botón de checkout en `/settings`

**Files:**
- Create: `src/components/dashboard/paddle-checkout-button.tsx`
- Modify: `src/app/(dashboard)/settings/settings-client.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx`

**Interfaces:**
- Consumes: `startCheckout`, `openBillingPortal` (Task 7); `BILLING_CYCLE_LABELS` (Task 3).
- Produces: componente `<PaddleCheckoutButton plan cycle label />`

- [ ] **Step 1: Escribir el componente de checkout**

Crear `src/components/dashboard/paddle-checkout-button.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { initializePaddle, type Paddle } from '@paddle/paddle-js'
import { startCheckout } from '@/app/(dashboard)/settings/billing-actions'
import type { SubscriptionPlan } from '@/lib/subscriptions'

// El client token es público a propósito: solo abre checkouts y previsualiza
// precios. La API key NUNCA llega al navegador.

interface Props {
  plan:  SubscriptionPlan
  cycle: 'month' | 'year'
  label: string
}

export function PaddleCheckoutButton({ plan, cycle, label }: Props) {
  const [paddle, setPaddle]   = useState<Paddle | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [pending, startTx]    = useTransition()

  async function ensurePaddle(): Promise<Paddle | null> {
    if (paddle) return paddle
    const instance = await initializePaddle({
      environment: process.env.NEXT_PUBLIC_PADDLE_ENV === 'production' ? 'production' : 'sandbox',
      token:       process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? '',
    })
    setPaddle(instance ?? null)
    return instance ?? null
  }

  function onClick() {
    setError(null)
    startTx(async () => {
      const result = await startCheckout(plan, cycle)
      if (!result.ok) { setError(result.error); return }

      const instance = await ensurePaddle()
      if (!instance) { setError('No se pudo cargar el proceso de inversión.'); return }

      instance.Checkout.open({
        transactionId: result.data.transactionId,
        settings: { theme: 'dark', displayMode: 'overlay' },
      })
    })
  }

  return (
    <div>
      <button
        onClick={onClick}
        disabled={pending}
        style={{
          background: 'var(--accent-gold)', color: 'var(--bg-base)',
          border: 'none', borderRadius: 8, padding: '10px 18px',
          fontSize: 14, fontWeight: 500, cursor: pending ? 'default' : 'pointer',
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? 'Preparando…' : label}
      </button>
      {error && (
        <p style={{ color: 'var(--accent-coral)', fontSize: 13, marginTop: 8 }}>{error}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Leer la sección de suscripción actual**

Leer `src/app/(dashboard)/settings/settings-client.tsx` y localizar el bloque que hoy renderiza el plan y los botones de `requestSubscriptionChange` / `requestSubscriptionCancel`. Anotar cómo recibe la suscripción por props desde `page.tsx`.

- [ ] **Step 3: Extender la sección**

En `settings-client.tsx`, dentro de la sección de suscripción:

- Mostrar `BILLING_CYCLE_LABELS[sub.billingCycle]` y la fecha de `currentPeriodEnd` cuando existan: `Renueva el {fecha}`.
- Si `sub.cancelAt` existe: `Tu suscripción termina el {fecha}. Conservas el acceso completo hasta entonces.`
- Renderizar `<PaddleCheckoutButton>` para Esencial y Growth con selector Mensual/Anual.
- Para Partner: renderizar el botón **solo si `sub.paddlePriceId` no es null**; si es null, mantener el flujo actual de solicitud.
- Añadir un botón "Gestionar inversión y facturas" que llame a `openBillingPortal()` y haga `window.location.href = result.data.url` — **nunca cachear esa URL**, es de un solo uso.

- [ ] **Step 4: Extender la lectura de datos**

En `src/lib/data/subscriptions.ts`, ampliar el `select` y el tipo `TenantSubscription`:

```ts
    .select('plan, status, requested_plan, trial_ends_at, billing_cycle, current_period_end, cancel_at, paddle_price_id, paddle_customer_id, billing_exempt, degraded_at')
```

Y en `src/lib/subscriptions.ts`, ampliar `TenantSubscription`:

```ts
  billingCycle:     BillingCycle | null
  currentPeriodEnd: string | null
  cancelAt:         string | null
  paddlePriceId:    string | null
  paddleCustomerId: string | null
  billingExempt:    boolean
  degradedAt:       string | null
```

Mapear cada campo en `getSubscription`.

- [ ] **Step 5: Verificar en el navegador**

Run: `npm run dev` y abrir `/settings`.
Expected: la sección de suscripción muestra plan y ciclo. El botón de inversión aparece; al pulsarlo sin credenciales de Paddle configuradas debe mostrar el mensaje de error en rojo, **no romper la página**.

- [ ] **Step 6: Verificar y commitear**

Run: `npx tsc --noEmit && npm run lint`

```bash
git add src/components/dashboard/paddle-checkout-button.tsx "src/app/(dashboard)/settings" src/lib/data/subscriptions.ts src/lib/subscriptions.ts
git commit -m "feat(billing): checkout y portal de paddle en configuracion"
```

---

### Task 9: Toggle anual en `/planes` y campos de Paddle en `/admin`

**Files:**
- Modify: `src/app/(marketing)/planes/` (la página y su cliente)
- Modify: `src/app/(dashboard)/admin/admin-client.tsx`
- Modify: `src/app/(dashboard)/admin/actions.ts`

- [ ] **Step 1: Leer las superficies actuales**

Leer la página de `/planes` y `admin-client.tsx` para seguir sus patrones de tabs e islas interactivas (el patrón canónico es `lead-magnets/lm-tabs.tsx`).

- [ ] **Step 2: Añadir el toggle en `/planes`**

Componente cliente mínimo con estado `cycle: 'month' | 'year'`, dos botones (Mensual / Anual). Al elegir Anual, cada tarjeta muestra `plan.inversionAnual` y, debajo, `2 meses gratis · ahorras $${plan.annualSavingsUsd}`.

Añadir bajo la parrilla de planes, en texto secundario:

```
Los impuestos correspondientes se calculan al momento de completar tu inversión.
```

El CTA sigue siendo "Contáctanos" — la adquisición no cambia.

- [ ] **Step 3: Añadir los campos de Paddle en el Centro de control**

En la tarjeta de cada tenant del hub de super_admin:

- Mostrar `status`, `billing_cycle`, `current_period_end` y `degraded_at`.
- Campo de texto para `paddle_price_id` (necesario para Partner) con una server action que lo guarde.
- Checkbox para `billing_exempt`.

Ambas escrituras van por `createAdminClient()` y exigen `ctx.role === 'super_admin'`.

- [ ] **Step 4: Verificar en el navegador**

Run: `npm run dev`
Expected: `/planes` alterna entre importes mensuales y anuales; `/admin` muestra y guarda `paddle_price_id` y `billing_exempt`.

- [ ] **Step 5: Verificar y commitear**

Run: `npm run build && npm run lint`

```bash
git add "src/app/(marketing)/planes" "src/app/(dashboard)/admin"
git commit -m "feat(billing): toggle anual en planes y campos de paddle en el centro de control"
```

> **Fin de la Fase 1.** En este punto un tenant puede pagar y el CRM refleja su estado. Desplegable de forma independiente.

---

### Task 10: El helper de acceso

La segunda pieza pura. Concentra toda la regla de degradación.

**Files:**
- Create: `src/lib/subscriptions/access.ts`
- Create: `tests/billing/access.test.ts`

**Interfaces:**
- Consumes: `SubscriptionStatus`, `SubscriptionPlan`; `PLANS` (Task 3); `isDegraded` (Task 5).
- Produces:
  - `getTenantAccess(input: AccessInput): TenantAccess`
  - `DEGRADED_LIMITS = { monthlyEmailQuota: 200, publishedPropertiesCap: 3 }`
  - `GRACE_DAYS = { properties: 14, sendingDomain: 60, staleRun: 30 }`
  - `isRunStale(nextSendAt: string, now: Date): boolean`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/billing/access.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getTenantAccess, DEGRADED_LIMITS } from '@/lib/subscriptions/access'

const growthActive = { status: 'active' as const, plan: 'growth' as const, billingExempt: false }

describe('getTenantAccess — estados con acceso completo', () => {
  it('active tiene todo', () => {
    const a = getTenantAccess(growthActive)
    expect(a.canUseAi).toBe(true)
    expect(a.customDomainAllowed).toBe(true)
    expect(a.sequencesRunnable).toBe(true)
    expect(a.monthlyEmailQuota).toBeNull()
    expect(a.banner).toBeNull()
  })

  it('trial tiene todo', () => {
    expect(getTenantAccess({ ...growthActive, status: 'trial' }).canUseAi).toBe(true)
  })

  it('past_due conserva TODO el acceso y solo avisa', () => {
    // Un fallo de tarjeta no es un impago: Paddle Retain hace el dunning.
    const a = getTenantAccess({ ...growthActive, status: 'past_due' })
    expect(a.canUseAi).toBe(true)
    expect(a.customDomainAllowed).toBe(true)
    expect(a.sequencesRunnable).toBe(true)
    expect(a.monthlyEmailQuota).toBeNull()
    expect(a.banner?.tone).toBe('amber')
  })
})

describe('getTenantAccess — modo degradado', () => {
  for (const status of ['paused', 'cancelled'] as const) {
    it(`${status} apaga la IA por completo`, () => {
      expect(getTenantAccess({ ...growthActive, status }).canUseAi).toBe(false)
    })

    it(`${status} revoca el dominio propio`, () => {
      expect(getTenantAccess({ ...growthActive, status }).customDomainAllowed).toBe(false)
    })

    it(`${status} limita los envios corporativos a ${DEGRADED_LIMITS.monthlyEmailQuota}`, () => {
      expect(getTenantAccess({ ...growthActive, status }).monthlyEmailQuota)
        .toBe(DEGRADED_LIMITS.monthlyEmailQuota)
    })

    it(`${status} para las secuencias y bloquea crear mas`, () => {
      const a = getTenantAccess({ ...growthActive, status })
      expect(a.sequencesRunnable).toBe(false)
      expect(a.canCreateSequences).toBe(false)
    })

    it(`${status} limita las propiedades publicadas a ${DEGRADED_LIMITS.publishedPropertiesCap}`, () => {
      expect(getTenantAccess({ ...growthActive, status }).publishedPropertiesCap)
        .toBe(DEGRADED_LIMITS.publishedPropertiesCap)
    })

    it(`${status} muestra banner rojo`, () => {
      expect(getTenantAccess({ ...growthActive, status }).banner?.tone).toBe('red')
    })
  }
})

describe('getTenantAccess — billing_exempt', () => {
  it('A&J en cortesia conserva acceso completo aunque este cancelada', () => {
    const a = getTenantAccess({ status: 'cancelled', plan: 'growth', billingExempt: true })
    expect(a.canUseAi).toBe(true)
    expect(a.customDomainAllowed).toBe(true)
    expect(a.monthlyEmailQuota).toBeNull()
    expect(a.banner).toBeNull()
  })
})

describe('getTenantAccess — el modo degradado NO es solo-lectura', () => {
  it('no expone ningun flag que impida escribir', () => {
    const a = getTenantAccess({ ...growthActive, status: 'cancelled' })
    expect('canWrite' in a).toBe(false)
  })

  it('no expone ningun flag que impida exportar', () => {
    // Spec §10.1: la exportación nunca se bloquea. Es argumento de venta ("tus
    // datos no quedan secuestrados") y obligación de portabilidad GDPR con
    // clientes en la UE. Que no exista el flag es la garantía estructural.
    const a = getTenantAccess({ ...growthActive, status: 'cancelled' })
    expect('canExport' in a).toBe(false)
  })
})
```

- [ ] **Step 2: Correr para verlos fallar**

Run: `npm run test:billing`
Expected: FAIL — `Cannot find module '@/lib/subscriptions/access'`.

- [ ] **Step 3: Implementar**

Crear `src/lib/subscriptions/access.ts`:

```ts
// La regla ÚNICA de qué puede hacer un tenant según el estado de su suscripción.
// Pura: sin red, sin Supabase. Toda la app consulta este objeto en vez de
// reimplementar la regla en cada superficie.
//
// Principio (spec §6.1): el modo degradado NO es solo-lectura. El tenant sigue
// creando y editando leads, notas, propiedades y agentes con normalidad. Se
// corta exclusivamente lo que le cuesta dinero a ITMANO (IA, envíos por Resend,
// slot de dominio) o lo que constituye entrega de valor continua (propiedades
// publicadas a la web). Un CRM que no deja escribir no es un CRM degradado, es
// un CRM roto, y destruye la posibilidad de recuperar al cliente.

import { PLANS } from '@/lib/plans'
import { isDegraded } from '@/lib/paddle/reducer'
import type { SubscriptionPlan, SubscriptionStatus } from '@/lib/subscriptions'

export const DEGRADED_LIMITS = {
  /**
   * Envíos corporativos (por Resend) al mes en modo degradado. El número solo
   * no protege: una secuencia puede quemarlos en un minuto desde una cuenta que
   * nadie supervisa, y eso daña la reputación del dominio COMPARTIDO que usan
   * todos los demás tenants. Por eso además se paran las secuencias: envío
   * humano sí, automatización no. 200/mes son ~7 al día.
   */
  monthlyEmailQuota: 200,
  /**
   * La web pública es el activo del cliente, no de ITMANO. Vaciarla es hostil y
   * quema una relación recuperable; tres la mantiene viva y evidentemente
   * degradada.
   */
  publishedPropertiesCap: 3,
} as const

export const GRACE_DAYS = {
  /** Días para que el owner elija qué propiedades conserva publicadas. */
  properties: 14,
  /** Días antes de liberar el slot de dominio en Resend. */
  sendingDomain: 60,
  /** Un envío vencido más tiempo que esto no se dispara: el run se completa. */
  staleRun: 30,
} as const

/**
 * Guardia de frescura de un run de secuencia. Enviar el "paso 3" a un lead que
 * lleva meses sin saber del agente es malo para el cliente y malo para la
 * deliverability. Se evalúa justo ANTES de enviar, así que cubre cualquier
 * causa de obsolescencia (suscripción caída, cron parado, run reactivado a
 * mano), no solo el impago.
 */
export function isRunStale(nextSendAt: string, now: Date): boolean {
  const days = (now.getTime() - new Date(nextSendAt).getTime()) / 86_400_000
  return days > GRACE_DAYS.staleRun
}

export interface AccessInput {
  status:        SubscriptionStatus
  plan:          SubscriptionPlan
  billingExempt: boolean
}

export interface TenantAccess {
  canUseAi:               boolean
  canCreateSequences:     boolean
  sequencesRunnable:      boolean
  customDomainAllowed:    boolean
  /** null = sin límite propio (rige el del plan). */
  monthlyEmailQuota:      number | null
  /** null = rige el del plan. */
  publishedPropertiesCap: number | null
  banner: { tone: 'amber' | 'red'; message: string; cta: string } | null
}

const FULL_ACCESS = (plan: SubscriptionPlan): TenantAccess => ({
  canUseAi:               true,
  canCreateSequences:     true,
  sequencesRunnable:      true,
  customDomainAllowed:    PLANS[plan].features.customSendingDomain,
  monthlyEmailQuota:      null,
  publishedPropertiesCap: null,
  banner:                 null,
})

export function getTenantAccess(input: AccessInput): TenantAccess {
  // Cortesía (A&J, piloto): nunca se degrada.
  if (input.billingExempt) return FULL_ACCESS(input.plan)

  // past_due conserva TODO el acceso: un fallo de tarjeta no es un impago y
  // Paddle Retain hace el dunning primero (spec §10.4).
  if (input.status === 'past_due') {
    return {
      ...FULL_ACCESS(input.plan),
      banner: {
        tone:    'amber',
        // "método de pago" rompe la regla de money-words del proyecto (nunca
        // costo/precio/pago/cargo en copy visible). Se nombra la tarjeta, que es
        // además más concreto para quien tiene que actuar.
        message: 'No pudimos procesar tu inversión de este período. Actualiza los datos de tu tarjeta para no interrumpir tu operación.',
        cta:     'Gestionar inversión',
      },
    }
  }

  if (!isDegraded(input.status)) return FULL_ACCESS(input.plan)

  return {
    canUseAi:               false,
    canCreateSequences:     false,
    sequencesRunnable:      false,
    customDomainAllowed:    false,
    monthlyEmailQuota:      DEGRADED_LIMITS.monthlyEmailQuota,
    publishedPropertiesCap: DEGRADED_LIMITS.publishedPropertiesCap,
    banner: {
      tone:    'red',
      message: 'Tu suscripción está inactiva. Conservas tus datos y puedes exportarlos; la generación con IA y las secuencias automáticas están en pausa.',
      cta:     'Reactivar suscripción',
    },
  }
}
```

- [ ] **Step 4: Correr los tests**

Run: `npm run test:billing`
Expected: PASS, todos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/subscriptions/access.ts tests/billing/access.test.ts
git commit -m "feat(billing): helper puro de acceso por estado de suscripcion"
```

---

### Task 11: Enforcement de IA y de dominio de envío

**Files:**
- Modify: `src/lib/services/ai-limit.ts`
- Modify: `src/lib/services/sender-identity.ts`
- Modify: `src/lib/services/process-sequence-run.ts:168`
- Modify: `src/lib/services/send-one-off-email.ts:51`
- Modify: `src/lib/services/send-purchase-email.ts:179`
- Create: `tests/billing/sender-identity-degraded.test.ts`

**Interfaces:**
- Consumes: `getTenantAccess` (Task 10).
- Produces: `resolveSenderIdentity(t, opts?: { customDomainAllowed?: boolean })` · `getTenantAccessFor(tenantId): Promise<TenantAccess>`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/billing/sender-identity-degraded.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveSenderIdentity } from '@/lib/services/sender-identity'

const tenantConDominio = {
  name:               'TECNOCASA El Prat',
  slug:               'tecnocasa',
  email_from_address: 'Hector <hector@mail.tecnocasa.es>',
  resend_account:     'itmano',
  domain_status:      'verified',
}

describe('resolveSenderIdentity con dominio revocado', () => {
  it('usa el dominio propio cuando está permitido', () => {
    const id = resolveSenderIdentity(tenantConDominio, { customDomainAllowed: true })
    expect(id?.from).toBe('Hector <hector@mail.tecnocasa.es>')
  })

  it('cae al dominio compartido de ITMANO cuando está revocado', () => {
    const id = resolveSenderIdentity(tenantConDominio, { customDomainAllowed: false })
    expect(id?.from).toBe('TECNOCASA El Prat <tecnocasa@mail.itmano.com>')
  })

  it('revocar fuerza tambien la cuenta itmano', () => {
    // Un from de mail.itmano.com no está verificado en la cuenta Resend de A&J.
    const aj = { ...tenantConDominio, resend_account: 'aj' }
    const id = resolveSenderIdentity(aj, { customDomainAllowed: false })
    expect(id?.account).toBe('itmano')
    expect(id?.from).toBe('TECNOCASA El Prat <tecnocasa@mail.itmano.com>')
  })

  it('sin opciones se comporta como antes (compatibilidad)', () => {
    const id = resolveSenderIdentity(tenantConDominio)
    expect(id?.from).toBe('Hector <hector@mail.tecnocasa.es>')
  })
})
```

- [ ] **Step 2: Correr para verlo fallar**

Run: `npm run test:billing`
Expected: FAIL — el tercer y cuarto caso fallan (la firma no acepta opciones).

- [ ] **Step 3: Modificar `sender-identity.ts`**

Reemplazar la firma y el cuerpo de `resolveSenderIdentity`:

```ts
export interface SenderIdentityOptions {
  /**
   * false cuando la suscripción está degradada: se fuerza el dominio compartido
   * de ITMANO. NO se toca tenants.email_from_address en la base — el override
   * ocurre aquí, en la resolución. Es deliberado: el webhook inbound de Resend
   * resuelve el tenant comparando el `to` del reply contra ese campo, así que
   * borrarlo dejaría huérfanas las respuestas a conversaciones en vuelo.
   * Default true = comportamiento previo intacto.
   */
  customDomainAllowed?: boolean
}

export function resolveSenderIdentity(
  t: TenantSenderFields,
  opts: SenderIdentityOptions = {},
): SenderIdentity | null {
  const customAllowed = opts.customDomainAllowed ?? true
  const shared = `${t.name} <${t.slug}@${ITMANO_SHARED_DOMAIN}>`

  // Degradado: dominio compartido y cuenta de ITMANO. Forzar la cuenta es
  // necesario — un from de mail.itmano.com no está verificado en la de A&J.
  if (!customAllowed) return { account: 'itmano', from: shared }

  const account = resolveResendAccount(t.resend_account)

  // A&J / legacy: sin cambios.
  if (account === 'aj') {
    return t.email_from_address ? { account, from: t.email_from_address } : null
  }

  // ITMANO: dominio propio verificado, si no el compartido.
  const useCustom = t.domain_status === 'verified' && !!t.email_from_address
  return { account, from: useCustom ? (t.email_from_address as string) : shared }
}
```

- [ ] **Step 4: Correr los tests**

Run: `npm run test:billing`
Expected: PASS.

- [ ] **Step 5: Añadir el lector de acceso por tenant**

Crear `src/lib/subscriptions/access-server.ts`. Va en un archivo aparte de
`access.ts` a propósito: `access.ts` debe seguir siendo puro e importable desde
tests sin `server-only` ni Supabase.

```ts
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantAccess, type TenantAccess } from '@/lib/subscriptions/access'
import type { SubscriptionPlan, SubscriptionStatus } from '@/lib/subscriptions'

/** Lee la suscripción del tenant y devuelve su acceso. Una query barata. */
export async function getTenantAccessFor(tenantId: string): Promise<TenantAccess> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('subscriptions')
    .select('plan, status, billing_exempt')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = data as any
  return getTenantAccess({
    plan:          (s?.plan as SubscriptionPlan) ?? 'esencial',
    status:        (s?.status as SubscriptionStatus) ?? 'active',
    billingExempt: (s?.billing_exempt as boolean) ?? false,
  })
}
```

- [ ] **Step 6: Enchufar el gate de IA**

En `src/lib/services/ai-limit.ts`, dentro de `assertAiWithinLimit`, justo después de la comprobación de `super_admin` y `tenant_id`:

```ts
  // Suscripción inactiva: la IA se apaga por completo (spec §6.2).
  const access = await getTenantAccessFor(ctx.tenant_id)
  if (!access.canUseAi) {
    return {
      ok: false,
      error: 'La generación con IA está en pausa porque tu suscripción está inactiva. Reactívala desde Configuración para volver a usarla.',
    }
  }
```

Importar `getTenantAccessFor` de `@/lib/subscriptions/access-server`.

- [ ] **Step 7: Pasar el acceso a los cuatro servicios de envío**

En cada uno de los sitios donde hoy se llama `resolveSenderIdentity(...)`, obtener antes el acceso del tenant y pasarlo:

- `process-sequence-run.ts:168` — el tenant id está en `pending`; llamar `getTenantAccessFor(tenantId)` y pasar `{ customDomainAllowed: access.customDomainAllowed }`.
- `send-one-off-email.ts:51` — mismo patrón tras cargar el tenant.
- `send-purchase-email.ts:179` — mismo patrón.
- `send-sequence-email.ts` recibe la identidad ya resuelta desde `process-sequence-run`, así que no requiere cambio propio.

- [ ] **Step 8: Verificar y commitear**

Run: `npm run test:billing && npx tsc --noEmit && npm run lint`

```bash
git add src/lib/services src/lib/subscriptions tests/billing/sender-identity-degraded.test.ts
git commit -m "feat(billing): apagar ia y revocar dominio propio al degradar"
```

---

### Task 12: Cuota de envío, secuencias y propiedades

**Files:**
- Create: `src/lib/subscriptions/quota.ts`
- Modify: `src/lib/services/send-one-off-email.ts`
- Modify: `src/lib/services/process-sequence-run.ts` (gate de suscripción + guardia de frescura)
- Modify: `src/app/(dashboard)/emails/` (acción de crear secuencia)
- Modify: `src/app/(dashboard)/properties/actions.ts`
- Create: `tests/billing/quota.test.ts`

**Interfaces:**
- Consumes: `getTenantAccessFor` (Task 11).
- Produces: `assertEmailQuota(tenantId): Promise<{ ok: false; error: string } | null>` · `countMonthlyCorporateSends(tenantId): Promise<number>`

- [ ] **Step 1: Escribir el módulo de cuota**

Crear `src/lib/subscriptions/quota.ts`:

```ts
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantAccessFor } from '@/lib/subscriptions/access-server'

// Cuota de envío CORPORATIVO (por Resend) en modo degradado. El modo Personal
// del composer (mailto:) NO pasa por aquí y es ilimitado a propósito: no toca
// Resend, no cuesta nada y no arriesga la reputación del dominio compartido.

function monthStartIso(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

export async function countMonthlyCorporateSends(tenantId: string): Promise<number> {
  const supabase = createAdminClient()
  const { count } = await supabase
    .from('email_sends')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('sent_at', monthStartIso())
  return count ?? 0
}

/**
 * Gate para los servicios de envío. Devuelve null si puede enviar, o un
 * `{ ok: false, error }` listo para retornar (mismo patrón que assertAiWithinLimit).
 */
export async function assertEmailQuota(
  tenantId: string,
): Promise<{ ok: false; error: string } | null> {
  const access = await getTenantAccessFor(tenantId)
  if (access.monthlyEmailQuota === null) return null

  const used = await countMonthlyCorporateSends(tenantId)
  if (used < access.monthlyEmailQuota) return null

  return {
    ok: false,
    error: 'Alcanzaste el límite mensual de envíos de tu suscripción inactiva. Puedes seguir escribiendo a tus leads desde tu propio correo con la opción Personal, o reactivar tu suscripción.',
  }
}
```

- [ ] **Step 2: Escribir el test**

Crear `tests/billing/quota.test.ts` con un test puro del umbral, usando el helper de acceso directamente:

```ts
import { describe, it, expect } from 'vitest'
import { getTenantAccess, DEGRADED_LIMITS } from '@/lib/subscriptions/access'

describe('cuota de envio corporativo', () => {
  it('un tenant activo no tiene cuota propia', () => {
    expect(getTenantAccess({ status: 'active', plan: 'growth', billingExempt: false }).monthlyEmailQuota).toBeNull()
  })

  it('un tenant degradado tiene exactamente 200', () => {
    expect(getTenantAccess({ status: 'cancelled', plan: 'growth', billingExempt: false }).monthlyEmailQuota).toBe(200)
    expect(DEGRADED_LIMITS.monthlyEmailQuota).toBe(200)
  })
})
```

- [ ] **Step 3: Enchufar la cuota en el envío one-off**

En `send-one-off-email.ts`, antes de llamar a Resend:

```ts
  const quotaDenied = await assertEmailQuota(tenantId)
  if (quotaDenied) return quotaDenied
```

- [ ] **Step 4: Parar las secuencias en modo degradado**

**Importante — no escribir `status` en la base.** En `ProcessRunResult`,
`action: 'paused'` es un valor de **reporte**, no un estado de fila: el guard de
email bloqueado (`process-sequence-run.ts:105-120`) devuelve `action: 'paused'`
y escribe `status: 'cancelled'`. Aquí el run se queda en `active` con su
`next_send_at` vencido; el gate lo frena en cada tick sin enviar, y al reactivar
la suscripción se reanuda solo. Sin barrido de reactivación y sin columna nueva.

En `process-sequence-run.ts`, **después** del bloque que carga el tenant (el
`select` de la línea ~68, que es donde el `tenant_id` está disponible) y antes
de resolver la identidad de envío:

```ts
  // Suscripción degradada: no se envía nada automático. El run NO cambia de
  // estado — vuelve a evaluarse en el siguiente tick, y al reactivar sigue solo.
  const access = await getTenantAccessFor(tenantId)
  if (!access.sequencesRunnable) {
    return {
      action:  'paused',
      reason:  'subscription_inactive',
      details: 'Suscripción inactiva: las secuencias automáticas están en pausa',
      ...diag,
    }
  }
```

- [ ] **Step 4b: Guardia de frescura antes de enviar**

En el mismo archivo, justo antes de delegar el envío a `sendSequenceEmail`:

```ts
  // Un envío vencido hace meses no se dispara: le mandaría el "paso 3" a un
  // lead que no sabe nada del agente desde entonces. Se completa el run y el
  // owner re-inscribe deliberadamente a quien quiera.
  if (pending.next_send_at && isRunStale(pending.next_send_at, new Date())) {
    if (!dryRun) {
      await db.from('lead_sequence_runs').update({ status: 'completed' }).eq('id', runId)
    }
    return { action: 'completed', reason: 'stale_run', details: 'Envío vencido hace más de 30 días', ...diag }
  }
```

Si `PendingRun` no expone `next_send_at`, añadirlo al `select` y a la interfaz.

- [ ] **Step 4c: Test de la guardia de frescura**

Añadir a `tests/billing/quota.test.ts`:

```ts
import { isRunStale } from '@/lib/subscriptions/access'

describe('isRunStale', () => {
  const now = new Date('2026-12-01T00:00:00.000Z')

  it('un envio vencido hace poco si se dispara', () => {
    expect(isRunStale('2026-11-20T00:00:00.000Z', now)).toBe(false)
  })

  it('un envio vencido hace mas de 30 dias no se dispara', () => {
    expect(isRunStale('2026-09-01T00:00:00.000Z', now)).toBe(true)
  })

  it('el limite exacto de 30 dias todavia se dispara', () => {
    expect(isRunStale('2026-11-01T00:00:00.000Z', now)).toBe(false)
  })
})
```

- [ ] **Step 5: Bloquear la creación de secuencias**

En la server action que crea secuencias (bajo `src/app/(dashboard)/emails/`), tras el guard de escritura:

```ts
  const access = await getTenantAccessFor(tenantId)
  if (!access.canCreateSequences) {
    return { ok: false, error: 'Crear secuencias requiere una suscripción activa. Tus secuencias existentes se conservan intactas.' }
  }
```

- [ ] **Step 6: Limitar las propiedades publicadas**

En `properties/actions.ts`, en la acción que guarda una propiedad, cuando `published_to_web` pase a `true`:

```ts
  const access = await getTenantAccessFor(tenantId)
  if (access.publishedPropertiesCap !== null) {
    const { count } = await supabase
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('published_to_web', true)
    if ((count ?? 0) >= access.publishedPropertiesCap) {
      return { ok: false, error: `Tu suscripción inactiva permite ${access.publishedPropertiesCap} propiedades publicadas. Despublica una o reactiva tu suscripción.` }
    }
  }
```

- [ ] **Step 7: Verificar y commitear**

Run: `npm run test:billing && npx tsc --noEmit && npm run lint`

```bash
git add src/lib/subscriptions/quota.ts src/lib/services "src/app/(dashboard)" tests/billing/quota.test.ts
git commit -m "feat(billing): cuota de envio, pausa de secuencias y cap de propiedades"
```

---

### Task 13: Banner de estado

**Files:**
- Create: `src/components/dashboard/subscription-banner.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Crear el banner**

Crear `src/components/dashboard/subscription-banner.tsx` como Server Component que recibe el `banner` de `getTenantAccess` por props y no renderiza nada si es `null`. Tono `amber` → `var(--accent-gold)`; tono `red` → `var(--accent-coral)`. El CTA enlaza a `/settings`.

- [ ] **Step 2: Montarlo en el layout**

En `src/app/(dashboard)/layout.tsx`, tras resolver el contexto de tenant, llamar `getTenantAccessFor(ctx.tenant_id)` y renderizar `<SubscriptionBanner banner={access.banner} />` encima del área principal.

- [ ] **Step 3: Verificar en el navegador**

Cambiar temporalmente el `status` del tenant de prueba a `past_due` con `mcp__supabase__execute_sql`, recargar, confirmar el banner ámbar. Repetir con `cancelled` para el rojo. **Devolver el estado a `active` al terminar.**

- [ ] **Step 4: Verificar y commitear**

Run: `npm run build && npm run lint`

```bash
git add src/components/dashboard/subscription-banner.tsx "src/app/(dashboard)/layout.tsx"
git commit -m "feat(billing): banner de estado de suscripcion en el dashboard"
```

---

### Task 14: Cron de ciclo de vida

**Files:**
- Create: `src/app/api/cron/billing-lifecycle/route.ts`

**Interfaces:**
- Consumes: `GRACE_DAYS` (Task 10).
- Produces: endpoint `GET /api/cron/billing-lifecycle` protegido por `CRON_SECRET`.

- [ ] **Step 1: Leer el patrón del cron existente**

Leer `src/app/api/cron/sequence-orchestrator/route.ts` para copiar la comprobación de `CRON_SECRET` y la forma del reporte de salida.

- [ ] **Step 2: Escribir el endpoint**

Crear `src/app/api/cron/billing-lifecycle/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { GRACE_DAYS, DEGRADED_LIMITS } from '@/lib/subscriptions/access'

// Los plazos de 14 y 60 días no los dispara ningún webhook: hacen falta pasadas
// programadas. Diario, vía cron-job.org (misma infraestructura que el
// orquestador de secuencias).
//
// Idempotente por construcción: cada paso filtra por una condición que deja de
// cumplirse una vez aplicado.

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const report = { propertiesUnpublished: 0, domainsReleased: 0, retentionWarnings: 0 }

  // ── 1. Propiedades: gracia de 14 días agotada ───────────────────────────────
  const { data: overdueProps } = await supabase
    .from('subscriptions')
    .select('tenant_id')
    .in('status', ['paused', 'cancelled'])
    .eq('billing_exempt', false)
    .lte('degraded_at', daysAgoIso(GRACE_DAYS.properties))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (overdueProps ?? []) as any[]) {
    const { data: published } = await supabase
      .from('properties')
      .select('id')
      .eq('tenant_id', row.tenant_id)
      .eq('published_to_web', true)
      .order('updated_at', { ascending: false })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all = (published ?? []) as any[]
    if (all.length <= DEGRADED_LIMITS.publishedPropertiesCap) continue

    // Regla determinista: se conservan las más recientemente actualizadas.
    // NO destructivo — la fila, las fotos y el slug quedan intactos.
    const toUnpublish = all.slice(DEGRADED_LIMITS.publishedPropertiesCap).map(p => p.id)
    const { error } = await supabase
      .from('properties')
      .update({ published_to_web: false, unpublished_by_billing: true })
      .in('id', toUnpublish)
    if (!error) report.propertiesUnpublished += toUnpublish.length
  }

  // ── 2. Dominio: gracia de 60 días agotada ───────────────────────────────────
  // Hasta aquí el dominio siguió registrado en Resend para que la reactivación
  // fuera instantánea y los replies en vuelo siguieran llegando.
  const { data: overdueDomains } = await supabase
    .from('subscriptions')
    .select('tenant_id')
    .in('status', ['paused', 'cancelled'])
    .eq('billing_exempt', false)
    .lte('degraded_at', daysAgoIso(GRACE_DAYS.sendingDomain))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (overdueDomains ?? []) as any[]) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, domain_status')
      .eq('id', row.tenant_id)
      .maybeSingle()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((tenant as any)?.domain_status !== 'verified') continue

    // 'released' es el estado terminal: reactivar exigirá re-verificar el DNS.
    const { error } = await supabase
      .from('tenants')
      .update({ domain_status: 'released' })
      .eq('id', row.tenant_id)
    if (!error) report.domainsReleased += 1
  }

  // ── 3. Retención: aviso a los 11 meses ──────────────────────────────────────
  const { data: oldCancelled } = await supabase
    .from('subscriptions')
    .select('tenant_id')
    .eq('status', 'cancelled')
    .eq('billing_exempt', false)
    .lte('degraded_at', daysAgoIso(330))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (oldCancelled ?? []) as any[]) {
    const { error } = await supabase.from('notifications').insert({
      tenant_id: row.tenant_id,
      type:      'subscription_request',
      message:   'Este equipo lleva 11 meses cancelado. La política de retención elimina sus datos al cumplirse 12.',
      read:      false,
      agent_id:  null,
    })
    if (!error) report.retentionWarnings += 1
  }

  return NextResponse.json({ ok: true, ...report })
}
```

> **Nota sobre la eliminación real en Resend:** el paso 2 marca
> `domain_status = 'released'`, que es lo que corta el uso del dominio en el CRM.
> Borrar el dominio de la cuenta de Resend (para liberar el slot de verdad) exige
> la API de Resend Domains y las credenciales de la cuenta correspondiente.
> Añadirlo aquí cuando `resolveResendAccount` exponga el cliente adecuado; hasta
> entonces, el `released` deja el slot identificable para liberarlo a mano desde
> el panel de Resend.

> **Nota sobre el paso 3:** reutiliza el tipo de notificación
> `subscription_request` porque ya está en el CHECK de `notifications.type`
> (migración 054). Si se quisiera un tipo propio (`retention_warning`), habría que
> ampliar ese CHECK en la migración 070 — no se hace por YAGNI.

- [ ] **Step 3: Probar en local**

Run: `npm run dev` y en otra terminal:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/billing-lifecycle
```

Expected: JSON con los contadores de cada paso en 0 (no hay tenants degradados).

- [ ] **Step 4: Verificar y commitear**

Run: `npx tsc --noEmit && npm run lint`

```bash
git add "src/app/api/cron/billing-lifecycle/route.ts"
git commit -m "feat(billing): cron de ciclo de vida para los plazos de 14 y 60 dias"
```

---

### Task 15: Reactivación

**Files:**
- Create: `src/lib/subscriptions/reactivate.ts`
- Modify: `src/lib/paddle/persist.ts`
- Create: `tests/billing/reactivate.test.ts`

**Interfaces:**
- Consumes: nada de tareas previas más allá del esquema.
- Produces: `restoreAfterReactivation(tenantId): Promise<{ propertiesRepublished: number }>`

> **Las secuencias NO se tocan aquí.** Los runs nunca cambian de estado al
> degradar (Task 12 Step 4): se quedan en `active` y el gate los frena en cada
> tick. Al reactivar vuelven a pasar el gate y siguen solos, y la guardia de
> frescura de la Task 12 Step 4b impide que un envío vencido hace meses se
> dispare. Esta tarea solo restaura lo que sí se modificó: las propiedades.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/billing/reactivate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { restoreAfterReactivation } from '@/lib/subscriptions/reactivate'

describe('restoreAfterReactivation', () => {
  it('exporta una funcion que devuelve el conteo de republicadas', () => {
    // Contrato mínimo: el filtro por unpublished_by_billing es lo que impide
    // republicar una casa que el cliente quitó a propósito por estar vendida.
    // El comportamiento contra la base se verifica en la prueba manual (paso 8).
    expect(typeof restoreAfterReactivation).toBe('function')
  })
})
```

- [ ] **Step 2: Correr para verlo fallar**

Run: `npm run test:billing`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

Crear `src/lib/subscriptions/reactivate.ts`:

```ts
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export interface ReactivationReport {
  propertiesRepublished: number
}

/**
 * Restaura lo que la degradación modificó. Hoy son solo las propiedades: los
 * runs de secuencia nunca cambiaron de estado, así que se reanudan solos.
 */
export async function restoreAfterReactivation(tenantId: string): Promise<ReactivationReport> {
  const supabase = createAdminClient()

  // Republicar SOLO lo que despublicó el sistema. Sin este filtro se
  // republicaría una casa que el cliente quitó a propósito por estar vendida.
  const { data: restored } = await supabase
    .from('properties')
    .update({ published_to_web: true, unpublished_by_billing: false })
    .eq('tenant_id', tenantId)
    .eq('unpublished_by_billing', true)
    .select('id')

  return { propertiesRepublished: (restored ?? []).length }
}
```

- [ ] **Step 4: Llamarla desde el persistidor**

En `src/lib/paddle/persist.ts`, dentro de `applySubscriptionEvent`, tras aplicar el patch:

```ts
  // Reactivación: el tenant estaba degradado y el evento lo devuelve a activo.
  if (snapshot.degradedAt && patch.degraded_at === null) {
    await restoreAfterReactivation(tenantId)
  }
```

- [ ] **Step 5: Correr toda la suite**

Run: `npm run test:billing`
Expected: PASS, todos.

- [ ] **Step 6: Verificar y commitear**

Run: `npm run build && npm run lint`

```bash
git add src/lib/subscriptions/reactivate.ts src/lib/paddle/persist.ts tests/billing/reactivate.test.ts
git commit -m "feat(billing): restauracion al reactivar la suscripcion"
```

---

### Task 16: Comunicación al degradar

Cubre el §10.3 del spec. Sin esto la degradación es silenciosa: el cliente
descubre que su IA no funciona sin saber por qué, y ITMANO se entera tarde.

**Files:**
- Create: `src/lib/subscriptions/notify-degradation.ts`
- Modify: `src/lib/paddle/persist.ts`

**Interfaces:**
- Consumes: `isDegraded` (Task 5); `resolveSenderIdentity` (Task 11).
- Produces: `notifyDegradation(tenantId, status): Promise<void>`

- [ ] **Step 1: Escribir el módulo de notificación**

Crear `src/lib/subscriptions/notify-degradation.ts`:

```ts
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SubscriptionStatus } from '@/lib/subscriptions'

// Dos destinatarios en una sola transición:
//   · ITMANO — bell + Telegram vía notifications. Modelo sales-led: alguien
//     debería llamar antes de que la cuenta se pudra.
//   · El cliente — un email que explica qué cambió y, sobre todo, QUÉ SE
//     CONSERVA. Baja soporte y baja el arrepentimiento.
// Best-effort: si la notificación falla, el cambio de estado ya quedó aplicado.

const CLIENT_SUBJECT = 'Tu suscripción de ITMANO CRM está inactiva'

const CLIENT_BODY = `Tu suscripción quedó inactiva, así que pusimos en pausa la generación con IA y las secuencias automáticas.

Lo que conservas íntegro:
· Todos tus leads, su historial y su puntuación.
· La exportación completa de tus datos, sin límite.
· Tus secuencias escritas — no borramos ninguna.
· El contacto uno a uno con tus leads desde tu propio correo.

Puedes reactivar tu suscripción desde Configuración cuando quieras, y todo vuelve a su sitio.`

export async function notifyDegradation(
  tenantId: string,
  status: SubscriptionStatus,
): Promise<void> {
  const supabase = createAdminClient()

  const { data: tenant } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', tenantId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const name = ((tenant as any)?.name as string | undefined) ?? tenantId

  const label = status === 'paused' ? 'pausó' : 'canceló'
  const { error } = await supabase.from('notifications').insert({
    tenant_id: tenantId,
    type:      'subscription_request',
    message:   `${name} ${label} su suscripción. La cuenta pasó a modo degradado.`,
    read:      false,
    agent_id:  null,
  })
  if (error) {
    console.error(JSON.stringify({ service: 'degradation-notify', tenant_id: tenantId, error: error.message }))
  }

  // El email al cliente reutiliza el servicio de envío existente. Se envía por
  // el dominio compartido de ITMANO: el propio ya está revocado en este punto.
  // Implementar con el helper de one-off del repo, con CLIENT_SUBJECT y
  // CLIENT_BODY, dirigido al email del owner del tenant.
}
```

- [ ] **Step 2: Llamarla desde el persistidor**

En `src/lib/paddle/persist.ts`, junto a la llamada de reactivación de la Task 15:

```ts
  // Entrada al modo degradado: notificar una sola vez, en la transición.
  if (!snapshot.degradedAt && patch.degraded_at !== null) {
    await notifyDegradation(tenantId, patch.status)
  }
```

La condición garantiza que se dispara **solo en la transición**: un segundo
evento con el tenant ya degradado no vuelve a notificar.

- [ ] **Step 3: Resolver el destinatario del email**

Leer `src/lib/services/send-one-off-email.ts` para ver cómo obtiene el
destinatario y la identidad de envío, y completar el bloque comentado del Step 1
siguiendo ese patrón exacto. El destinatario es el email del login `agent_owner`
del tenant.

- [ ] **Step 4: Verificar y commitear**

Run: `npx tsc --noEmit && npm run lint`

```bash
git add src/lib/subscriptions/notify-degradation.ts src/lib/paddle/persist.ts
git commit -m "feat(billing): avisar al cliente y a itmano al degradar la cuenta"
```

---

## Verificación final antes del PR

- [ ] `npm run test:billing` — toda la suite en verde
- [ ] `npm run test:auth` — el matcher del proxy sigue coherente
- [ ] `npm run build` — limpio
- [ ] `npm run lint` — limpio
- [ ] `npx tsc --noEmit` — sin errores

**Prueba manual end-to-end en sandbox** (requiere las credenciales de Dylan):

1. Ejecutar `npx tsx scripts/paddle-catalog.ts --env=sandbox` y pegar los 4 price IDs en `.env.local`.
2. Crear la notification destination en sandbox apuntando a la URL de preview de Vercel de la rama. Copiar el Secret Key.
3. Abrir `/settings`, pulsar "Activar plan Growth · anual", pagar con `4242 4242 4242 4242`.
4. Confirmar que la fila `subscriptions` del tenant recibe `paddle_subscription_id`, `billing_cycle = 'year'` y `status = 'active'`.
5. Reenviar el mismo evento desde el simulador de webhooks: debe responder `{ ok: true, duplicate: true }` y **no** duplicar efectos.
6. Cancelar desde el portal de cliente: confirmar que `status` sigue `active` con `cancel_at` a futuro y que **el acceso NO se degrada**.
7. Simular `subscription.updated` con `status: canceled`: confirmar la degradación completa (IA apagada, dominio compartido, banner rojo).
8. Simular la vuelta a `active`: confirmar que las propiedades con `unpublished_by_billing` se republican.

---

## Notas para quien ejecute

- **Sandbox no tiene Paddle Retain.** El dunning por tarjeta fallida no se puede probar ahí; se valida en Live con un cobro pequeño.
- **Los reintentos de webhook en sandbox son 3 en 15 minutos** (en Live, 60 durante 3 días). Si el endpoint está caído durante una prueba, usar el simulador en vez de esperar.
- **Las API keys de Paddle caducan a los 90 días por defecto.** Si a mitad de implementación las llamadas empiezan a dar 403, es eso.
- **Nunca commitear un price ID de Live** en el código. Van en variables de entorno.
