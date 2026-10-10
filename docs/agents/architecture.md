# Arquitectura y convenciones

## Stack

Next.js 16.3, React 19.2, TypeScript strict, Tailwind v4, shadcn/ui,
Supabase/Postgres, Resend, Anthropic SDK y Motion. El alias `@/*` apunta a
`./src/*`. Vercel aloja la aplicación y servicios externos disparan los crons.

No asumas convenciones de versiones anteriores de Next.js. Antes de cambiar
routing, layouts, Server Actions, caching o `src/proxy.ts`, lee la guía exacta en
`node_modules/next/dist/docs/` y atiende deprecaciones.

## Multi-tenancy

- Toda tabla de aplicación lleva `tenant_id`; una tabla global o nullable exige
  justificación explícita.
- Toda lectura y escritura se acota por tenant en código y mediante RLS. Son dos
  capas complementarias.
- Identidad, slugs, logos, colores, remitentes y agentes de clientes viven en la
  base. Los valores específicos de A&J sólo aparecen en seeds o datos.
- `service_role` se limita a servidor y trabajos internos. Nunca llega al bundle
  cliente ni a variables `NEXT_PUBLIC_*`.

## Auth y personas

El acceso usa Magic Link (`signInWithOtp`) y los registros están cerrados. Los
roles autoritativos se resuelven en `src/lib/auth/tenant-context.ts`:
`super_admin`, `agent_owner` y `agent`.

`agents` representa miembros del equipo inmobiliario, no usuarios de login.
`agents.user_id` puede ser `null`; asignaciones, secuencias, autoría y métricas
usan `agents.id`, nunca `auth.users.id` como sustituto.

Los guards de rol y tenant viven en `src/lib/auth/guards.ts` y
`src/lib/auth/visibility.ts`. No dupliques permisos en UI como única protección.

## Flujo de datos

- Server Components hacen fetch y pasan props tipadas.
- Acceso a datos en `src/lib/data/*.ts`; páginas no consultan Supabase directo.
- Mutaciones mediante Server Actions; route handlers sólo para sistemas externos,
  webhooks, intake y crons.
- Client Components sólo para hooks, estado, router o APIs de navegador.
- No hay queries de datos de aplicación desde el cliente. Un proceso largo se
  sigue mediante una Server Action de lectura o el mecanismo servidor aprobado.
- No importes `recharts` desde un Server Component; usa wrappers cliente en
  `analytics/charts/`.

## Rendimiento de lecturas

Cada round-trip a Supabase cuesta decenas de milisegundos en producción y el
usuario paga entero cada eslabón en serie. Reglas fijadas por la auditoría de
rendimiento (`docs/performance/`):

- Una página lee en UNA ola: todo lo que sólo depende del contexto (tenant, rol,
  id de la URL) va en el mismo `Promise.all`. Una segunda ola sólo se acepta
  cuando depende de verdad del resultado de la primera. La visibilidad de una
  fila se comprueba sobre la fila, después de leer; lo leído para un request
  que termina en 404 se descarta sin salir del servidor.
- Lo que varias superficies leen por request va a un getter con `cache()` en
  `src/lib/data/*` (`getTenantRow`, `getSubscription`, `getTenantNames`,
  `getShellData`, `getActiveStepsFor`, `getSequenceRunsFor`); nadie repite la
  consulta. La fila del tenant se lee UNA vez con `getTenantRow`: el branding
  del shell, el perfil de negocio y el slug de la página salen todos de ella.
- Una imagen se pinta con `next/image` y su `sizes` real. Un `<img>` con una
  URL de Storage descarga el original: 440 kB de media para pintar 240 px.
- Los nombres de agente o tenant se piden embebidos por FK en la misma consulta
  (`agents(name)`, `tenants(name)`), no con una lectura posterior por ids.
- Una agregación que encadenaba varias lecturas va a una RPC por tenant
  (`sequence_email_metrics`, `tenant_channel_metrics`), `stable`, con
  `search_path` vacío y ejecutable sólo por `service_role`.
- El layout de `(dashboard)` no espera a nada (ver "Cache Components"). Todo lo
  que depende de la sesión o de la base (ítems del nav según el rol, usuario,
  drawer móvil, logo, plan, no leídas, límite de IA, switcher, banner) llega
  por streaming desde `src/components/layout/shell-slots.tsx`, cada slot en su
  `<Suspense>` con un fallback del mismo tamaño. Cada slot lee el contexto y
  `getShellData(ctx)` por su cuenta; los dos están en `cache()`, así que siguen
  siendo una lectura de contexto y una ola para el shell. No añadas lecturas
  al layout fuera de ese patrón.
