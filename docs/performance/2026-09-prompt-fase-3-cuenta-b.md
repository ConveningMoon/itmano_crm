# Prompt de la FASE 3 — cuenta B, Fable 5 en High

Cómo usarlo: abre Claude Code con **Fable 5, esfuerzo High**, en
`C:\dev\itmano-crm` (o el clon de Mac), con la cuenta B. Copia todo lo que va
debajo de la línea como primer mensaje. Quien lo lea no tiene el contexto de
las fases 1 y 2: todo lo que necesita está aquí o en los documentos que se
citan.

---

Eres responsable de la **fase 3 de la auditoría de rendimiento** de ITMANO
CRM. Las fases 1 (Claude Opus 5) y 2 (Claude Fable 5.1) están documentadas
en `docs/performance/2026-09-auditoria-rendimiento-opus.md`; lee ese archivo
completo antes de tocar nada. La sección "Fase 2" al final tiene la tabla
antes/después por ruta, lo implementado, lo descartado, el diagnóstico de
plataforma, el plan de mudanza de región, el análisis del JWT hook y el
resultado del spike de Cache Components. Tu trabajo es **cerrar lo que quedó
abierto, medir el efecto en producción y ejecutar sólo lo que Dylan ya
aprobó**.

Dato de negocio que manda: los usuarios están en **EE. UU. y España**. El
cómputo tiene que vivir pegado a la base de datos; el punto medio elegido es
`iad1` + `us-east-1`, y mientras Postgres esté en `us-west-1` la función debe
estar en `sfo1`. No propongas funciones multi-región.

## Contexto obligatorio

1. Lee `AGENTS.md` completo (incluida "Estados de carga obligatorios") y
   `CLAUDE.md`. Reglas que no se negocian: español con Dylan; commits
   convencionales, breves, sin firmas ni menciones de autoría por IA; no
   abras PRs (los abre Dylan); sandbox antes que producción; `columns()` en
   todo `.select()`; filtro de `tenant_id` en código además de RLS; nunca
   secretos en logs, prompts ni documentos; no dispares flujos de IA pagada
   ni envíes correos reales para probar.
2. Lee `docs/agents/architecture.md` (tiene una sección nueva, "Rendimiento
   de lecturas", con las convenciones que la fase 2 dejó fijadas: una ola por
   página, getters con `cache()`, nombres embebidos por FK, RPC por tenant,
   shell con Suspense) y `docs/agents/environments.md`.
3. Antes de tocar Next.js, lee `node_modules/next/dist/docs/01-app/` (es Next
   16.3): `02-guides/migrating-to-cache-components.md`,
   `02-guides/instant-navigation.md`,
   `02-guides/authentication-with-cache-components.md`,
   `03-api-reference/03-file-conventions/loading.md`.
4. Para Supabase carga las skills `supabase` y
   `supabase-postgres-best-practices` antes de escribir SQL.
5. `git fetch --prune`, `git status`. Estado esperado al empezar:
   - Si Dylan ya mergeó `perf/auditoria-rendimiento` en `main`: crea
     `perf/rendimiento-fase-3` desde `origin/main`.
   - Si no la mergeó: trabaja sobre `perf/auditoria-rendimiento` (está pusheada
     y al día) y díselo a Dylan al terminar.
   - Último commit de la fase 2: `docs(perf): fase 2 y prompt de fase 3`.

## Estado al cerrar la fase 2 (hecho y verificado)

- Cascadas: todas las páginas del dashboard quedaron en 2 olas salvo
  `/newsletters` (3) y `/leads/[id]` (3). Tabla completa en el informe.
- Shell: el layout de `(dashboard)` sólo espera al contexto; logo, plan,
  no leídas, límite de IA, switcher y banner llegan por streaming desde
  `src/components/layout/shell-slots.tsx` con `getShellData` (cache()).
- Base: migraciones `20260918140000_perf_rpc_metrics_owner_emails.sql`
  (`sequence_email_metrics`, `tenant_channel_metrics`, `tenant_owner_emails`,
  `lead_response_time_stats` con `p_include_manual_rules`) y
  `20260918140100_perf_rls_single_policy_per_action.sql` aplicadas en
  **sandbox y producción**; `test:rls` 110/110; advisors de performance sin
  avisos de políticas en los dos proyectos. Tipos regenerados.
