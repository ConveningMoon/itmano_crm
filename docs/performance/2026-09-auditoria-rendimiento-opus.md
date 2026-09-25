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
   cualquier página antes de su propio trabajo. Los usuarios son de **EE. UU. y
   España**, así que `sfo1` + `us-west-1` es la peor esquina posible para los
   dos grupos: ver "Región para EE. UU. y España".
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
2. **Región.** Mover Supabase a `us-east-1` y las funciones a `iad1`, siempre
   juntos (ver "Región para EE. UU. y España"). Mover Supabase implica un
   proyecto nuevo y migración de datos: es un proyecto aparte, con ventana de
   mantenimiento.
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

## Región para EE. UU. y España

Los usuarios están en dos continentes, así que no existe una región que deje a
todos cerca. La regla que decide es otra: **el cómputo debe vivir pegado a la
base de datos**. Una página del dashboard hace entre 6 y 20 consultas; si la
función estuviera en Madrid y Postgres en Virginia, cada consulta cruzaría el
Atlántico y sería mucho peor que un único cruce por navegación.

De ahí se sigue:

1. **Una sola región para función y base, y que sea el punto medio:**
   `iad1` (Washington) + Supabase `us-east-1`. Orden de magnitud de ida y vuelta
   de red: costa este ~10–40 ms, costa oeste ~60–80 ms, España ~90–110 ms. Hoy,
   con `sfo1` + `us-west-1`, España paga ~150–170 ms y la costa este ~70 ms. El
   cambio mejora a los dos grupos a la vez; nadie empeora.
2. **Repartir funciones por región no sirve** mientras la base esté en un solo
   sitio: una función en Europa seguiría cruzando el Atlántico en cada consulta.
   Además el plan Hobby permite una sola región (lo dice la propia pantalla de
   Vercel).
3. **Réplicas de lectura de Supabase**: existen desde el plan Pro y exigen un
   compute add-on, y son de **solo lectura** — las escrituras siguen yendo al
   primario. Una réplica en `eu-west` sólo tendría sentido si España creciera
   mucho y el trabajo fuera mayormente de lectura, y obligaría a separar
   lecturas de escrituras en el código. No es para ahora.
4. **Lo que sí compensa la distancia es reducir viajes:** menos olas de
   consultas por página (fase 2), shell cacheable y prefetchable (PPR), y
   contenido público servido por la CDN. Las páginas alojadas (`/web`, `/nl`,
   `/hp`) ya usan ISR y se sirven desde el edge más cercano: eso ya funciona
   bien para España.

Plan sugerido: primero fase 2 (menos viajes y shell en streaming), medir, y
después ejecutar la mudanza de región como proyecto propio con ventana de
mantenimiento. Mover Supabase de región implica crear un proyecto nuevo en
`us-east-1`, migrar datos y storage, rotar variables de entorno y reapuntar
dominios de envío; no es un cambio de una casilla.

## Decisión sobre planes

| Opción | ¿Acelera el CRM? | Cuándo pagarla |
|---|---|---|
| Supabase Pro (micro compute) | No de forma perceptible: la base usa 19 MB y responde en ms | Por backups diarios, sin pausa por inactividad y más conexiones, no por velocidad |
| Supabase compute mayor | No | Sólo si crecen los datos o la CPU |
| Vercel Pro | Poco en latencia. Resuelve el límite de storage y da más herramientas (retención, varias regiones, observabilidad) | Si tras la retención el storage sigue sobre el límite, o si hacen falta varias regiones o métricas. Confirmar en la documentación actual qué incluye Pro en cold starts antes de asumir mejoras |
| Mover a `iad1` + `us-east-1` | **Sí**: es la mayor ganancia disponible; mejora a la vez a EE. UU. y a España | Tras la fase 2, como proyecto con ventana de mantenimiento |
| Réplica de lectura en Europa | Sólo si España crece y el trabajo es de lectura | Requiere Supabase Pro + compute add-on y separar lecturas de escrituras en código |

Método de medición para la fase 2: repetir la traza (`SUPABASE_TRACE=1`) antes
y después de cada cambio, y medir TTFB de producción con conexión reutilizada
(`curl` con varias URLs en una sola invocación) para separar TLS, frío y
caliente.

---

# Fase 2 (Claude Fable 5.1, High) — 2026-09-18

Rama: `perf/auditoria-rendimiento` (misma rama; el PR de la fase 1 no se
había mergeado). Alcance: validar la fase 1, eliminar cascadas por página,
streaming del shell, consolidación de políticas RLS, estados de carga,
diagnóstico de plataforma y preparación de la fase 3.

## Validación de la fase 1

- El diff de la fase 1 se revisó completo. `getTenantShellRow`,
  `getTenantAccessFor` sobre `getSubscription` (sigue fallando en abierto y
  registrando el error en `getSubscription`), la paginación de
  `getLeadsListData` con `count: 'exact'` y el 416 fuera de rango, `needsRefs`
  en `/leads`, newsletters y los indicadores de carga están bien y sin
  regresiones. Las trazas se reprodujeron con los mismos números.
- `React.cache()` en Next 16.3 deduplica por request entre layout, página y
  slots del mismo árbol RSC (se comprobó en las trazas: `subscriptions` y la
  fila de `tenants` aparecen una vez aunque las piden shell, `ai-limit` y
  páginas). Dentro de una Server Action el scope es el request de la action,
  independiente del render: un getter cacheado llamado desde una action se
  ejecuta una vez por action, no comparte con la página.