- La base (compute Nano de Supabase) se enfría: una consulta que con la base
  activa tarda 32 ms tarda 67 ms tras 20-45 s sin tráfico y ~450 ms tras más
  de 2,5 minutos (logs de la API de producción). `DbWarmer`
  (`src/components/layout/db-warmer.tsx`, reglas en `src/lib/warm.ts`) manda un
  GET a `/api/warm` cada ~10 s mientras alguien tiene el CRM a la vista y ha
  hecho algo hace menos de 5 minutos. No lo quites ni lo muevas fuera del
  layout de `(dashboard)`; y si mides una página de producción tras una pausa
  larga, di que la base estaba fría. `/api/warm` sólo responde a una sesión o
  a `CRON_SECRET` y cuenta filas sin leerlas.
- Mide con `SUPABASE_TRACE=1` antes y después de tocar una página: compara
  consultas y olas, no milisegundos.

## Cache Components

El proyecto usa `cacheComponents: true` (Partial Prerendering). Cada ruta tiene
un shell que se prerenderiza en el build y sale del CDN antes de que la función
lea la cookie; lo que depende del request llega por streaming detrás de
`<Suspense>`. Guía de Next: `node_modules/next/dist/docs/01-app/02-guides/`
(`migrating-to-cache-components.md`, `authentication-with-cache-components.md`,
`instant-navigation.md`). Historia y mediciones: fase 5 de
`docs/performance/2026-09-auditoria-rendimiento-opus.md`.

- **Dónde se lee la sesión.** Nunca en el cuerpo de un layout: un `await` ahí
  saca del shell todo lo que cuelga de él. La sesión
  (`getCurrentTenantContext`, cookies, headers) se lee dentro de un componente
  envuelto en `<Suspense>`: los slots del shell en el layout y la página dentro
  del `<Suspense>` que le pone su `loading.tsx`. Por eso toda página del
  dashboard necesita su `loading.tsx` (ya lo exigía "Estados de carga").
- **Hooks de ruta en Client Components** (`usePathname`, `useParams`,
  `useSelectedLayoutSegment(s)`, `useSearchParams`): en el prerender de una
  ruta con parámetros suspenden. Si el componente vive en el layout (nav,
  topbar, template), lleva la lectura a una hoja pequeña dentro de su propio
  `<Suspense>` (`NavActiveMarker` en `nav-item.tsx`, `TopbarTitle` en
  `topbar.tsx`). Nunca pases `{children}` en un fallback. Lo que sólo se monta
  en producción (`SpeedInsights`, con `VERCEL_ENV === 'production'`) no lo
  prerenderiza ni el build local ni el de los previews: si lo tocas, compruébalo
  con `VERCEL_ENV=production npm run build`. Así se rompió el primer deploy de
  producción de Cache Components.
- **IO síncrona en render** (`new Date()`, `Date.now()`, `Math.random()`,
  `crypto.randomUUID()`) rompe el prerender: va dentro de `use cache`, detrás
  de `connection()` o en un efecto de cliente. El fallo sale en `next build`.
- **`use cache` (caché compartida entre usuarios).** Sólo para datos públicos o
  globales, y con todo lo que distingue el resultado en los argumentos: los
  datos de un tenant llevan su `tenant_id` (o su slug público) como argumento,
  y nada derivado de la sesión entra nunca en un `use cache` plano. Hoy sólo
  lo usan las páginas alojadas (`/web`, `/nl`, `/hp`), el sitemap de `/nl` y
  el año del footer de marketing. Siempre con `cacheLife` explícito.
- **`use cache: private`** es la única forma de cachear algo que lee la
  sesión, y vive sólo en el navegador. Ojo con el super_admin, que actúa como
  otro tenant por cookie: el tenant efectivo sale del contexto, nunca de un
  valor cacheado. Ante la duda, no caches: el objetivo es el shell estático.
- **Páginas alojadas.** Una carga cacheada por página (`use cache` +
  `cacheLife('hosted')`, 5 minutos, perfil en `next.config.ts`) que comparten
  `generateMetadata` y la página, con un tag de `hostedTag`
  (`src/lib/hosted-cache.ts`): por tenant id en `/web` y `/nl`, por slug de
  tenant en `/hp`. Quien cambia lo que muestran lo expira con `updateTag` en
  server actions y con `revalidateTag(tag, { expire: 0 })` fuera de ellas
  (crons, webhooks). No uses `revalidatePath` para estas rutas.
  `generateStaticParams` nunca devuelve `[]`: usa `alMenosUnParametro`.
- **`instant = false`** sólo como bloqueo documentado, con el motivo escrito
  encima. Hoy lo llevan las páginas alojadas (esperan sus params para dar un
  404 real) y la vista previa de `/hp` y el RSVP (por visita). Ninguna ruta
  del dashboard lo necesita.
- **Route handlers `GET`** se prerenderizan si no leen nada del request. Los
  que deben ser por request llaman a `connection()` antes de cualquier
  `try/catch` (el aborto del prerender se lanza como excepción; ver
  `defineRoute` en `src/lib/agent-api/handler.ts` y `/api/version`).
