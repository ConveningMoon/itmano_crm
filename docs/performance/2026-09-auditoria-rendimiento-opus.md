# Auditoría de rendimiento — fase 1 (Opus 5)

Fecha: 2026-09-17 · Rama: `perf/auditoria-rendimiento` · Autor: Claude Opus 5 (High)

Objetivo: explicar por qué todas las páginas del CRM se sienten lentas con
Vercel Hobby + Supabase Free (`t4g.nano`), corregir lo que se pueda desde el
código y decidir si lo que queda es pagar planes.

## Resumen ejecutivo

1. **La base de datos no es el cuello de botella.** Producción pesa 19 MB, tiene
   2 tenants y 162 leads, un cache hit del 100% y 14–19 conexiones de 60. Las
   consultas de la app tardan de 0.5 a 7 ms de media en `pg_stat_statements`.
   Lo que más tiempo acumula son introspecciones del dashboard de Supabase y
   suites de pruebas antiguas, no la aplicación. Subir a Supabase Pro no
   acelera la navegación de forma perceptible.
2. **El piso de latencia es geográfico.** Cada navegación del dashboard es
   dinámica: pasa por el edge, la función en `sfo1` y Supabase `us-west-1`.
   Desde París, el edge usado fue `cdg1`. Con la conexión ya abierta, un HTML
   estático servido por la CDN tardó ~135 ms y `/api/health`, con una sola
   consulta, 456–664 ms. En frío llegó a 1.45 s. Ese medio segundo lo paga
   cualquier página antes de su propio trabajo. Si los usuarios reales están en
   la costa este de EE. UU. (A&J opera en Virginia Beach/Norfolk según su
   contenido), la región óptima sería `iad1` + `us-east-1`, no `sfo1` +
   `us-west-1`.
3. **Cada página hacía consultas repetidas y en cascada.** El shell repetía la
   fila de `tenants` y hasta tres veces la de `subscriptions` por request.
   Además, `/leads`, `/emails`, `/sources`, `/newsletters` y `/analytics`
   encadenaban de 3 a 5 olas de round-trips. Ya se corrigió la parte común a
   todas las páginas y `/leads`; queda el resto (ver "Pendiente").
4. **Vercel Hobby supera un límite.** *Functions Storage* va en 26.88 GB de
   10 GB. Hay 20 deployments en ~10 días y dos proyectos
   (`itmano-crm` e `itmano-crm-sandbox`) conectados al mismo repo, así que cada
   push puede construir dos veces. Esto no hace más lento cada request, pero
   pone el proyecto en riesgo de bloqueo y hay que resolverlo.
5. **Faltaba feedback visual.** Con prefetch por intención, un clic sin hover
   (o un toque en móvil) no mostraba nada hasta que respondía el servidor.
   Newsletters y Estudio no tenían `loading.tsx`. Eso hace que la latencia se
   perciba peor de lo que es.

**Conclusión sobre pagar:** Supabase Pro no resuelve la lentitud. Vercel Pro
tampoco elimina la latencia geográfica. Sí quita el riesgo del límite de
almacenamiento y da más control (multi-región, retención y observabilidad),
pero conviene decidirlo *después* de los pasos de región, retención y cascadas
de la fase 2. Ver "Decisión sobre planes".

## Evidencia

### Supabase producción (`kvmjlrvlnhiarrqxulkr`)

| Métrica | Valor |
|---|---|
| Tamaño de la base | 19 MB |
| Tenants / leads / agents | 2 / 162 / 6 |
| Cache hit (heap) | 100% |
| Conexiones | 14 (captura: 19/60) |
| `shared_buffers` | 28 672 páginas (~224 MB) |
| JWT | ES256 (JWKS con clave EC) → `getClaims()` verifica en local |

Top de `pg_stat_statements` (desde 2026-05-15): los mayores consumidores son
`pg_available_extensions`, `pg_timezone_names` y consultas de introspección de
pg-meta, es decir, el dashboard y los MCP. Las consultas de la app van de
0.5 a 7 ms de media. También aparecen miles de `DELETE FROM tenants/leads/agents`
y `rls_test_delete_user`: vienen de cuando las suites corrían contra este
proyecto, antes de que existiera el sandbox.