- **Hallazgo nuevo (el más importante de la fase):** el deployment de
  producción vigente (`dpl_H71xSsiLs3RdsXbv2vgR54u9obo3`, commit `a27c73c`)
  corre en **`iad1`** (Washington), no en `sfo1`. Lo dice el propio deployment
  (`regions: ["iad1"]`) y cada respuesta autenticada (`x-vercel-id:
  fra1::iad1::…`). Supabase está en `us-west-1`, así que HOY cada consulta
  cruza EE. UU. de costa a costa (~60–70 ms de ida y vuelta) y una página de 2
  olas paga eso dos veces antes de su propio trabajo. La captura del panel
  muestra `sfo1` marcado, pero con el aviso "A new Deployment is required":
  Dylan cambió la región después del último deploy de `main` y todavía no se
  ha desplegado. El siguiente deploy a producción (por ejemplo, el merge de
  esta rama) dejará la función en `sfo1`, pegada a la base, hasta que se haga
  la mudanza conjunta a `iad1` + `us-east-1`.

### TTFB real en producción (rutas autenticadas)

Medido desde el navegador de esta sesión (edge `fra1`, Fráncfort), como
super_admin actuando como Tenant Test, con `fetch` RSC y conexión ya abierta.
Dos peticiones seguidas por ruta; se lista la segunda (caliente). Todas
`x-vercel-cache: MISS` (dinámicas). Función en `iad1`, base en `us-west-1`.

| Ruta | TTFB 2.ª petición | 1.ª petición |
|---|---|---|
| `/dashboard` | 944 ms | 1 826 ms |
| `/leads` | 2 000 ms | 1 819 ms |
| `/emails` | 1 676 ms | 1 572 ms |
| `/properties` | 799 ms | 702 ms |
| `/sources` | 1 164 ms | 4 245 ms |
| `/analytics` | 1 254 ms | 851 ms |
| `/settings` | 932 ms | 1 017 ms |
| `/newsletters` | 1 404 ms | 1 256 ms |
| `/notifications` | 740 ms | 1 140 ms |
| `/activity` | 707 ms | 878 ms |
| `/admin` | 1 690 ms | 2 447 ms |

Esto es la línea base ANTES de desplegar la fase 2 y antes de que la función
vuelva a `sfo1`. Hay que repetir la misma medición tras el deploy (ver prompt
de la fase 3).

## Cascadas por página: antes y después

Trazas con `SUPABASE_TRACE=1` contra sandbox, `agent_owner` de Tenant Test
(super_admin para `/admin`), segunda carga de cada ruta. "Antes" es el estado
al terminar la fase 1.

| Ruta | Antes: queries / olas | Después: queries / olas |
|---|---|---|
| `/dashboard` | 9 / 2 | 9 / 2 |
| `/leads` | 11 / 2 | 11 / 2 |
| `/emails` | 20 / 5 | **18 / 2** |
| `/emails/[id]` | 12 / 4 | **11 / 2** |
| `/analytics/emails` | N+1 por secuencia | **7 / 2** |
| `/properties` | 7 / 3 | **6 / 2** |
| `/properties/[id]` | 8 / 4 | **7 / 2** |
| `/sources` | 14 / 4 | **15 / 2** |
| `/sources/[slug]` | 15 / 4 | **15 / 2** |
| `/analytics` | 15 / 3 | **15 / 2** |
| `/settings` | 20 / 3 | **17 / 2** |
| `/newsletters` | 12 / 4 | **12 / 3** |
| `/notifications` | 6 / 2 | 6 / 2 |
| `/activity` | 6 / 2 | 6 / 2 |
| `/leads/[id]` | 22 / 4 | **22 / 3** |
| `/admin` (super_admin) | 18 / 3–4 | **14 / 2** |

La ola 1 sigue siendo `user_profiles` (contexto) en todas; la ola 2 es el
shell y la página juntos. Ninguna página cambió lo que muestra.

### Qué se implementó

**Base de datos** (`20260918140000_perf_rpc_metrics_owner_emails.sql`):

- `sequence_email_metrics(p_tenant_id, p_sequence_ids)`: métricas de envío por
  secuencia y por paso, más el total, en una consulta. Sustituye la cadena
  runs → envíos → eventos del código y el N+1 de `/analytics/emails`. Misma
  definición (evento igual o posterior al primer envío del lead). Probada con
  fixtures temporales en sandbox (click 50 %, reply 0 % con evento anterior al
  envío, desglose por paso) y borradas después.
- `tenant_channel_metrics(p_tenant_id, p_window_days)`: envoltorio de
  `channel_metrics` por tenant, para no esperar a los canales.
- `tenant_owner_emails()`: `security definer`, sólo `service_role`; sustituye
  la llamada al Auth Admin API por tenant en serie del centro de control.
- `lead_response_time_stats(..., p_include_manual_rules)`: une las reglas
  manuales activas por dentro; los tipos fijos siguen en
  `src/lib/scoring/agent-actions.ts`. La firma cambia (drop + create).

**Código** (un commit por dominio):