- **Redirects con el shell ya enviado.** Un `redirect()` dentro de un
  `<Suspense>` (p. ej. `requireTenantContext` del super_admin en modo hub) se
  resuelve en el cliente y la respuesta es 200, no 307. El guard sin sesión
  sigue en `src/proxy.ts`, que responde 307 antes de servir nada.
- **Estado al volver a una página.** Con Cache Components Next conserva las
  rutas visitadas ocultas con `<Activity>` en vez de desmontarlas. Toda página
  de `(dashboard)` exporta `freshOnNavigation(SuPágina)`
  (`src/components/layout/fresh-page.tsx`), que la remonta al ocultarse: cada
  visita empieza limpia, como antes (sin confirmaciones viejas, modales
  abiertos ni formularios con el envío anterior). Una página nueva lo lleva
  también, salvo que quiera conservar su estado a propósito; en ese caso
  resetea a mano lo transitorio según `preserving-ui-state.md` de la guía.
- **Prefetch.** El prefetch de una ruta trae sólo su shell estático, sin tocar
  la base, así que el nav lo usa por defecto y los botones que navegan con
  `router.push` (Registrar Lead, la campana) precargan su destino con
  `router.prefetch`. `partialPrefetching` está evaluado y apagado (fase 5).
- **Tipos.** Los perfiles de `cacheLife` se tipan con `next typegen`; CI lo
  corre antes de `tsc`.

## Versiones nuevas en pestañas abiertas

Con Skew Protection, una pestaña abierta sigue hablando con su deploy hasta una
carga completa. `NewVersionNotice` (montado en el layout de `(dashboard)` sólo
en Vercel, mediante `NewVersionNoticeSlot`, que lee el deploy en el request y
no en el shell prerenderizado) compara el deploy de la pestaña con
`GET /api/version`, avisa y, a
partir de ahí, convierte la siguiente navegación interna en carga completa. Una
navegación que no pase por `<a>` (como `useCardNavigation`) debe consultar
`hayVersionNueva()` de `src/lib/app-version.ts` y hacer lo mismo.

## Perfil de negocio

El perfil del mercado vive en columnas nullable de `tenants` y se administra en
Ajustes → Tu negocio. La ausencia de un valor significa “no sabemos”, no un
bucket negativo.

- `budgetTierFor()` devuelve `null` sin cortes de presupuesto.
- `geoFitFor()` devuelve `null` sin zonas declaradas.
- El intake acepta monto y zona en bruto; el CRM interpreta esos hechos con la
  configuración del tenant. Si llegan valor bruto y bucket, gana el dato bruto.
- La comisión representa lo que factura la agencia si cierra. No es probabilidad,
  no entra al score y no representa el neto del agente.

Consulta `src/lib/business/profile.ts`, `src/lib/data/business-profile.ts` y
`src/lib/services/intake-fit.ts` antes de cambiar este modelo.

## TypeScript y consultas

TypeScript es strict. Evita `any`; cuando sea inevitable, documenta la razón.
Valida inputs con Zod antes de tocar datos y devuelve resultados discriminados
como `{ ok: true, data }` o `{ ok: false, error }` en lugar de lanzar errores al
cliente.

Toda lista de columnas de un `.select()` se crea con `columns()` de
`src/lib/supabase/columns.ts`. Los casts posteriores pueden ocultar errores del
cliente tipado; validar el literal antes del query evita que una vista cambie y
la UI falle sólo en producción.

Después de una migración que cambie columnas, regenera tipos desde el entorno
que ya la recibió con `npm run types:db:sandbox` o `npm run types:db`.

## Fechas y números en Client Components

Un Client Component se renderiza en el servidor (Vercel, en UTC) y otra vez al
hidratar en el navegador de cada usuario. Un `toLocaleString('es-ES', …)` sin
`timeZone`, una hora relativa calculada con la hora actual o un número con
`toLocaleString()` sin idioma dan un texto distinto en cada lado: React lanza
el error #418, tira el HTML del servidor y vuelve a renderizar ese tramo en el
cliente. Pasaba en producción en la ficha del lead.

- Fecha u hora en la zona de quien mira: `<FechaLocal>` de
  `src/components/ui/local-date.tsx`. "Hace X": `<TiempoRelativo>`.
- Un número formateado lleva siempre su idioma (`toLocaleString('en-US')`).
- En Server Components no hay hidratación, pero formatean en UTC: si importa
  el día exacto, pasa el `timeZone` del tenant (`tenants.timezone`).
- Para reproducirlo en local: `next start` con `TZ=UTC` y un navegador en
  otra zona; el error sólo sale en el build de producción.

## Diseño

- Tokens en `src/app/globals.css`, expuestos a Tailwind con `@theme inline`.
- No hardcodees hex si existe o debe existir un token reutilizable.
- Lee `src/components/motion/README.md` antes de animar: LazyMotion strict,
  reduced motion y entradas sobrias en el CRM.
- No uses AOS, jQuery ni librerías que muten el DOM fuera de React.
- Reutiliza `STATUS_CONFIG`, `LANGUAGE_CONFIG`, tipos y componentes existentes.