- Estados de carga: todas las acciones de UI tienen estado pendiente;
  `PendingSubmitButton` (`src/components/ui/pending-submit-button.tsx`) cubre
  los formularios de Server Components.
- Gates al cerrar: `npm run lint` (0 errores), `npx tsc --noEmit`,
  `npm run test:unit` (101 archivos), `npm run check:agents`, `npm run build`,
  todos ✓.
- **No verificado:** el drawer móvil con el shell nuevo (sólo escritorio en
  navegador); el TTFB de producción tras desplegar la fase 2 (no estaba
  desplegada al cerrar).

## Hallazgo que condiciona todo

El deployment de producción vigente al cerrar la fase 2 corría en **`iad1`**
con Supabase en **`us-west-1`** (60–70 ms por consulta, de costa a costa).
Dylan ya había marcado `sfo1` en el panel de Vercel, pendiente de redeploy.
El primer deploy a producción después de eso (el merge de la fase 2) deja la
función en `sfo1`. **Tu primera tarea es comprobar que ocurrió y medir.**

## Herramientas y método de medición

- MCP `supabase_sandbox` y `supabase_production` (producción sólo lectura,
  salvo migraciones que ya pasaron el gate de sandbox). MCP de Vercel: equipo
  `team_fVxY5nEtwnbmO3ICSHDHcYAC`, proyecto `prj_y4Q0HDQaMpbBtWIrUJeQ3ceoPHAA`
  (`itmano-crm`) y `prj_nBmDUi5x1DlS9BVgLU11ngnHGZIF` (`itmano-crm-sandbox`).
- **Región real de un deployment:** `get_deployment` → `regions`, o la
  cabecera `x-vercel-id` de cualquier respuesta (`<edge>::<región>::…`).
- **Traza de consultas en local:** `SUPABASE_TRACE=1 npx next dev --port 3100`
  escribe una línea JSON por round-trip (`trace: "supabase"`, `start`, `ms`,
  `path`). Agrupa por olas: consultas cuyo `start` difiere menos de ~60 ms van
  en paralelo. En local cada round-trip cuesta ~250–300 ms por distancia;
  **compara número de consultas y de olas, no milisegundos**. Mide cada ruta
  dos veces (la primera compila).
- **Login local sin exponer el secreto:** el dev-login exige
  `?secret=<DEV_LOGIN_SECRET>` en la URL. Para `curl`, léelo dentro del shell
  desde `.env.development.local` sin imprimirlo. Para el navegador, levanta un
  redirector local (un `node` en `127.0.0.1:3199` que responde 302 a
  `http://localhost:3100/api/dev/login?secret=…&email=…` leyendo el secreto
  del archivo) y navega a `http://localhost:3199/go?email=<correo>`. Cuidado:
  `next dev` imprime la URL del dev-login con el secreto en su propio log; no
  vuelques ese log a la conversación sin filtrar. Usuarios de sandbox:
  `agent_owner` de Tenant Test = `dj.vergara54321@gmail.com`; `super_admin` =
  `dj.vergara@hotmail.com`. Ids útiles de Tenant Test: lead
  `11111111-0000-4000-8000-000000000001`, secuencia
  `dcaec43c-93d3-4195-812e-2211e8bfc580`, propiedad
  `9537a1a6-9306-4dce-8e08-4dd8dc80f930`, fuente `lead-magnet-test-2`.
- **TTFB de producción, rutas autenticadas:** pídele a Dylan que abra
  `app.itmano.com` en el Browser pane de la sesión (en la fase 2 ya estaba
  logueado ahí) y usa `javascript_tool` con `fetch(ruta, { headers: { RSC:
  '1' } })` midiendo `performance.now()` alrededor, dos veces por ruta.
  Reporta la segunda. Es exactamente el método de la tabla "TTFB real en
  producción" del informe; repítela igual para poder comparar.