- `perf(emails)`: métricas por RPC en la misma ola que la lista;
  `ensurePurchaseTemplateRows` devuelve lo que lee (agentes y plantillas) en
  vez de que `getPurchaseTemplatesByAgent` lo relea; `getTagSequenceCoverage`
  en una ola (pasos y corridas por tenant); nombres de agente y tenant
  embebidos por FK en `listSequences` y `getSequenceWithRuns`; el super_admin
  lee los tenants en paralelo. `email-metrics-group.ts` y su test se eliminan
  (ya no hay agrupación en JS).
- `perf(sources)`: `channels.ts` lee canales, métricas por tenant y nombres de
  agente juntos (`getTenantChannelMetrics` y `getAgentNames` cacheados);
  `getChannelBySlug` resuelve el canal por slug y `getSubmissionsForChannelSlug`
  sus envíos por join; `/sources` deja de esperar a los canales para leer la
  fila del tenant.
- `perf(leads)`: la ficha del lead lanza todo en una ola (sólo necesita el id y
  el tenant del contexto) y comprueba la visibilidad sobre la fila antes de
  devolver nada; `getLeadPriorityPosition` se parte en ejes + ranking.
- `perf(properties)`: `agents(name)` y `tenants(name)` embebidos; el detalle
  lee la fila del tenant en paralelo.
- `perf(newsletters)`: estadísticas por tipo de canal (join), plan comprobado
  tras la ola, no antes.
- `perf(settings)`: `getScoreRulesBundle` (globales + efectivas de una
  consulta), owners dentro del `Promise.all`, `getAgentAiBreakdown` con los
  getters cacheados.
- `perf(admin)`: RPC de owners, `getTenantNames` cacheado en notificaciones,
  actividad y uso de IA.
- `perf(shell)`: el layout de `(dashboard)` sólo espera al contexto. Logo,
  plan, no leídas, límite de IA, switcher y banner son Server Components dentro
  de `<Suspense>` (`shell-slots.tsx`) que leen de `getShellData` (una ola,
  deduplicada con `cache()`). En una carga dura el HTML sale con 6 boundaries
  y sus skeletons (verificado en el HTML: el sidebar llega en el byte ~3 000 y
  el contenido de la página en el ~62 000). La validación de la cookie de
  tenant del super_admin arranca en paralelo con el perfil.
- `feat(ui)`: `PendingSubmitButton` (`useFormStatus`) para los tres
  formularios de Server Components sin estado pendiente: cerrar sesión (sidebar
  y drawer) y "Entrar al CRM" del centro de control. El resto de acciones de UI
  (modales, importaciones, generación con IA, filtros, paginación) ya tenía
  `useTransition` o estado propio; se recorrieron todas.

**RLS** (`20260918140100_perf_rls_single_policy_per_action.sql`): una
política permisiva por acción en `agent_email_drafts`, `lead_sequence_runs`,
`lead_score_rules` (la de escritura del super_admin era `for all` y se parte
en insert/update/delete), `newsletter_editions` y `properties` (la política
del tenant pasa a `to authenticated`: para `anon` nunca dejaba pasar filas).
Funciones envueltas en `(select …)`.

### Qué se descartó y por qué

- Mover los pasos de la newsletter a la misma ola con un embed anidado
  (`email_sequence_steps → email_sequences → acquisition_channels`): funciona
  en PostgREST pero no se pudo validar con datos (el sandbox no tiene pasos en
  la secuencia de newsletter). Queda como una ola de una consulta.
- Un RPC para el ranking del lead (`getLeadPriorityPosition`): serían 2 olas
  → 2 olas igual, porque los autores de los eventos también dependen de la
  primera ola. No compensa.
- Cambiar el orden de los agentes del dashboard para deduplicar con un getter
  compartido: cambia el orden visible; no se tocó.
- Resolver las reglas manuales del tiempo de respuesta en SQL sin parámetro:
  duplicaría la lista fija de `agent-actions.ts`. Se pasó por parámetro.

### Verificación

- `npm run lint` 0 errores (1 warning preexistente en `scripts/`),
  `npx tsc --noEmit` ✓, `npm run test:unit` 101 archivos / 1 112 tests ✓,
  `npm run check:agents` ✓, `npm run build` ✓.
- Sandbox: `npm run check:db-targets` ✓, `npm run test:rls` 19 archivos /
  110 tests ✓ tras la consolidación; advisors de performance sin avisos de
  políticas (sólo `unused_index`, que no se toca); advisors de seguridad
  iguales que antes (ver "Pendiente").
- Producción: ambas migraciones aplicadas tras el gate; advisors de
  performance sólo `unused_index`; las cuatro funciones devuelven datos
  (26 secuencias, 2 owners, 12 canales del primer tenant, 23 leads medibles) y
  las 13 políticas resultantes coinciden con sandbox.
- Navegador (dev server local con la traza, sesión del `agent_owner` de
  sandbox): dashboard y leads renderizan con el shell nuevo, logo, plan, badge
  de IA y contador de no leídas; sin errores de consola propios (el único 400
  es el logo del tenant por `next/image` contra una IP privada de la red
  local, preexistente). El drawer móvil no se verificó visualmente.

### Advertencia de esta sesión

`next dev` escribe en su log la línea de request de `/api/dev/login` con el
secreto en la URL, y ese log se leyó en la sesión. El secreto sólo sirve en
`localhost` contra sandbox, pero conviene rotar `DEV_LOGIN_SECRET` en
`.env.development.local` de las dos computadoras. Para entrar al dev server
desde el navegador sin exponerlo se usó un redirector local: un `node` en
`127.0.0.1:3199` que responde 302 al dev-login leyendo el secreto del
entorno (ver el prompt de la fase 3 para reproducirlo).

