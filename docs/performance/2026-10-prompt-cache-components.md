# Prompt — sesión nueva: adoptar Cache Components (PPR) en ITMANO CRM

Copia todo lo que está debajo de la línea en una sesión nueva de Claude Code
(o Codex) abierta en `C:\dev\itmano-crm`. Dylan aprobó la adopción el
2026-10-03; la fusión a `main` la hace él con su PR.

---

Vas a adoptar **Cache Components** (`cacheComponents: true`, el modelo de
Partial Prerendering de Next 16) en ITMANO CRM. Es la mejora de rendimiento
más grande que queda: hoy cada página del CRM espera a que la función de
Vercel lea la sesión y la base antes de mandar un solo byte; con Cache
Components el esqueleto (menú, cabecera, skeletons) sale prerenderizado del
CDN en ~100 ms desde cualquier país y los datos llegan por streaming detrás.
Trabaja en español con Dylan.

## Antes de tocar nada

1. Lee `AGENTS.md` completo y cumple sus reglas: rama propia (crea
   `perf/cache-components` desde `origin/main`), commits convencionales sin
   firmas ni emojis, **tú haces commit y push; Dylan abre el PR**. Si un push o
   un acceso (GitHub, Vercel, Supabase) se bloquea, dile a Dylan exactamente
   cómo desbloquearlo.
2. Lee `docs/agents/architecture.md` entero, en especial "Rendimiento de
   lecturas" y "Versiones nuevas en pestañas abiertas".
3. Lee en `docs/performance/2026-09-auditoria-rendimiento-opus.md` las
   secciones "Cache Components / PPR: resultado del spike", "Estado final de
   las cascadas" (fase 3) y toda la fase 4.
4. Lee la documentación de Next que trae el proyecto (Next 16.3 cambia cosas
   respecto a lo que sabes), en `node_modules/next/dist/docs/01-app/`:
   - `02-guides/migrating-to-cache-components.md` (el procedimiento base)
   - `02-guides/authentication-with-cache-components.md` (nuestro caso: el
     layout lee la sesión)
   - `02-guides/instant-navigation.md` y `02-guides/adopting-partial-prefetching.md`
   - `02-guides/incremental-static-regeneration-cache-components.md` (páginas
     alojadas con ISR)
   - `03-api-reference/01-directives/use-cache.md`, `use-cache-private.md`,
     `04-functions/cacheLife.md`, `cacheTag.md`, `connection.md`,
     `03-file-conventions/02-route-segment-config/instant.md`
5. Carga la skill `vercel:next-cache-components` si está disponible. La guía
   oficial recomienda además la skill `next-cache-components-adoption`
   (`npx skills add vercel/next.js --skill next-cache-components-adoption`);
   si la instalas en el repo, regístrala en `skills-lock.json` como las demás
   skills versionadas, o úsala sin versionarla — decide y justifícalo.

## Lo que ya se sabe (spike de la fase 2, revertido)

- Con `cacheComponents: true` el build falla en cada archivo que exporta
  `dynamic`, `revalidate`, `runtime` o `fetchCache`. El spike contó 22; el
  2026-10-03 son 26: 2 páginas del dashboard (`/activity`,
  `/notifications`), las páginas alojadas con ISR (`/web`, `/nl`, `/hp`, sus
  `shared.ts` y el sitemap de `/nl`), 13 route handlers de la API de agentes,
  `/api/studio/render` y `/api/version` (aviso de versión nueva). Lista actual:
  `rg -n "export const (dynamic|revalidate|runtime|fetchCache)" src/app`.
  `maxDuration` no está en la lista de incompatibles; verifícalo en la guía.
- El layout de `(dashboard)` llama a `getCurrentTenantContext()` (lee cookies)
  en su nivel superior y el menú depende del rol: no hay shell estático sin
  reestructurarlo. El contexto debe leerse detrás de un `<Suspense>` y lo que
  dependa del rol renderizarse detrás de él, con un fallback que tenga la forma
  real del menú.
- Los route handlers de la API de agentes leen `request.headers` durante el
  prerender: hay que marcarlos dinámicos con `connection()`.
- Las páginas alojadas usan `revalidate` + `revalidatePath`: pasan a
  `use cache` + `cacheLife` y a `cacheTag` + `updateTag`/`revalidateTag`.

## Restricciones que no se negocian

- **Aislamiento por tenant.** Un `use cache` en servidor es compartido entre
  usuarios. Nunca caches datos de un tenant sin que el `tenant_id` forme parte
  de los argumentos (y por tanto de la clave), y nunca caches nada derivado de
  la sesión en caché compartida: para eso existe `use cache: private`. Ojo con
  el super_admin, que actúa como otro tenant mediante una cookie. Ante la duda,
  no caches: el objetivo es el shell estático, no cachear datos.
- **Estados de carga obligatorios** (`AGENTS.md`). Cada `<Suspense>` nuevo
  lleva un fallback con la forma real; el shell no puede saltar al llegar los
  datos.
- **No regresar las olas de consultas.** Mide con `SUPABASE_TRACE=1` antes y
  después y compara con la tabla de la fase 3 (todas las rutas en 2 olas;
  `/leads/[id]` en 3).
- **Los componentes del layout que dependen del deploy** (`NewVersionNotice`,
  `SpeedInsights`) leen `process.env.VERCEL_*`; comprueba que siguen montándose
  y funcionando con el shell prerenderizado.
