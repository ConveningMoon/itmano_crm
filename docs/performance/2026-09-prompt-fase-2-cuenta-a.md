# Prompt de la FASE 2 — cuenta A (la de más créditos), Fable 5 en High

Cómo usarlo: abre Claude Code con **Fable 5, esfuerzo High**, en
`C:\dev\itmano-crm` (o el clon de Mac), sobre la rama
`perf/auditoria-rendimiento`, con la cuenta que tenga **más créditos**. Copia
todo lo que va debajo de la línea como primer mensaje.

Esta fase es la más cara: mide, refactoriza y verifica. La fase 3, que correrá
en la otra cuenta, es de alcance acotado y **su prompt lo escribe esta misma
sesión** al terminar (última tarea).

---

Eres responsable de la **fase 2 de la auditoría de rendimiento** de ITMANO CRM.
La fase 1 la hizo Claude Opus 5 y está en
`docs/performance/2026-09-auditoria-rendimiento-opus.md`. Léela completa antes
de tocar nada: tiene la evidencia (Supabase, red, Vercel, bundles, trazas por
página), los cambios ya aplicados, la decisión de región y la lista priorizada
de pendientes. Tu trabajo es **validar esa auditoría con ojos frescos,
completar lo que falta, implementar las mejoras de código seguras, y dejar
preparada la fase 3 para otra sesión**.

Dato de negocio que manda sobre cualquier decisión de infraestructura: **los
usuarios están en EE. UU. y en España**. El cómputo tiene que vivir pegado a la
base de datos; el punto medio elegido es `iad1` + `us-east-1`. No propongas
funciones multi-región mientras Postgres esté en un solo sitio.

## Contexto obligatorio