## Auth: ola 1 (`user_profiles`) y Custom Access Token Hook

Análisis; no implementado. Requiere el visto bueno de Dylan.

- Qué es: un hook (función SQL `public.custom_access_token_hook(event jsonb)`
  ejecutable sólo por `supabase_auth_admin`) que corre cada vez que Auth emite
  un access token, incluidos los refrescos, y puede añadir claims a
  `app_metadata` (nunca `user_metadata`, que edita el usuario). Con
  `tenant_id` y `role` en el JWT, `getCurrentTenantContext` los leería del
  token ya verificado en local y la ola 1 desaparecería de todas las páginas.
- Frescura: los claims se recalculan al emitir el token, así que un cambio de
  rol o de tenant tarda hasta la vida del access token (1 h por defecto,
  configurable a minutos) en verse. Hoy el rol se revalida contra
  `user_profiles` en cada request. La mitigación razonable: usar los claims para
  las LECTURAS (layout y páginas) y seguir revalidando en las mutaciones
  (`guards.ts`, Server Actions), que ya hacen sus propias comprobaciones.
- Revocación: quitar un acceso hoy es inmediato (sin perfil → `/login`). Con
  claims, hay que forzar el cierre de sesión al deprovisionar (signOut global
  desde el admin) y bajar la vida del token a ~10–15 min.
- super_admin con tenant seleccionado: no cambia. El tenant "actuado" sale de
  la cookie validada contra `tenants`, no del perfil; ahora esa validación ya
  corre en paralelo con el perfil.
- Coste: migración (función + grants), activar el hook en el panel de Auth en
  los dos proyectos, cambio en `tenant-context.ts`, tests de auth nuevos y un
  plan de rollback (desactivar el hook y volver a leer el perfil). ~1 día.
- Beneficio: una consulta menos por request (la única que va antes de todo).
  Con la función pegada a la base (sfo1 hoy, iad1 después) vale ~5–15 ms por
  página; con la función lejos de la base valía ~65 ms. Es más útil cuanto
  peor esté la región, así que **primero alinear región, después decidir**.

## Cache Components / PPR: resultado del spike

Se activó `cacheComponents: true` en local y se corrió `next build` dos veces:

1. Tal cual: el build falla en 22 archivos por `export const dynamic /
   revalidate / runtime` (2 páginas del dashboard, 6 páginas alojadas con ISR,
   13 route handlers de la API de agentes, `/api/studio/render`). Es mecánico:
   los `revalidate` de `/web`, `/nl`, `/hp` pasan a `use cache` +
   `cacheLife`, y sus `revalidatePath` a `cacheTag`/`updateTag`.
2. Quitando esas 24 líneas: compila y tipa, pero el prerender falla en la
   primera página del dashboard que toca (`/studio`, `/analytics/emails`, y
   seguiría con todas): el layout de `(dashboard)` lee cookies en su nivel
   superior (`getCurrentTenantContext`) y el nav depende del rol, así que no
   hay shell estático posible sin reestructurar: el contexto tiene que leerse
   dentro de un `<Suspense>` y el nav pasar a renderizarse detrás de él (o
   `export const instant = false` en las 24 páginas para adoptar por partes,
   que es lo que recomienda la guía). Además los route handlers de la API de
   agentes leen `request.headers` durante el prerender y hay que marcarlos
   dinámicos con `connection()`.

Coste estimado: 2–4 días de trabajo en una rama propia, con el codemod
`cache-components-instant-false` como punto de partida y adopción ruta por
ruta, más pruebas de las páginas alojadas (que hoy usan ISR y funcionan
bien). Beneficio: en una carga dura el HTML del shell y del skeleton saldría
del CDN (~135 ms desde España frente a ~1 s hoy) y, con `partialPrefetching`,
la navegación mostraría el skeleton de destino al instante. Es la palanca que
más compensa la distancia a España, pero no es urgente hasta alinear región
y medir. **No activar en producción sin aprobación.** Todo se revirtió;
nada de esto está en la rama.

## Plataforma: diagnóstico y pasos para Dylan (no ejecutados)

### Deployments y storage

- Proyecto `itmano-crm`: 20 deployments entre el 6 y el 18 de septiembre
  (todos los pushes de ramas + `main`), 7 funciones cada uno. Proyecto
  `itmano-crm-sandbox`: exactamente los mismos 20 (mismo repo, cada push se
  construye dos veces y `main` se despliega como "producción" también ahí).
  Ambos en el equipo Hobby con otros 4 proyectos que comparten límites.
- Functions Storage 26.88 GB de 10 GB. Vercel lo mide en GB-mes sobre los
  deployments retenidos; se reduce con retención más corta y con menos
  deployments. Fuente: <https://vercel.com/docs/deployment-storage>.
- Retención en Hobby: por defecto 30 días para preview, producción, cancelados
  y errados; siempre se conservan los últimos 3 deployments del proyecto y los
  últimos 3 de producción en estado Ready, y el último preview de cada rama
  activa. Se configura en Project → Settings → Security → Deployment Retention
  Policy. Lo borrado queda restaurable 30 días. Fuente:
  <https://vercel.com/docs/deployment-retention>.

