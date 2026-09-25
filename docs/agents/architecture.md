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
- El layout de `(dashboard)` dispara `getShellData(ctx)` sin esperarlo y sólo
  espera al contexto. Sin ese disparo React no llega a los slots hasta después
  del árbol de la página y el shell sale una ola por detrás.
- El layout de `(dashboard)` sólo espera al contexto. Todo lo que lee de la base
  (logo, plan, no leídas, límite de IA, switcher, banner) llega por streaming
  desde `src/components/layout/shell-slots.tsx` dentro de `<Suspense>`, con
  fallbacks del mismo tamaño. No añadas lecturas al layout fuera de ese patrón.
- Mide con `SUPABASE_TRACE=1` antes y después de tocar una página: compara
  consultas y olas, no milisegundos.

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

## Diseño

- Tokens en `src/app/globals.css`, expuestos a Tailwind con `@theme inline`.
- No hardcodees hex si existe o debe existir un token reutilizable.
- Lee `src/components/motion/README.md` antes de animar: LazyMotion strict,
  reduced motion y entradas sobrias en el CRM.
- No uses AOS, jQuery ni librerías que muten el DOM fuera de React.
- Reutiliza `STATUS_CONFIG`, `LANGUAGE_CONFIG`, tipos y componentes existentes.