Advisors de performance antes del cambio:
- 12 FKs sin índice → **corregido**.
- `auth_rls_initplan` en `studio_templates_select` → **corregido**.
- 56 avisos de `multiple_permissive_policies` en `agent_email_drafts`,
  `lead_sequence_runs`, `lead_score_rules`, `newsletter_editions` y
  `properties` → pendiente. Es bajo impacto con este volumen, pero toca RLS.
- 18 índices "sin uso" → **no borrar**: con este tráfico las estadísticas no
  son representativas.

### Red y Vercel

Mediciones desde la computadora de Dylan (edge `cdg1`, París):

| Petición | TTFB |
|---|---|
| `/login` (prerender, CDN HIT), conexión reutilizada | 135 ms |
| `/api/health` (función + 1 query), en caliente | 456–664 ms |
| `/api/health`, primera petición (frío) | 1 447 ms |
| Handshake TLS a `app.itmano.com` | 270–370 ms (sólo al abrir conexión) |

- Proyecto `itmano-crm`: Node 24, Turbopack, 7 funciones por deployment, región
  `sfo1`.
- Runtime logs: la navegación del dashboard siempre es `cache=MISS`, es decir,
  dinámica. A las 16:51:52 hubo una ráfaga de ~12 invocaciones simultáneas
  (dashboard, leads, properties, emails, newsletters, sources): son prefetches
  por intención del nav. Cada uno ejecuta el layout completo.
- Un monitor hace `HEAD /api/health` cada 5 minutos.
- El equipo Hobby tiene 6 proyectos que comparten los límites del plan.

### Bundles de cliente (build de producción)

JS de cliente por ruta, sin contar el runtime de framework: dashboard ~71 KB
gzip, leads ~79 KB, properties ~84 KB, settings ~100 KB, emails ~147 KB,
lead detail ~153 KB y analytics ~186 KB (recharts). `xlsx`, `codemirror` y
`recharts` ya se cargan sólo en su ruta (`import()` dinámico o árbol de la
ruta). No es la causa principal.

### Cascadas de consultas (medición con `SUPABASE_TRACE=1`)

Se midió con `next dev` local contra sandbox, logueado como `agent_owner` de
Tenant Test. En local cada round-trip cuesta ~250 ms por la distancia
París → `us-west-1`, así que **los tiempos absolutos no representan producción**.
Lo que sí es objetivo es el número de consultas y de olas: consultas que
arrancan juntas van en paralelo; una ola nueva significa que el código esperó
a la anterior.

| Página | Antes: queries / olas | Después: queries / olas |
|---|---|---|
| `/dashboard` | 12 / 2 | 9 / 2 |
| `/leads` | 15 / 4 | **11 / 2** |
| `/emails` | 23 / 5 | 20 / 5 |
| `/properties` | 10 / 3 | 7 / 3 |
| `/sources` | 17 / 4 | 14 / 4 |
| `/analytics` | 18 / 4 | 15 / 3 |
| `/settings` | 25 / 3 | 20 / 3 |
| `/newsletters` | 16 / 4 | 12 / 4 |
| `/notifications` | 9 / 2 | 6 / 2 |
| `/activity` | 9 / 2 | 6 / 2 |

Patrón común de todas las páginas:
1. Ola 1: `user_profiles` (`getCurrentTenantContext`) sola. Todo lo demás
   espera por ella.
2. Ola 2: layout + página en paralelo.
3. Olas 3+: dependencias propias de cada página.

## Cambios aplicados en esta fase

### Código