- **IO síncrona en render** (`new Date()`, `Date.now()`, `Math.random()`,
  `crypto.randomUUID()`) rompe el prerender aunque pongas `instant = false`;
  muévela detrás de `connection()` o a un Client Component.
- No dispares flujos de IA pagada (Estudio, newsletters con IA) ni envíos
  reales de correo o Telegram al probar. Si alguno es imprescindible, avisa a
  Dylan antes con una estimación de coste.
- No hagas `--legacy-peer-deps` ni cambios de dependencias que el `npm ci`
  limpio de Vercel no acepte.

## Plan recomendado (por etapas, un commit lógico por etapa)

1. **Base sin cambio de comportamiento.** Activa el flag, sustituye los route
   segment configs, `instant = false` en todo con el codemod
   (`npx @next/codemod@canary cache-components-instant-false ./src/app` —
   ruta `./src/app`; comprueba el número de archivos), arregla la IO síncrona.
   Build, tests y navegación manual idénticos a hoy.
2. **Shell del dashboard.** Reestructura `src/app/(dashboard)/layout.tsx`
   según la guía de autenticación: estructura y skeleton estáticos, sesión y
   rol detrás de `<Suspense>`. Quita `instant = false` del layout y de las
   páginas una a una, empezando por `/dashboard` y `/leads`.
3. **Páginas alojadas.** ISR → `use cache` + `cacheLife` + `cacheTag`, y
   comprueba que editar una propiedad, una página de canal o una newsletter
   desde el CRM sigue actualizando su página pública.
4. **Navegación instantánea.** Evalúa `partialPrefetching` /
   prefetch de los skeletons de destino (guía de partial prefetching).

Si una etapa se complica, deja las anteriores terminadas, verificadas y
pusheadas, y documenta exactamente dónde quedó la siguiente.

## Cómo verificar

- `npm run lint`, `npx tsc --noEmit`, `npm run test:unit`, `npm run build`
  (incluye `check-sharp-tracing`). Si tocas consultas o RLS:
  `npm run check:db-targets` y las suites remotas de una en una.
- Navegador local con login de sandbox. `next dev` imprime la URL del
  dev-login con el secreto en su log: no lo vuelques sin filtrar. Usa un
  redirector local (un `node` en `127.0.0.1:3199` que lee `DEV_LOGIN_SECRET`
  de `.env.development.local` y responde 302 a
  `http://localhost:<puerto>/api/dev/login?secret=…&email=…`). Usuario
  `agent_owner` de Tenant Test: `dj.vergara54321@gmail.com`; super_admin:
  `dj.vergara@hotmail.com`. Antes de cada commit:
  `git checkout -- AGENTS.md next-env.d.ts` (next dev los reescribe).
- Recorre todas las rutas del dashboard (las 19 de la tabla de la fase 3) en
  escritorio y móvil, y las páginas alojadas.
- **Preview en Vercel:** cada push a tu rama se despliega sólo en el proyecto
  `itmano-crm-sandbox` (contra el sandbox). Comprueba allí que el HTML del
  shell llega prerenderizado (cabeceras `x-nextjs-prerender` /
  `x-vercel-cache`) y mide el TTFB del documento frente al preview de `main`.
- Producción sólo cambia cuando Dylan mergea. Después, compara la duración
  por ruta en Vercel → Observability y los datos de Speed Insights.

## Entrega

- Rama pusheada, commits por etapa.
- Sección nueva en `docs/performance/2026-09-auditoria-rendimiento-opus.md`
  ("Fase 5 — Cache Components") con qué se hizo, mediciones antes/después,
  qué queda con `instant = false` y por qué.
- `docs/agents/architecture.md` actualizado con las convenciones nuevas: dónde
  se lee la sesión, cuándo se permite `use cache` y con qué clave, cómo se
  invalidan las páginas alojadas.
- **Regla permanente para los agentes, pedida por Dylan.** Añade a `AGENTS.md`
  (fuente de verdad compartida por Claude y Codex), en "Estados de carga
  obligatorios" o en una sección propia, una regla con este sentido:

  > Cada vez que una tarea toque una página, layout o lectura de datos donde
  > se pueda aplicar Cache Components (sacar algo al shell estático, quitar un
  > `instant = false`, cachear con `use cache` / `use cache: private`, mover una
  > lectura de sesión detrás de `<Suspense>`, convertir ISR a `cacheLife`), el
  > agente lo dice explícitamente. Si lo recomienda y cabe en la tarea sin
  > riesgo para el aislamiento por tenant, lo aplica en el mismo cambio y lo
  > menciona en su resumen; si no lo aplica, explica por qué.

  Redáctala con el estilo compacto del resto de `AGENTS.md`, sin duplicar lo
  que ya diga `docs/agents/architecture.md` (enlázalo). En `CLAUDE.md`, que
  importa `AGENTS.md`, añade sólo una línea que remita a esa regla, igual que
  hace con "Estados de carga obligatorios". Pasa `npm run check:agents`: valida
  la configuración de agentes y puede exigir cambios paralelos en
  `.codex/config.toml` o en `docs/agents/`.
- Mensaje final a Dylan en español: rama, commits, verificaciones, riesgos y
  pendientes, y qué debe mirar en el preview antes de mergear.
