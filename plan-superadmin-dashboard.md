# Dashboard de Super Admin + Selección de Tenant — ITMANO CRM

> **Commit 0 de la implementación:** guardar este plan como `plan-superadmin-dashboard.md` en la raíz del repo (pedido explícito del usuario).
> Rama `feat/super-admin-hub` desde `main` (PR #88 ya mergeado — verificado). Sin dependencias nuevas. **Sin migraciones SQL ni cambios de RLS** (validado: `is_super_admin()` bypass ya cubre el acceso cross-tenant).

## Contexto

El super_admin (Dylan, `user_profiles.tenant_id = NULL`) cae hoy a `/dashboard` con una "mega-vista" sin filtro de tenant (datos de todos los tenants mezclados). No existe mecanismo para elegir a qué CRM entrar. Se construye: **hub de super admin** (aterrizaje post-login con métricas por tenant, gestión y visión global, absorbiendo `/admin`), **selección de tenant por cookie** (todas las páginas existentes funcionan scoped sin tocarlas), y **switcher en topbar**.

**Hechos verificados:** `getCurrentTenantContext()` ([tenant-context.ts](src/lib/auth/tenant-context.ts)) NO está envuelto en `cache()` (se ejecuta 2+ veces por request — envolverlo es parte del trabajo); `settings/page.tsx:16` y `settings/actions.ts:24,58` tienen fallback `'tenant-aj'` con `TODO(admin-onboarding)` — este feature ES ese TODO; `getNotifications()` no soporta `limit`; `tenants.primary_color`/`logo_url` existen en BD y nunca se leen en UI; `scopeFor`/`applyVisibilityScope` ya filtran por `ctx.tenant_id`; `/admin` ya tiene guard + `createTenant`/`provisionOwner`; el callback no bifurca por rol.

**Decisiones del usuario:** post-login → hub; hub con métricas por tenant + gestión + lo necesario; switcher en topbar.

## Decisiones de diseño (opinadas, una por punto)

| Decisión | Elección |
|---|---|
| Cookie | `itmano-admin-tenant`, httpOnly, sameSite lax, path `/`, maxAge 7 días, secure en prod. Solo se honra si `user_profiles.role === 'super_admin'` (revalidado por request; jamás para otros roles). |
| Actions | `enterTenant`/`exitToHub` en `admin/actions.ts` (junto a createTenant); helper de lectura `getSelectedTenant()` en `src/lib/auth/admin-tenant.ts` (server-only, sin `'use server'`). |
| Contexto | `getCurrentTenantContext` envuelto en `cache()` de React (dedup por request, hace gratis la validación de cookie). Nuevo campo `acting_as_tenant: boolean`. |
| Guarda de páginas | Helper `requireTenantContext()` (redirect a `/admin` si super sin selección) reemplaza a `getCurrentTenantContext()` en las 14 páginas tenant-scoped. El layout NO sirve de guarda (no se re-ejecuta en navegaciones soft). |
| Post-login | En `auth/callback/route.ts`: si NO vino `next` explícito y el rol es super_admin → `/admin`. Adriana/agents: sin cambios. |
| Ruta del hub | Reutilizar `/admin` (guard/nav/actions existentes). Nav item renombrado a "Centro de control". |
| Layout del hub | Dentro del grupo `(dashboard)` con el layout normal; sidebar en **modo hub** (solo "Centro de control" + "Notificaciones") cuando super sin selección. |
| Hub | KPIs globales siempre visibles + `Tabs` "Tenants" \| "Gestión"; feed de notificaciones cross-tenant bajo el grid de tenants. |
| Switcher | Dropdown custom (useState + outside-click, ~80 líneas, tokens del sistema); cambiar tenant → siempre `/dashboard` (la entidad abierta no existe en el otro tenant). El switcher mismo es el indicador de "actuando como" (dot del color del tenant + nombre). |
| Pickers redundantes | Los selectores "Tenant" de leads/new, sources, emails, properties se gatean con `super_admin && !ctx.tenant_id` (tras la guarda: siempre ocultos ahí) + fallback en `resolveTargetTenant` a la selección. |

## Commits

### 0 — `docs: plan de implementación del hub de super admin`
Escribir `plan-superadmin-dashboard.md` en la raíz (este plan completo).

### 1 — `feat(auth): selección de tenant por cookie para super_admin`
- **Nuevo `src/lib/auth/admin-tenant.ts`** (`import 'server-only'`): `ADMIN_TENANT_COOKIE`, `getSelectedTenant(): Promise<{id,name,primaryColor} | null>` — lee cookie con `cookies()`, valida contra `tenants` (admin client); null si no existe (cookie huérfana se ignora; no se puede borrar en render RSC, se limpia en la próxima action).
- **[tenant-context.ts](src/lib/auth/tenant-context.ts)**: envolver en `cache()`; añadir `acting_as_tenant: boolean`; si `role === 'super_admin'` → `getSelectedTenant()` y si hay tenant válido, `tenant_id = seleccionado`, `acting_as_tenant = true`.
- **`admin/actions.ts`**: `enterTenant(tenantId)` (guard super_admin → validar tenant existe → set cookie → `redirect('/dashboard')`) y `exitToHub()` (guard → delete cookie → `redirect('/admin')`).

### 2 — `feat(auth): guarda de rutas tenant-scoped y aterrizaje post-login`
- **`requireTenantContext()`** en tenant-context.ts: `if (role==='super_admin' && !tenant_id) redirect('/admin')`.
- Reemplazo mecánico en 14 `page.tsx`: dashboard, leads, leads/new, leads/[id], properties, sources, sources/[slug], emails, emails/new, emails/[id], analytics, analytics/emails, activity, settings. **Sin guarda:** `/notifications` (vista cross-tenant ya soportada) y `/admin`.
- **`auth/callback/route.ts`**: `rawNext = searchParams.get('next')`; tras verifyOtp, si `!rawNext` → query rol → super_admin a `/admin`. Deep-links con `next` se honran (requireTenantContext redirige si hace falta — un solo redirect, sin bucle).
- **`nav-items.ts`**: `navItemsForRole(role, { hubMode? })` — modo hub: solo Centro de control + Notificaciones; super con selección: items normales + "Centro de control" al final. `layout.tsx`/`sidebar.tsx`/`mobile-nav.tsx` pasan `hubMode = super && !tenant_id`.

### 3 — `feat(data): agregados por tenant para el hub`
- **Nuevo `src/lib/data/super-admin.ts`**: `getHubData(): { kpis: PlatformKpis; tenants: TenantOverview[] }`.
  - `getTenantsWithOwners()` existente + **un** fetch `leads.select('tenant_id,status,temperature_score,created_at')` agregado en memoria (caliente = `status==='hot' || temperature_score>=70`, mismo criterio que dashboard; volumen ~200 filas — comentario `TODO: RPC agregada cuando leads > ~5k`) + última actividad por tenant vía `lead_events … order desc limit 1` en `Promise.all` (acotado por nº de tenants).
- **`notifications.ts`**: opción `limit` en `getNotifications` (sin cambio para llamadores actuales).

### 4 — `feat(admin): centro de control con KPIs, cards de tenant y gestión`
Reescribir `admin/page.tsx` (server; guard actual intacto; usa `getCurrentTenantContext`, NO require):

```
KPIs (StaggerGroup + AnimatedNumber): Tenants · Leads totales · Calientes · Nuevos 30d
Tabs "Tenants (n)" | "Gestión"
  Tenants: grid de cards (nuevo admin/tenant-card.tsx, server):
    borde izq 3px en primary_color del tenant (primera lectura de branding en UI),
    nombre/slug/owner (o "⚠ Sin owner"), leads·calientes, últ. actividad relativa,
    botón "Entrar al CRM" (.btn-cta) vía <form action={enterTenant.bind(null, id)}>;
    si es el seleccionado → "Continuar en el CRM"
    + debajo: feed cross-tenant (nuevo admin/hub-feed.tsx, server, getNotifications(null,{limit:10})
      con badge de tenantName y hora relativa; link "Ver todas" → /notifications)
  Gestión: AdminClient existente reutilizado (crear tenant + provisionar owner)
```
`PAGE_TITLES['/admin'] = 'Centro de control'`.

### 5 — `feat(layout): switcher de tenant en topbar`
- `layout.tsx`: si super_admin, `getTenantsForSwitcher()` (nuevo en `data/tenants.ts`: `select('id,name,primary_color').order('name')`) → props `tenants` + `activeTenantId` al Topbar.
- **Nuevo `src/components/layout/tenant-switcher.tsx`** (client): pill con dot del color + nombre del tenant activo (o "Elegir tenant") + chevron; menú absoluto (bg-surface, shadow, `m.div` corto, outside-click con `pointerdown` + ref, Escape cierra); opciones = tenants (check dorado en activo) → `startTransition(() => enterTenant(id))`; separador; "Centro de control" → `exitToHub()`. Se renderiza solo si `tenants` definido.

### 6 — `refactor(super-admin): actuar como tenant sin selectores redundantes`
- `guards.ts` → `resolveTargetTenant`: fallback `chosenTenantId ?? ctx.tenant_id` para super.
- Gatear pickers "Tenant" con `super && !ctx.tenant_id` en: leads/new (SECCIÓN 0), sources (modales), emails/new + emails, properties (modal).
- **Resolver TODO(admin-onboarding)**: `settings/page.tsx` usa `ctx.tenant_id` directo (requireTenantContext lo garantiza); `settings/actions.ts` quita el fallback `'tenant-aj'` → error claro si falta tenant.
- Documentar en PR (no bloquear): `assertCanWriteLead` deja pasar al super cross-tenant pero no es alcanzable vía UI (el fetch del detalle ya filtra por scope → not-found); panel purchase-templates sigue global; dos pestañas comparten cookie (UX estándar de impersonación).

### 7 — `test(auth): cobertura del flujo de selección`
En `tests/auth/` (vitest existente): `resolveTargetTenant` con fallback, `navItemsForRole` modo hub. Nada que requiera red.

## Casos borde

- **Cookie huérfana/manipulada** → validación server-side → se ignora → hub.
- **Perfil degradado** (ya no super) → cookie jamás leída para otros roles.
- **Deep-link a lead de otro tenant** estando en tenant A → not-found (scope filtra).
- **`/admin` con selección activa** → accesible; card activa dice "Continuar"; switcher marca el activo.
- **Campana**: modo hub = conteo global (`getUnreadCount(null)` ya soportado); con selección = solo el tenant.
- **Adriana/agents**: cero cambios de flujo.

## Verificación end-to-end

1. `npm run lint` + `npx tsc --noEmit` + `npm run build` por commit; `npx vitest run tests/auth`.
2. Login como Dylan sin cookie → hub `/admin` (KPIs, cards con color, feed con badges; sidebar solo Centro de control + Notificaciones). `/leads` manual → redirect al hub.
3. "Entrar al CRM" A&J → `/dashboard` solo con datos A&J; switcher muestra A&J; `/leads/new` sin picker de tenant; settings muestra A&J real (fallback muerto).
4. Switcher → otro tenant → `/dashboard` del otro; → "Centro de control" → hub y cookie borrada.
5. Cookie con id falso (devtools) → siguiente navegación cae al hub sin crash.
6. Login como Adriana → su dashboard, sin switcher ni Centro de control. Crear tenant + provisionar desde el tab Gestión.

## Fuera de alcance
`logo_url` en cards (iteración futura), RPC agregada de métricas, multi-cookie por pestaña, cambios de RLS/migraciones.