| Cambio | Archivos | Efecto |
|---|---|---|
| Fila del tenant del shell unificada y cacheada (`getTenantShellRow`) | `src/lib/data/tenants.ts`, `src/lib/services/ai-limit.ts` | −1 query de `tenants` por página |
| `getTenantAccessFor` y el límite de IA reutilizan `getSubscription` (cacheado) | `src/lib/subscriptions/access-server.ts`, `src/lib/data/subscriptions.ts`, `ai-limit.ts` | −2 queries de `subscriptions` por página; el log de fallo en abierto se conserva |
| `/leads`: la lista trae `count: 'exact'` en la misma consulta, en paralelo con los contadores; el catálogo de fuentes y etiquetas sólo se espera si hay filtro por ellas | `src/lib/data/leads.ts`, `src/app/(dashboard)/leads/page.tsx` | 4 → 2 olas. Una página fuera de rango (416 de PostgREST) se sigue acotando bien |
| Newsletters reutilizan la suscripción cacheada; en `[id]`, plan y edición van en paralelo | `src/app/(dashboard)/newsletters/**/page.tsx` | −1 query y −1 ola |
| Traza opcional de round-trips `SUPABASE_TRACE=1` (sólo método, ruta, estado y duración; sin query params) | `src/lib/supabase/trace.ts`, `server.ts`, `admin.ts` | Herramienta de medición para fase 2 |

### Estados de carga

- `loading.tsx` nuevos: `/newsletters`, `/newsletters/[id]`,
  `/newsletters/nueva`, `/studio`, `/studio/plantillas`. Ahora todas las rutas
  de `(dashboard)` tienen esqueleto propio.
- `LinkPendingSpinner` (`useLinkStatus`) en cada ítem del nav, en los filtros
  de notificaciones y en "Cargar más" de actividad: da una señal inmediata
  aunque no haya prefetch.
- `RefreshingPill` sobre la tabla y el kanban de leads mientras filtros, orden
  o paginación vuelven a consultar.
- Clase `.loading-spinner` compartida en `globals.css`, que respeta
  `prefers-reduced-motion`.
- Regla permanente en `AGENTS.md` ("Estados de carga obligatorios") y
  `CLAUDE.md`.

### Base de datos

Migración `20260917172800_perf_fk_indexes_studio_templates_rls.sql`:
- 12 índices de FK.
- `studio_templates_select` pasa a `to authenticated using (true)`, en vez de
  `auth.role() = 'authenticated'`, que está deprecado y se evaluaba por fila.

Gate cumplido: aplicada en sandbox, advisors limpios de esos dos avisos,
`anon` lee 0 filas y `authenticated` 8, `test:schema` ✓, `test:rls` 110/110 ✓,
`test:ai-limits` 11/11 ✓. Después se aplicó en producción y se verificó
(12 índices, política `{authenticated} true`).

### Tooling de agentes

- `.mcp.json`: MCP persistentes `supabase_sandbox` y `supabase_production`,
  acotados por `project_ref`.
- `scripts/check-agent-config.mjs` exigía que no hubiera producción y ya fallaba
  desde el commit de Codex `136f636`, así que habría roto CI. Ahora exige ambos
  MCP y prohíbe URLs de Supabase MCP sin `project_ref`.

### Verificación

`npm run lint` (0 errores), `npx tsc --noEmit`, `npm run test:unit`
(102 archivos ✓), `npm run build` ✓, `npm run check:agents` ✓, suites remotas
anteriores ✓.

No se verificó visualmente en navegador: el acceso local exige pasar el secreto
de dev-login por URL y no se automatizó. Hay que revisar a ojo los skeletons
nuevos y el spinner del nav en el preview de Vercel de esta rama.

## Pendiente (para fase 2, en orden de impacto)

### P0 — Plataforma (decisiones de Dylan, sin código)

1. **Retención de deployments en Vercel.** Configurar *Deployment Retention*
   (Project → Settings) para previews y producción antiguos y volver bajo
   10 GB. Revisar si `itmano-crm-sandbox` necesita construir cada push; si no,
   limitar su rama o usar `git.deploymentEnabled`/`ignoreCommand`. Borrar
   deployments es irreversible: confirmar antes.
2. **Región.** Confirmar dónde están los usuarios reales. Si son de la costa
   este de EE. UU., planear mover Supabase a `us-east-1` y la función a `iad1`,
   siempre juntos. Mover Supabase implica un proyecto nuevo y migración de
   datos: es un proyecto aparte, con ventana de mantenimiento.
3. **Observabilidad.** Activar Speed Insights o Web Analytics en Vercel para
   tener TTFB/LCP reales por región antes y después.

### P1 — Código: shell y auth