Pasos concretos (dashboard, ambos proyectos):

1. `itmano-crm` → Settings → Security → Deployment Retention Policy: Preview y
   Canceled/Errored a **1 día**; Production al mínimo que permita rollback
   cómodo (**7 días**; los últimos 3 de producción se conservan igual).
2. `itmano-crm-sandbox` → lo mismo, con Production a **1 día**.
3. Parar el doble build. `vercel.json` es compartido por los dos proyectos, así
   que `git.deploymentEnabled` no sirve para diferenciarlos; usar el **Ignored
   Build Step** de cada proyecto (Settings → Git → Ignored Build Step, opción
   "Custom"):
   - `itmano-crm` (sólo `main`): `[ "$VERCEL_GIT_COMMIT_REF" != "main" ] && exit 0 || exit 1`
   - `itmano-crm-sandbox` (sólo ramas): `[ "$VERCEL_GIT_COMMIT_REF" = "main" ] && exit 0 || exit 1`
   Con eso cada push construye una vez. Los previews de PR siguen existiendo,
   en el proyecto sandbox (con datos de sandbox), que es lo que se quiere.
4. Esperar 48 h (el job de borrado corre en ese plazo) y comprobar Usage →
   Deployment Storage. No borrar deployments a mano salvo que siga por encima.

### Qué cambia de verdad con Vercel Pro y Supabase Pro (fuentes vigentes)