- `next dev` reescribe `AGENTS.md` y `next-env.d.ts`: `git checkout --
  AGENTS.md next-env.d.ts` antes de cada commit.

## Tareas, en orden

### 1. Medir el efecto de la fase 2 y de la región (sin escribir código)

1. Confirma con `get_deployment` que el deployment de producción vigente
   corre en `sfo1`. Si sigue en `iad1`, díselo a Dylan: hace falta un
   redeploy de `main` (Deployments → ⋯ → Redeploy) y nada más.
2. Repite la tabla de TTFB de producción (11 rutas) con el mismo método y
   anótala junto a la anterior. Con la función en `sfo1` y las cascadas de la
   fase 2, lo esperable es 300–600 ms desde Europa en caliente.
3. Repite la traza local de las 16 rutas del informe y confirma que los
   números no cambiaron (sirve para detectar regresiones de merges
   posteriores).

### 2. Cierres pequeños de código

- `/newsletters`: los pasos de la secuencia de newsletter se leen en una
  tercera ola. Prueba el embed anidado
  `email_sequence_steps.select('id, email_sequences!inner(id,
  acquisition_channels!inner(channel_type, archived_at))')` filtrando
  `email_sequences.acquisition_channels.channel_type = 'newsletter'`; valida
  con datos (crea pasos en la secuencia de newsletter de Tenant Test en
  sandbox si no los hay) y, si funciona, muévelo a la ola principal.
- `/leads/[id]`: 22 consultas. `tenants` se lee dos veces (fila de envío +
  `getBusinessProfile`) y `acquisition_channels` dos (canales activos y
  `getTagIdsWithSequence` vía `email_sequences`); une lo que sea la misma
  fila con un getter cacheado sin cambiar las columnas que ve la UI.
- Verifica en navegador el drawer móvil (`resize_window` preset mobile) con el
  shell nuevo: logo, plan y cerrar sesión con estado pendiente. Adjunta
  captura.
- Añade `@vercel/speed-insights` (o Web Analytics) sólo si Dylan lo aprueba:
  es la única forma de tener TTFB/LCP reales por país.

### 3. Seguridad de la base (advisors), sólo lo cubierto por tests

Iguales en sandbox y producción. Una migración, gate de sandbox
(`check:db-targets`, `test:rls`, `test:scoring`, advisors) y después
producción:

- `search_path` mutable en `normalize_agent_languages`,
  `agent_api_base64url`, `touch_newsletter_edition`: añade
  `set search_path = ''` y califica las referencias (`public.`), como hacen
  las demás funciones del repo.
- `get_my_tenant_id()` e `is_super_admin()` son `security definer` y
  ejecutables por `anon` y `authenticated`. Las políticas RLS las llaman como
  el dueño de la política, así que **no** necesitan el `execute` del rol que
  consulta; revoca `execute` a `public`, `anon` y `authenticated` y comprueba
  con `test:rls` completo que nada se rompe. Si algo se rompe, documenta el
  porqué y déjalo.
- `recompute_lead_score(p_lead_id)` ejecutable por `authenticated`: revisa en
  `src/` y en `tests/scoring` quién la llama con el cliente de usuario; si
  sólo la llaman triggers y el cliente admin, revoca igual.
- Leaked password protection: es un ajuste del panel de Auth, no SQL; con
  Magic Link no cambia nada, pero indícaselo a Dylan para que lo active.

### 4. Plataforma (Dylan decide; tú documentas y verificas)

- Comprueba en Vercel si Dylan aplicó la retención y el Ignored Build Step del
  informe (compara la cuenta de deployments de los dos proyectos por semana y
  Usage → Deployment Storage). Si no, recuérdaselo con los pasos exactos.
- **Uso comercial:** el plan Hobby de Vercel es sólo para uso no comercial y
  el CRM cobra suscripciones. Recuérdaselo a Dylan como razón de cumplimiento
  para pasar a Pro, independiente del rendimiento.