4. **Quitar la ola 1 (`user_profiles`).** Opciones:
   (a) *Custom Access Token Hook* de Supabase que meta `tenant_id` y `role` en
   `app_metadata` del JWT. El rol se revalida hoy en cada request a propósito,
   así que hay que diseñar la revocación: tokens de vida corta o comprobación
   diferida en mutaciones.
   (b) Arrancar las queries del layout que sólo necesitan `user_id` en paralelo
   con el perfil.
   Requiere revisión de seguridad y tests de auth.
5. **Stream del shell.** El layout espera 6 lecturas antes de pintar. Mover a
   `<Suspense>` lo que no es crítico (contador de notificaciones, indicador de
   IA, banner de suscripción) para que el nav y el `loading.tsx` aparezcan
   antes, sobre todo en carga dura.
6. **Evaluar Cache Components / PPR (Next 16 `cacheComponents`).** Un shell
   estático cacheado en CDN y prefetchable haría la navegación instantánea
   aunque los datos sigan siendo dinámicos. Es un cambio grande: leer
   `node_modules/next/dist/docs/` y hacer un spike en rama propia.

### P2 — Código: cascadas por página (datos de la traza "después")

7. `/emails` (5 olas): `purchase_email_templates` + `agents`, luego
   `lead_sequence_runs` + `email_sequence_steps`, luego otra vez
   `lead_sequence_runs`. Hay dependencias en serie dentro de los datos de
   secuencias.
8. `/sources` (4 olas): `channel_metrics` espera a los canales, y después
   `tenants` + `agents` esperan a las métricas.
9. `/newsletters` (4 olas): `ensureNewsletterChannel` → `ensureNewsletterSequence`
   → lecturas. Considerar crear canal y secuencia al activar el plan o en un
   upsert único por RPC, no en cada GET.
10. `/analytics` (3 olas): `lead_response_time_stats` y `channel_metrics`
    esperan a la primera ola.
11. `/properties` (3 olas): `agents` espera a `properties`.
12. `/settings`: 20 queries, con `tenants`×4, `ai_usage_events`×4 y
    `lead_score_rules`×2. Deduplicar con los getters cacheados.
13. `/admin`: `getTenantsWithOwners` hace `auth.admin.getUserById` en serie
    por tenant (N+1 contra Auth). Paralelizar o leer emails con una RPC
    `security definer` acotada a `super_admin`.
14. `/leads/[id]` y `/emails/[id]` no se midieron: medir con la misma traza.

### P3 — Base de datos

15. Consolidar políticas permisivas múltiples (`super_admin: X` +
    `tenant isolation: X`) en una sola por acción, con
    `(select is_super_admin()) or tenant_id = (select get_my_tenant_id())`.
    Hay que correr `test:rls` completo.
16. Revisar los avisos de seguridad (fuera del alcance de rendimiento):
    funciones `security definer` ejecutables por `anon` (`get_my_tenant_id`,
    `is_super_admin`), `search_path` mutable en 3 funciones y leaked password
    protection. Hay que confirmar que los hallazgos son idénticos en producción.

## Decisión sobre planes

| Opción | ¿Acelera el CRM? | Cuándo pagarla |
|---|---|---|
| Supabase Pro (micro compute) | No de forma perceptible: la base usa 19 MB y responde en ms | Por backups diarios, sin pausa por inactividad y más conexiones, no por velocidad |
| Supabase compute mayor | No | Sólo si crecen los datos o la CPU |
| Vercel Pro | Poco en latencia. Resuelve el límite de storage y da más herramientas (retención, varias regiones, observabilidad) | Si tras la retención el storage sigue sobre el límite, o si hacen falta varias regiones o métricas. Confirmar en la documentación actual qué incluye Pro en cold starts antes de asumir mejoras |
| Mover región a la de los usuarios | **Sí**: es la mayor ganancia disponible si los usuarios no están en la costa oeste | Siempre que se confirme dónde están los usuarios |

Método de medición para la fase 2: repetir la traza (`SUPABASE_TRACE=1`) antes
y después de cada cambio, y medir TTFB de producción con conexión reutilizada
(`curl` con varias URLs en una sola invocación) para separar TLS, frío y
caliente.