1. Lee `AGENTS.md` completo (incluida la sección "Estados de carga
   obligatorios") y `CLAUDE.md`. Cumple todas sus reglas: español con Dylan,
   commits convencionales sin firmas ni menciones de autoría por IA, sin abrir
   PRs (los abre Dylan), sandbox antes que producción, `columns()` en todo
   `.select()`, filtro de `tenant_id` en código además de RLS, sin secretos en
   logs ni documentos.
2. Lee `docs/agents/architecture.md` y `docs/agents/environments.md`.
3. Antes de tocar Next.js, lee las guías relevantes de
   `node_modules/next/dist/docs/`: linking-and-navigating, streaming,
   `loading.js`, `use-link-status`, prefetching y, si evalúas PPR, cache
   components. Es Next 16.3, con cambios incompatibles con lo que recuerdas.
4. Para Supabase carga las skills `supabase` y
   `supabase-postgres-best-practices` antes de escribir SQL.
5. `git fetch --prune`, `git status`, y confirma que estás en
   `perf/auditoria-rendimiento` al día con su remoto. Si Dylan ya mergeó el PR
   de la fase 1, crea `perf/rendimiento-fase-2` desde `main`.

## Herramientas y método de medición

- MCP `supabase_sandbox` y `supabase_production`. Producción sólo lectura,
  salvo migraciones que ya pasaron el gate de sandbox.
- MCP de Vercel: equipo `team_fVxY5nEtwnbmO3ICSHDHcYAC`, proyecto
  `prj_y4Q0HDQaMpbBtWIrUJeQ3ceoPHAA`.
- **Traza de consultas:** `SUPABASE_TRACE=1 npx next dev --port 3100` escribe
  una línea JSON por round-trip (`trace: "supabase"`, `start`, `ms`, `path`).
  Entra con la ruta de dev-login descrita en `docs/agents/environments.md`,
  como el `agent_owner` de sandbox; lee el secreto de `.env.development.local`
  dentro del shell sin imprimirlo. Mide cada página dos veces (la primera
  compila) y agrupa por "olas": consultas cuyo `start` difiere menos de ~60 ms
  van en paralelo; una ola nueva significa que el código esperó. En local cada
  round-trip cuesta ~250 ms por distancia, así que **compara número de
  consultas y de olas, no milisegundos**.
- **Producción:** TTFB con `curl` reutilizando conexión (varias URLs en una
  sola invocación) para separar TLS, frío y caliente. No uses credenciales de
  usuarios; si necesitas tiempos de rutas autenticadas, pídeselos a Dylan.
- `next dev` reescribe `AGENTS.md` y `next-env.d.ts`: revierte esos cambios
  (`git checkout -- AGENTS.md next-env.d.ts`) antes de cada commit.
- Nunca dispares flujos de IA pagada para probar (ver `AGENTS.md`).

## Tareas, en orden

### 1. Validar la fase 1 (sin escribir código)

- Revisa el diff de la rama contra `main`. Busca regresiones en
  `getTenantShellRow`, `getTenantAccessFor` sobre `getSubscription` (debe
  seguir fallando en abierto y registrando el error), la paginación de
  `getLeadsListData` con `count: 'exact'` y el 416 de página fuera de rango,
  `needsRefs` en `/leads`, las páginas de newsletters y los indicadores de
  carga.
- Confirma cómo deduplica `React.cache()` entre layout y página en Next 16.3, y
  qué ocurre dentro de Server Actions.
- Re-ejecuta la traza en `/dashboard`, `/leads`, `/emails`, `/properties`,
  `/sources`, `/analytics`, `/settings`, `/newsletters`, `/notifications`,
  `/activity`, `/leads/[id]`, `/emails/[id]`, `/properties/[id]`,
  `/sources/[slug]` y `/admin` (como super_admin). Completa la tabla del
  informe con las rutas que faltan.
- Si discrepas de algún hallazgo o prioridad, dilo con evidencia.

### 2. Cascadas por página

Elimina las olas evitables en `/emails` (5 olas), `/sources` (4),
`/newsletters` (4), `/analytics` (3), `/properties` (3), `/settings`
(20 consultas), `/admin` y los detalles que midas. Criterios:

- Consultas independientes en `Promise.all`. Si una depende de otra sólo para
  un filtro opcional, lánzala en paralelo cuando ese filtro no aplica (patrón
  ya usado en `/leads`).
- Lecturas repetidas por request van a getters con `cache()` en
  `src/lib/data/*`.
- Varias lecturas pequeñas que siempre viajan juntas pueden pasar a una RPC
  `security invoker`, sólo si eliminan olas reales. No muevas lógica de negocio
  a SQL sin necesidad.
- `ensureNewsletterChannel` / `ensureNewsletterSequence` escriben en cada GET:
  propón y, si es seguro, implementa una alternativa (un upsert único, o
  creación al activar el plan) sin romper la creación implícita en la primera
  visita.
- `/admin`: `getTenantsWithOwners` llama a `auth.admin.getUserById` en serie
  por tenant. Paralelízalo o resuélvelo con una RPC acotada a `super_admin`.
- No cambies comportamiento visible ni reglas de visibilidad (`scopeFor`,
  roles). Mantén o añade tests que fijen scope y paginación, al estilo de
  `tests/visibility/leads-list-scope.test.ts`.

### 3. Shell y auth

- **Streaming del shell:** lleva a `<Suspense>` las piezas no críticas del
  layout de `(dashboard)` (contador de notificaciones, indicador de IA, banner
  de suscripción, switcher de tenants), cada una con un fallback del mismo
  tamaño para que no salte el layout. El nav y el `loading.tsx` deben pintarse
  sin esperarlas.
- **La ola 1 (`user_profiles`)** bloquea todo lo demás. Evalúa el Custom Access
  Token Hook de Supabase para llevar `tenant_id` y `role` al JWT
  (`app_metadata`, nunca `user_metadata`) frente a la alternativa de
  paralelizar. Presenta a Dylan el análisis de seguridad —revocación de rol,
  frescura del token, super_admin con tenant seleccionado por cookie— **antes**
  de implementarlo: es un cambio de auth y necesita su visto bueno explícito.
- **Cache Components / PPR:** spike acotado para medir si `cacheComponents`
  permite un shell estático prefetchable con este layout. Es la palanca que más
  compensa la distancia a España. Reporta coste y beneficio; no lo actives en
  producción sin aprobación.

### 4. Base de datos

- Consolida las políticas permisivas múltiples que listan los advisors
  (`agent_email_drafts`, `lead_sequence_runs`, `lead_score_rules`,
  `newsletter_editions`, `properties`) en una por acción, con
  `(select is_super_admin()) or tenant_id = (select get_my_tenant_id())`.
  Primero sandbox: `npm run check:db-targets`, `npm run test:rls` completo y
  `get_advisors` de performance y security. Si todo pasa, aplica la misma
  migración en producción (ya autorizado en `AGENTS.md`) y verifica el
  resultado. No borres índices "sin uso": con este tráfico la estadística no
  sirve.
- Anota los avisos de seguridad (funciones `security definer` ejecutables por
  `anon`, `search_path` mutable, leaked password protection). Corrige sólo lo
  cubierto por tests y que no cambie comportamiento; el resto queda documentado
  para la fase 3.

### 5. Estados de carga

Recorre toda acción de UI que espere a la base o a un servicio externo:
botones de Server Actions, modales que cargan datos, importaciones, generación
con IA, filtros y paginaciones. Cada una debe cumplir "Estados de carga
obligatorios" de `AGENTS.md`. Reutiliza `Skeleton`, `page-skeleton.tsx`,
`LinkPendingSpinner`, `RefreshingPill` y `NavLoadingOverlay`; no montes un
sistema paralelo.

### 6. Plataforma: diagnóstico y pasos para Dylan (no ejecutar)

- Cuantifica deployments por proyecto (`itmano-crm`, `itmano-crm-sandbox`) y
  entrega la configuración exacta de retención y de builds
  (`git.deploymentEnabled`, `ignoreCommand`) para bajar de los 10 GB de
  Functions Storage. **No borres deployments ni cambies ajustes del proyecto.**
- Verifica en la documentación vigente de Vercel y Supabase qué cambia de
  verdad con Vercel Pro y Supabase Pro (cold starts, prewarm, límites,
  regiones, compute) y cita la fuente. No asumas.
- Redacta el **plan de mudanza a `iad1` + `us-east-1`**: pasos, orden, qué se
  migra (datos, storage, variables, dominios de envío, webhooks de Paddle y
  Resend), riesgos, duración estimada de la ventana y cómo volver atrás. Sólo
  el plan; no lo ejecutes.

### 7. Cierre y entrega a la fase 3 (obligatorio)

Reserva presupuesto para esto; no lo dejes fuera si se te acaba el tiempo.

1. Actualiza `docs/performance/2026-09-auditoria-rendimiento-opus.md` con una
   sección **"Fase 2"**: tabla antes/después completa por ruta (consultas y
   olas), qué implementaste, qué descartaste y por qué, resultados de
   verificación, migraciones aplicadas y las decisiones que quedaron abiertas.
2. Escribe `docs/performance/2026-09-prompt-fase-3-cuenta-b.md`: el prompt
   completo y autosuficiente para otra sesión de Fable 5 en High, en una cuenta
   distinta, que **no tendrá tu contexto**. Debe incluir, con el mismo formato
   que este archivo: contexto obligatorio y reglas del repo, rama y estado de
   git, método de medición (`SUPABASE_TRACE=1`, TTFB con conexión reutilizada),
   qué quedó hecho y verificado, qué quedó a medias y por qué, la lista
   priorizada de tareas restantes con los datos medidos que las justifican, las
   decisiones que requieren la aprobación de Dylan, y los gates de verificación
   y entrega. Escríbelo asumiendo que quien lo lea empieza de cero.
3. Si alguna decisión es duradera, actualiza también
   `docs/agents/architecture.md`.
4. Commits lógicos y pequeños (`perf(emails): …`, `perf(shell): …`,
   `perf(db): …`, `feat(ui): …`, `docs(perf): …`), push de la rama, y mensaje
   final a Dylan con: rama, commits, verificaciones con su resultado,
   migraciones aplicadas en sandbox y producción, y pendientes que dependen de
   su decisión.

## Gates de verificación

- Antes de declarar nada terminado: `npm run lint`, `npx tsc --noEmit`,
  `npm run test:unit`, `npm run build`, `npm run check:agents`. Suites remotas
  pertinentes **de una en una**, tras `npm run check:db-targets`.
- Verifica en navegador los estados de carga nuevos y el shell con Suspense
  (Browser pane contra el dev server, o el preview de Vercel de la rama) y
  adjunta capturas.
- Pregunta a Dylan sólo cuando una duda cambie materialmente el resultado.
  Siempre requieren su confirmación: el cambio de auth por JWT, activar PPR en
  producción, borrar deployments y cambiar de región.