- Mudanza a `iad1` + `us-east-1`: el plan está en el informe. **No lo
  ejecutes** salvo que Dylan lo pida explícitamente en esta sesión; si lo
  pide, sigue el plan paso a paso, con el ensayo contra sandbox primero, y
  confirma cada paso irreversible.

### 5. Cache Components (sólo con aprobación explícita de Dylan)

El spike de la fase 2 está en el informe: 22 archivos con `dynamic /
revalidate / runtime` que hay que migrar y un layout que lee cookies en su
nivel superior. Si Dylan aprueba, en una rama propia
(`perf/cache-components`):

1. `cacheComponents: true` en `next.config.ts`; quita los
   `export const dynamic = 'force-dynamic'` (con Cache Components todo es
   dinámico por defecto); convierte los `revalidate = 300` de `/web`, `/nl`,
   `/hp` a `use cache` + `cacheLife` y sus `revalidatePath` a
   `cacheTag`/`updateTag`; los `runtime = 'nodejs'` sobran (es el default).
2. `npx @next/codemod@canary cache-components-instant-false ./src/app` para
   opt-out de todas las páginas; build en verde.
3. En los route handlers de `/api/agent/v1/*` y `/api/studio/render`, llama
   a `connection()` antes de leer `request.headers` (o marca la ruta dinámica
   según la guía).
4. Reestructura el layout de `(dashboard)`: el contexto (cookies) tiene que
   leerse dentro de un `<Suspense>`; el nav depende del rol, así que el shell
   estático será el marco (sidebar vacío con skeleton de ítems, topbar) y el
   nav con rol llega por streaming. Mide con la traza que no aumenten las
   consultas.
5. Quita `instant = false` ruta por ruta empezando por `/dashboard` y
   `/leads`, resolviendo los insights del dev overlay.
6. Verifica en navegador y compara TTFB de carga dura desde Europa (el shell
   debe llegar del CDN, ~135 ms).

No lo actives en producción sin que Dylan lo apruebe tras ver las medidas.

### 6. Custom Access Token Hook (sólo con aprobación explícita de Dylan)

Análisis completo en el informe. Si Dylan lo aprueba: migración con
`public.custom_access_token_hook(event jsonb)` (grant sólo a
`supabase_auth_admin`, revoke a los demás) que copia `tenant_id` y `role` de
`user_profiles` a `claims.app_metadata`; activarlo en Auth → Hooks en
sandbox; cambiar `getCurrentTenantContext` para leer esos claims cuando
existan y caer al perfil si no; mantener la revalidación contra
`user_profiles` en `guards.ts` y en Server Actions; forzar cierre de sesión
al deprovisionar; bajar la vida del access token a 10–15 min; tests en
`tests/auth`. Producción sólo tras el gate de sandbox y con el hook
activado en su panel por Dylan (es un ajuste del proyecto, no SQL).

### 7. Cierre

1. Añade una sección **"Fase 3"** al informe con: tabla de TTFB antes/después
   del deploy, trazas repetidas, qué hiciste, qué descartaste, migraciones
   aplicadas y decisiones abiertas.
2. Si alguna decisión es duradera, actualiza `docs/agents/architecture.md`.
3. Commits lógicos (`perf(...)`, `fix(db)`, `docs(perf)`), push de la rama y
   mensaje final a Dylan con rama, commits, verificaciones con resultado,
   migraciones aplicadas en sandbox y producción, y pendientes que dependen
   de su decisión.

## Gates de verificación

- Antes de declarar nada terminado: `npm run lint`, `npx tsc --noEmit`,
  `npm run test:unit`, `npm run build`, `npm run check:agents`. Suites
  remotas pertinentes **de una en una**, tras `npm run check:db-targets`.
- Toda migración: primero sandbox, advisors de performance y seguridad,
  `test:rls` completo; después producción sin pedir otra autorización, salvo
  cambios destructivos.
- Verifica en navegador todo cambio de UI y adjunta capturas.
- Pregunta a Dylan sólo cuando una duda cambie materialmente el resultado.
  Siempre requieren su confirmación explícita: activar el JWT hook, activar
  Cache Components en producción, ejecutar la mudanza de región, borrar
  deployments o proyectos, y cualquier gasto.
