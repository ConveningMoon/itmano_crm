# Prompt para Fable 5 (esfuerzo High) — fase 2 de la auditoría de rendimiento

Copia todo lo que está debajo de la línea en una sesión nueva de Claude Code con
Fable 5 en esfuerzo **High**, abierta en `C:\dev\itmano-crm` (o el clon de Mac),
sobre la rama `perf/auditoria-rendimiento`.

---

Eres responsable de la **fase 2 de la auditoría de rendimiento** de ITMANO CRM.
La fase 1 la hizo Opus 5 y está documentada en
`docs/performance/2026-09-auditoria-rendimiento-opus.md`. Léela completa antes
de tocar nada: contiene la evidencia (Supabase, red, Vercel, bundles y trazas
de consultas por página), los cambios ya aplicados y la lista priorizada de
pendientes. Tu trabajo es **validar esa auditoría con ojos frescos, completar
lo que falta, implementar las mejoras de código seguras y cerrar con una
recomendación verificada sobre si queda algo más que pagar planes**.

## Contexto obligatorio

1. Lee `AGENTS.md` completo (incluida la sección nueva "Estados de carga
   obligatorios") y `CLAUDE.md`. Sigue todas sus reglas: español con Dylan,
   commits convencionales sin firmas de IA, sin PRs (los abre Dylan), sandbox
   antes que producción, `columns()` en todo `.select()`, `tenant_id` en código
   además de RLS, sin secretos en logs ni docs.
2. Lee `docs/agents/architecture.md` y `docs/agents/environments.md`.
3. Antes de tocar Next.js, lee las guías relevantes en
   `node_modules/next/dist/docs/`: linking-and-navigating, streaming,
   `loading.js`, `use-link-status`, prefetching y, si evalúas PPR, cache
   components. El proyecto usa Next 16.3 con cambios incompatibles respecto a
   lo que conoces.
4. Para Supabase carga las skills `supabase` y
   `supabase-postgres-best-practices` antes de escribir SQL.
5. `git fetch --prune`, `git status`, y confirma que estás en
   `perf/auditoria-rendimiento` al día con su remoto. Si Dylan ya mergeó el PR de
   la fase 1, crea `perf/auditoria-rendimiento-fase-2` desde `main`.

## Herramientas y cómo medir

- MCP `supabase_sandbox` y `supabase_production`: producción sólo en lectura,
  salvo migraciones que ya pasaron el gate de sandbox.
- MCP de Vercel (equipo `team_fVxY5nEtwnbmO3ICSHDHcYAC`, proyecto
  `prj_y4Q0HDQaMpbBtWIrUJeQ3ceoPHAA`): deployments, runtime logs y docs.
- **Traza de consultas:** `SUPABASE_TRACE=1 npx next dev --port 3100` registra
  una línea JSON por round-trip (`trace: "supabase"`, `start`, `ms`, `path`).
  Para autenticarte en local usa la ruta de dev-login descrita en
  `docs/agents/environments.md` con el usuario `agent_owner` de sandbox. Lee el
  secreto desde `.env.development.local` dentro del shell sin imprimirlo. Mide
  cada página dos veces (la primera compila) y agrupa por "olas": consultas cuyo
  `start` difiere menos de ~60 ms van en paralelo. En local cada round-trip
  cuesta ~250 ms por distancia; compara **número de consultas y de olas**, no
  milisegundos absolutos.
- **Producción:** mide TTFB con `curl` reutilizando la conexión (varias URLs en
  una sola invocación) para separar TLS, frío y caliente.
- Rutas autenticadas en producción: no uses credenciales. Pide a Dylan que
  capture tiempos desde su navegador si los necesitas.
- `next dev` reescribe `AGENTS.md` y `next-env.d.ts`: revierte esos cambios
  (`git checkout -- AGENTS.md next-env.d.ts`) antes de cada commit.

## Tareas (en este orden)

### 1. Validar la fase 1 (sin escribir código)

- Revisa el diff de la rama contra `main`. Busca regresiones en los cambios de
  Opus: `getTenantShellRow`, `getTenantAccessFor` sobre `getSubscription`
  (debe seguir fallando en abierto y registrando el error), la paginación de
  `getLeadsListData` con `count: 'exact'` y el 416 de página fuera de rango,
  `needsRefs` en `/leads`, newsletters y los indicadores de carga.
- Confirma si `React.cache()` deduplica bien entre layout y página en Next 16.3
  y qué pasa dentro de Server Actions.
- Re-ejecuta la traza en `/dashboard`, `/leads`, `/emails`, `/properties`,
  `/sources`, `/analytics`, `/settings`, `/newsletters`, `/notifications`,
  `/activity`, `/leads/[id]`, `/emails/[id]`, `/properties/[id]`,
  `/sources/[slug]` y `/admin` (super_admin). Completa la tabla del documento
  con las rutas que faltan.
- Si discrepas con algún hallazgo o prioridad de Opus, dilo con evidencia.

### 2. Cascadas por página (P2 del documento)

Elimina las olas evitables de `/emails`, `/sources`, `/newsletters`,
`/analytics`, `/properties`, `/settings`, `/admin` y de los detalles que midas.
Criterios:

- Consultas independientes en `Promise.all`. Si una depende de otra sólo para
  un filtro opcional, lánzala en paralelo cuando el filtro no aplica (patrón de
  `/leads`).
- Lecturas repetidas por request van en getters con `cache()` en
  `src/lib/data/*`.
- Varias lecturas pequeñas que siempre van juntas pueden pasar a una RPC `SQL`
  `security invoker` sólo si eliminan olas reales. No muevas lógica de negocio
  a SQL sin necesidad.
- `ensureNewsletterChannel` / `ensureNewsletterSequence` escriben en cada GET:
  propón y, si es seguro, implementa una alternativa (un solo upsert o
  creación al activar el plan) sin romper la creación implícita en la primera
  visita.
- No cambies comportamiento visible ni reglas de visibilidad (`scopeFor`,
  roles). Mantén o añade tests unitarios que fijen el scope y la paginación, en
  la línea de `tests/visibility/leads-list-scope.test.ts`.

### 3. Shell y auth (P1)

- **Streaming del shell:** lleva a `<Suspense>` las piezas no críticas del
  layout de `(dashboard)` (contador de notificaciones, indicador de IA, banner
  de suscripción, switcher de tenants), cada una con un fallback del mismo
  tamaño para evitar saltos de layout. El nav y el `loading.tsx` deben poder
  pintarse sin esperarlas.
- **Ola 1 (`user_profiles`):** evalúa el *Custom Access Token Hook* de Supabase
  para llevar `tenant_id` y `role` al JWT (`app_metadata`, nunca
  `user_metadata`), frente a la alternativa de paralelizar. Presenta a Dylan el
  análisis de seguridad (revocación de rol, frescura del token, super_admin con
  tenant seleccionado por cookie) **antes** de implementarlo. Es un cambio de
  auth y requiere su visto bueno explícito.
- **Cache Components / PPR:** haz un spike acotado, en una rama aparte o detrás
  de una comprobación clara, para medir si `cacheComponents` permite un shell
  estático prefetchable con este layout. Reporta coste y beneficio; no lo actives
  en producción sin aprobación.

### 4. Base de datos (P3)

- Consolida las políticas permisivas múltiples que listan los advisors.
  Primero en sandbox, con `npm run check:db-targets` y después `npm run test:rls`
  completo, y `get_advisors` de performance y security. Si todo pasa, aplica la
  misma migración en producción (ya autorizado por `AGENTS.md`) y verifica. Nada
  de `DROP` de índices "sin uso": con este tráfico la estadística no sirve.
- Anota los avisos de seguridad (funciones `security definer` ejecutables por
  `anon`, `search_path` mutable, leaked password protection). Corrige sólo lo
  que no cambie comportamiento y esté cubierto por tests; el resto documéntalo
  como pendiente de seguridad.

### 5. Estados de carga (regla permanente)

Recorre toda acción de UI que espere a la base de datos: botones de Server
Actions, modales que cargan datos, importaciones, generación con IA, filtros y
paginaciones. Cada una debe cumplir "Estados de carga obligatorios" de
`AGENTS.md`. Reutiliza `Skeleton`, `page-skeleton.tsx`, `LinkPendingSpinner`,
`RefreshingPill` y `NavLoadingOverlay`; no crees un sistema paralelo. No
dispares generaciones de IA reales para probar: el coste es real (ver
`AGENTS.md`).

### 6. Plataforma (sólo diagnóstico y recomendación)

- Con el MCP de Vercel, cuantifica deployments por proyecto
  (`itmano-crm`, `itmano-crm-sandbox`) y propón la configuración de
  retención y de builds (`git.deploymentEnabled`, `ignoreCommand`) para bajar
  de 10 GB de Functions Storage. **No borres deployments ni cambies ajustes del
  proyecto:** entrega los pasos exactos a Dylan.
- Verifica en la documentación actual de Vercel y Supabase qué cambia de verdad
  con Vercel Pro y con Supabase Pro (cold starts, prewarm, límites, regiones,
  compute). Cita la fuente. No asumas.
- Recomienda la región según dónde estén los usuarios reales y deja escrito el
  plan de migración de región como proyecto aparte, sin ejecutarlo.

## Verificación y entrega

- Antes de declarar terminado: `npm run lint`, `npx tsc --noEmit`,
  `npm run test:unit`, `npm run build` y `npm run check:agents`. Suites remotas
  pertinentes **de una en una** tras `npm run check:db-targets`.
- Verifica visualmente en navegador los estados de carga nuevos y el shell con
  Suspense (Browser pane contra el dev server o el preview de Vercel de la rama)
  y adjunta capturas.
- Actualiza `docs/performance/2026-09-auditoria-rendimiento-opus.md`
  añadiendo una sección "Fase 2 (Fable 5)" con la tabla antes/después completa,
  qué hiciste, qué descartaste y por qué, y la **recomendación final sobre
  planes y región**. Si alguna decisión es duradera, actualiza también
  `docs/agents/architecture.md`.
- Commits lógicos y pequeños (p. ej. `perf(emails): ...`,
  `perf(shell): ...`, `perf(db): ...`, `feat(ui): ...`), push de la rama y
  mensaje final a Dylan con: rama, commits, verificaciones con su resultado,
  migraciones aplicadas (sandbox/producción) y pendientes que requieren su
  decisión.
- Pregunta a Dylan sólo cuando una duda cambie materialmente el resultado. Las
  decisiones de auth (JWT hook), PPR en producción, borrar deployments y
  cambiar de región siempre requieren su confirmación.