Vercel (<https://vercel.com/docs/fluid-compute>,
<https://vercel.com/docs/functions/configuring-functions/region>,
<https://vercel.com/docs/limits>, <https://vercel.com/docs/limits/fair-use-guidelines>):

- Cold starts: el bytecode caching de Fluid Compute y el pre-warming de
  producción aplican a todos los planes; Pro **no** compra menos cold start.
  Pro añade CPU "Performance" opcional (más rápido por invocación, más caro).
- Regiones: Hobby 1 región; Pro hasta 5 (la página de Fluid dice "up to 3":
  la de regiones, más reciente, dice 5). Con Postgres en un solo sitio, varias
  regiones no ayudan (ver "Región").
- Límites: Hobby incluye 4 h de CPU activa, 1 M de invocaciones, 10 GB de
  Fast Origin Transfer y 100 GB de transferencia al mes; Pro cobra por uso
  con crédito incluido (invocaciones 0,60 $/M, CPU desde 0,128 $/h, storage
  0,10 $/GB-mes). Retención en Pro: 180 días preview, 1 año producción por
  defecto (configurable), y conserva los últimos 10/20.
- Logs de runtime: 1 h en Hobby, 1 día en Pro, 3 días en Enterprise.
- **Uso comercial**: la política de uso justo de Vercel dice que "Hobby teams
  are restricted to non-commercial personal use only" y define comercial como
  cualquier deployment con cobro a visitantes o a clientes. ITMANO CRM cobra
  suscripciones (Paddle). Independientemente del rendimiento, el proyecto
  debería estar en Pro por cumplimiento; es la razón más sólida para pagar.

Supabase (<https://supabase.com/docs/guides/platform/compute-and-disk>,
<https://supabase.com/docs/guides/platform/manage-your-usage/compute>,
<https://supabase.com/docs/guides/platform/read-replicas>):

- Free = Nano: CPU compartida, hasta 0,5 GB de RAM, 60 conexiones directas,
  200 por pooler; con ráfagas limitadas por presupuesto de IO y "subject to
  change". Pro = 25 $/mes con 10 $ de crédito de cómputo, que cubre Micro
  (1 GB, 60 conexiones, 200 pooler; 0,01344 $/h). En organizaciones de pago,
  Nano se factura como Micro.
- Con 19 MB de datos y consultas de milisegundos, Micro no acelera la
  navegación; da RAM, backups diarios, sin pausa por inactividad y soporte.
  La velocidad la decide la región.
- Read replicas: sólo lectura, endpoints propios, pensadas para escala o
  distribución geográfica; obligan a separar lecturas de escrituras. No ahora.
- Mover de región = proyecto nuevo + backup/restore (ver plan).

### Región: qué hacer y en qué orden

1. **Ahora (sin coste, con el próximo deploy):** la función pasa a `sfo1`
   (ya está marcada en el panel). Pegada a `us-west-1`, cada consulta baja de
   ~65 ms a ~2 ms. Es la mejora más grande y más barata disponible hoy y no
   requiere nada más que desplegar. Medir el TTFB de la tabla de arriba después.
2. **Después, como proyecto:** mudanza conjunta a `iad1` + `us-east-1` (mejora
   a la vez a la costa este y a España; ver "Región para EE. UU. y España").

### Plan de mudanza a `iad1` + `us-east-1` (sólo plan)

Fuente del procedimiento:
<https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore>.

0. Preparación (sin ventana): crear el proyecto nuevo en `us-east-1` (Pro,
   Micro), misma versión de Postgres; activar en él las extensiones que use el
   actual (`vault`, `pg_net`, `pgcrypto`, las que liste `list_extensions`);
   configurar Auth igual (proveedores, URLs de redirección, plantillas de
   correo, Magic Link, JWT con clave ES256 → el JWKS cambia: las sesiones
   actuales dejarán de validar y todos volverán a entrar por Magic Link);
   crear los 4 buckets de Storage con las mismas políticas; recrear
   `DEV_LOGIN_ALLOWED_SUPABASE_REF` sólo en sandbox (no aplica a producción).
1. Ensayo completo contra sandbox: dump → restore en un proyecto temporal,
   correr `test:schema` (paridad), `test:rls` y `test:scoring` contra él.
2. Ventana de mantenimiento (estimación 60–90 min con 19 MB; lo que manda es
   Storage y las comprobaciones): anunciar; pausar crons externos
   (score-decay en Vercel, los que disparen secuencias), pausar el webhook de
   Paddle (o aceptar que Paddle reintenta durante horas: lo hace) y el
   inbound de Resend (reintenta 72 h).
3. Base: `supabase db dump --db-url <viejo> -f roles.sql --role-only`,
   `… -f schema.sql`, `… -f data.sql --use-copy --data-only -x
   storage.buckets_vectors -x storage.vector_indexes`; restaurar con
   `psql --single-transaction --variable ON_ERROR_STOP=1 --file roles.sql
   --file schema.sql --command 'SET session_replication_role = replica'
   --file data.sql --dbname <nuevo>`. Los usuarios de Auth viajan en el dump
   (`auth.users`, mismos ids, así que `user_profiles.id` y `agents.user_id`
   siguen válidos). Recuperar la clave raíz de Vault del proyecto viejo ANTES
   de pausarlo si hay secretos en Vault (el de Telegram lo usa).
4. Storage: copiar objetos de los 4 buckets con el script de la guía (lista
   por bucket y sube al nuevo). Las URLs públicas cambian de host: reescribir
   `tenants.logo_url`, `properties.image_url/gallery/floor_plans/detail_pdf_url`,
   `newsletter_editions.cover_image_url`, `studio_images.*` y
   `agents.cover/avatar` con un `update … set col = replace(col, '<viejo>',
   '<nuevo>')`, y añadir el host nuevo a `images.remotePatterns` (sale del
   env, así que basta con la variable).
5. Vercel (`itmano-crm`): Settings → Functions → Region `iad1`; variables
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` (y `PARITY_*` si existen) al proyecto nuevo;
   redeploy de `main`. Actualizar `.env.local` de los clones y `.mcp.json` /
   `.codex/config.toml` / `AGENTS.md` con el `project_ref` nuevo (y el guard
   `check-agent-config.mjs`).
6. Terceros: Paddle y Resend apuntan a `app.itmano.com`, que no cambia; sólo
   hay que reactivar lo pausado. Los dominios de envío de Resend no dependen
   de Supabase. El cron de decay en `vercel.json` no cambia.
7. Comprobación: login por Magic Link, `/dashboard`, `/leads`, subir una foto
   de propiedad, `test:schema` y `test:rls` contra el nuevo, `get_advisors`.
   Repetir la tabla de TTFB.
8. Vuelta atrás: mientras el proyecto viejo no se pause ni se borre, volver es
   restaurar las variables anteriores y la región `sfo1` y redeploy (minutos).
   Conservar el proyecto viejo pausado 30 días; después borrarlo (confirmar).
   Riesgo principal: escrituras que entren entre el dump y el cambio de
   variables (leads por intake, webhooks): por eso se pausan los crons y se
   hace el corte con la app en mantenimiento, o se repite un dump de datos
   incremental de `leads`, `lead_events`, `form_submissions` y
   `channel_page_views` justo antes de cambiar variables.

## Pendiente para la fase 3

Está desarrollado en `docs/performance/2026-09-prompt-fase-3-cuenta-b.md`.
Resumen priorizado:

1. Desplegar (merge de esta rama) y repetir la medición de TTFB en producción
   con la función ya en `sfo1`.
2. Retención e Ignored Build Step en Vercel (Dylan; pasos arriba).
3. Decidir Vercel Pro (cumplimiento comercial) y la mudanza de región.
4. Adopción incremental de Cache Components en rama propia (con aprobación).
5. Custom Access Token Hook (con aprobación; después de la región).
6. Avisos de seguridad de advisors: `search_path` mutable en
   `normalize_agent_languages`, `agent_api_base64url`,
   `touch_newsletter_edition`; `get_my_tenant_id` / `is_super_admin` /
   `recompute_lead_score` como `security definer` ejecutables por
   `anon`/`authenticated` (revocar y comprobar que las políticas siguen
   funcionando: las políticas se evalúan como el dueño de la función, no
   necesitan el grant); leaked password protection (irrelevante con Magic
   Link, pero activarlo no cuesta). Iguales en sandbox y producción.
7. `/newsletters` (pasos en una ola) y `/leads/[id]` (22 consultas: dedupe de
   `tenants`×2 y `acquisition_channels`) si se quiere apurar.
8. Verificar el drawer móvil y los skeletons en el preview de Vercel.

---

# Fase 3 (Claude Opus 5, High) — 2026-09-19

Rama: `perf/auditoria-rendimiento` (la misma; el PR de las fases 1 y 2 sigue
sin mergear). Alcance: cerrar las cascadas que quedaban, quitar las lecturas
repetidas de la misma fila, atacar el peso que paga el navegador (imágenes y
bundle de gráficos), cerrar los avisos de seguridad que se pueden cerrar, y
dejar por escrito qué queda en manos de Dylan.

## Estado final de las cascadas

Trazas con `SUPABASE_TRACE=1` contra sandbox, segunda carga de cada ruta,
`agent_owner` de Tenant Test (super_admin en `/admin` y `/solicitudes`).
"Fase 1" es el estado al terminar la primera auditoría.

| Ruta | Fase 1 | Fase 2 | Fase 3 |
|---|---|---|---|
| `/dashboard` | 9 / 2 | 9 / 2 | 9 / 2 |
| `/leads` | 11 / 2 | 11 / 2 | 11 / 2 |
| `/leads/new` | — | 8 / 4 | **8 / 2** |
| `/leads/[id]` | 22 / 4 | 22 / 3 | **20 / 3** |
| `/emails` | 20 / 5 | 18 / 2 | **16 / 2** |
| `/emails/new` | — | 6 / 2 | 6 / 2 |
| `/emails/[id]` | 12 / 4 | 11 / 2 | 11 / 2 |
| `/analytics` | 15 / 3 | 15 / 2 | 15 / 2 |
| `/analytics/emails` | N+1 | 7 / 2 | 7 / 2 |
| `/properties` | 7 / 3 | 6 / 2 | 6 / 2 |
| `/properties/[id]` | 8 / 4 | 7 / 2 | **6 / 2** |
| `/sources` | 14 / 4 | 15 / 2 | **13 / 2** |
| `/sources/[slug]` | 15 / 4 | 15 / 2 | **14 / 2** |
| `/settings` | 20 / 3 | 17 / 2 | **15 / 2** |
| `/newsletters` | 12 / 4 | 12 / 3 | **11 / 2** |
| `/newsletters/nueva` | — | 7 / 3 | **6 / 2** |
| `/notifications` | 6 / 2 | 6 / 2 | 6 / 2 |
| `/activity` | 6 / 2 | 6 / 2 | 6 / 2 |
| `/solicitudes` | — | 5 / 2 | 4 / 2 |
| `/admin` | 18 / 4 | 14 / 2 | 14 / 2 |

**Todas las rutas del CRM están en dos olas**: la del contexto
(`user_profiles`) y una segunda donde caben el shell y la página enteros. La
única excepción es `/leads/[id]`, con una tercera de dos `count` para la
posición del lead en la cola, que por definición necesita los ejes del lead
antes de poder contar quién va por delante.

## Qué se implementó

### El shell ya no va por detrás de la página

Al pasar el shell a `<Suspense>` en la fase 2, React dejaba de llegar a esos
componentes hasta después de recorrer el árbol de la página, así que sus
consultas salían una ola entera por detrás. El layout ahora **dispara**
`getShellData(ctx)` sin esperarlo y los slots comparten esa promesa
(`cache()`): el shell vuelve a viajar en la misma ola que la página y sigue
sin bloquear el pintado. Se vio en `/leads/[id]`, que había pasado de 3 a 4
olas y volvió a 3.

### Una sola lectura de la fila del tenant (`getTenantRow`)

La misma fila de `tenants` se leía dos o tres veces por página con columnas
distintas: el shell (branding y límite de IA), `getBusinessProfile` y la
página de turno (slug, marca de páginas gestionadas, identidad de envío).
Ahora hay un único getter cacheado con las 25 columnas que el CRM usa de su
tenant (queda fuera `domain_records`, jsonb que sólo mira el centro de
control) y todo lo demás deriva de él. `/settings` 17→15, `/sources` 15→13,
`/leads/[id]` 21→20, `/sources/[slug]` 15→14, `/newsletters` 12→11,
`/properties/[id]` 7→6.

### Cierres de cascada

- `/leads/new`: la fila del agente vinculado al login iba en un `await` suelto
  al final. 4 olas → 2.
- `/newsletters/nueva`: el plan se esperaba antes de lanzar las lecturas. 3 → 2.
- `/newsletters`: el conteo de pasos de la secuencia se resuelve por el TIPO de
  canal con un join anidado, así que ya no espera al id. 3 → 2.
- `/studio`: los diseños (globales) esperaban a las lecturas del tenant. 
- `/emails`: la lista de secuencias y el panel de cobertura por etiqueta pedían
  `email_sequence_steps` y `lead_sequence_runs` por separado. Dos getters
  cacheados por tenant y cada uno filtra en memoria. 18 → 16.

### Imágenes: lo que más pesaba para el navegador

Las fotos se guardaban en WebP pero **a resolución completa** (434 objetos en
producción, 440 kB de media, la mayor 2,4 MB) y todas las superficies las
descargaban enteras para pintarlas a 160 o 240 px.

- La ficha pública de propiedad, el catálogo del CRM y su detalle pasan a
  `next/image` con el `sizes` real de cada hueco. Medido en local sobre la
  ficha de Tenant Test: las miniaturas piden `w=384` y sirven 256×170 para un
  contenedor de 237 px, donde antes bajaban el original (797 kB la portada, 66
  y 146 kB las demás). Una ficha con seis fotos pasa de ~1,5 MB a ~250 kB.
- La subida recorta a 2560 px de lado máximo (`fit: inside`,
  `withoutEnlargement`), que es lo más grande que cualquiera de esas pantallas
  puede mostrar. Las fotos que ya están subidas no cambian; las nuevas pesan
  menos sin consumir cuota de Image Optimization.
- El logo del tenant en las páginas públicas también pasa por el optimizador:
  se pintaba a 36 px de alto descargando el PNG original.

### Bundle: recharts fuera de la primera pintura

Los cinco gráficos de `/analytics` y del centro de control traen el paquete de
cliente más grande del CRM (~110 kB gzip) y estaban en el bundle inicial, para
dibujos que van por debajo de los KPIs y las tablas. Ahora se cargan con
`next/dynamic` y `ssr: false`, con un skeleton de la misma altura que el
gráfico. Los números salen con el primer HTML y el dibujo entra encima sin
mover nada. Verificado en navegador.

### Seguridad de la base

Migración `20260919120000_sec_search_path_funciones_trigger.sql`, aplicada en
sandbox y producción: `set search_path = ''` en
`normalize_agent_languages`, `touch_newsletter_edition` y
`agent_api_base64url`. El aviso `function_search_path_mutable` desaparece en
los dos proyectos.

**Hallazgo que corrige el prompt de la fase 2:** ese prompt afirmaba que se
podía revocar el `execute` de `get_my_tenant_id()` e `is_super_admin()` a
`anon`/`authenticated` porque "las políticas se evalúan como el dueño". **Es
falso.** Se probó en sandbox: al revocarlo, `test:rls` pasó de 110/110 a **63
fallos**, con la lectura de cada tabla denegada. En Postgres las expresiones
de una política RLS se evalúan con los privilegios del rol que consulta, así
que ese `execute` es lo que sostiene toda la aislación por tenant. Los grants
se restauraron de inmediato y se verificó 110/110 otra vez. Queda escrito en
la migración para que nadie lo intente de nuevo.

Lo que filtran esas dos funciones por `/rpc/` es el tenant propio y si uno es
super_admin: justo lo que el propio usuario ya sabe de sí mismo. Cerrar el
endpoint sin perder RLS exigiría moverlas a un esquema no expuesto y recrear
todas las políticas que las nombran.

### Dos arreglos de verificación

- `docs/agent-api/openapi.json` y `src/lib/agent-api/openapi.generated.json`
  se fuerzan a LF en `.gitattributes`. En Windows git los entregaba con CRLF y
  su test de contrato fallaba **siempre**, dando un rojo permanente que tapaba
  cualquier fallo real.
- El mismo contrato se regeneró: sus ejemplos salen de datos vivos del tenant
  demo y el decay había movido la `quality_band` de dos leads. **Ese test es
  frágil por diseño** (compara byte a byte contra datos que cambian solos);
  conviene estabilizar los ejemplos como ya se hace con `token.expires_at`.

## Verificación

- `npm run lint` 0 errores (1 warning preexistente en `scripts/`),
  `npx tsc --noEmit` ✓, `npm run test:unit` 101 archivos / 1 112 tests ✓,
  `npm run check:agents` ✓, `npm run build` ✓.
- Sandbox: `test:rls` 110/110 ✓ (dos veces: antes y después de la migración),
  `test:scoring` 88/88 ✓, `test:agent-api` 68/68 ✓ tras el arreglo de LF.
  Advisors: performance sólo `unused_index`; seguridad sin
  `function_search_path_mutable`.
- Producción: migración aplicada tras el gate; las seis funciones nuevas o
  recreadas tienen `search_path` fijo; advisors iguales a sandbox.
- Navegador (dev server local): ficha pública de propiedad con la galería
  optimizada, `/properties` y `/properties/[id]` del CRM, `/analytics` con los
  gráficos diferidos, y el **drawer móvil** con el shell nuevo (logo, plan,
  cerrar sesión) — que era el pendiente visual de la fase 2.

## Lo que NO se pudo verificar en local

El DNS de la máquina de desarrollo resuelve el host de Supabase a una IP
privada (`198.18.1.63`), así que `next/image` rechaza esas URLs con 400 en
local. Se verificó activando `images.dangerouslyAllowLocalIP` de forma
temporal y **se revirtió**; en producción el host resuelve a IP pública y no
hace falta. Es también la explicación del 400 del logo del tenant que aparecía
en la consola del dev server durante la fase 2.

## Pendiente

Lo que queda son decisiones y ajustes de panel, no código. Está en la lista
que se entregó a Dylan al cerrar la fase 3, y lo esencial es:

1. **Desplegar.** Mergear esta rama es lo que mueve la función de `iad1` a
   `sfo1` (la región ya está marcada en el panel, a falta de un deploy) y
   pone en producción todo lo anterior. Después, repetir la tabla de TTFB de
   la fase 2 con el mismo método.
2. **Vercel: retención de deployments e Ignored Build Step** (pasos exactos en
   la sección de la fase 2). Es lo único que baja los 26,88 GB de Functions
   Storage sobre un límite de 10 GB.
3. **Vercel Pro** por cumplimiento: el plan Hobby es sólo para uso no
   comercial y el CRM cobra suscripciones.
4. **Supabase Pro** no acelera nada hoy (19 MB, consultas de milisegundos); se
   compra por backups diarios y por no pausarse, no por velocidad.
5. **Mudanza a `iad1` + `us-east-1`** cuando haya ventana: es la única palanca
   grande que queda para España.
6. Opcionales con aprobación: Cache Components (2–4 días, gran ganancia para
   España) y el Custom Access Token Hook (quita la ola 1; decidir después de
   la región).
7. Estabilizar los ejemplos del contrato OpenAPI para que su test deje de
   depender del decay.
