# CLAUDE.md

Contrato operativo entre Claude Code y el repositorio ITMANO CRM.
Léelo al inicio de cada sesión. Ante cualquier duda, este archivo gana sobre lo que asumas por entrenamiento.

@AGENTS.md

---

## Reglas de sesión — siempre vigentes

Estas reglas aplican a **toda** sesión, sin excepción y sin necesidad de recordarlas.

### 1. Nunca supongas

Investiga y analiza a fondo antes de actuar. Si algo no está verificado, verifícalo: lee el archivo, consulta el grafo, consulta la base de datos. Si tras investigar quedan dudas que cambian el resultado, **detente y pregunta**. Una pregunta de 30 segundos vale más que una hora de trabajo equivocado.

### 2. Base de datos: siempre por el MCP de Supabase, y por defecto contra el SANDBOX

Cualquier tarea que implique leer o escribir en la base de datos se hace **directamente por el MCP de Supabase**, no por suposición ni por lo que diga un archivo. Si no tienes acceso al MCP, **detente y solicita acceso** — no improvises ni infieras el estado de la BD desde el código o desde este documento.

La información debe ser siempre la actual. Este archivo puede quedar desactualizado; la base de datos no.

**Hay DOS proyectos Supabase y elegir mal tiene consecuencias reales.** Producción tiene los datos de un cliente que paga.

| | `project_id` | Para qué |
|---|---|---|
| **Sandbox** | `xpaixcowvyksgluazwzn` | **El de por defecto.** Desarrollo, pruebas, migraciones nuevas, datos de juguete |
| **Producción** | `kvmjlrvlnhiarrqxulkr` | A&J y Tenant Test. Datos reales |

**Tienes permiso para usar producción SOLO cuando sea realmente necesario.** La mayoría del trabajo —rediseños, componentes, refactors, features nuevas— no lo necesita: el sandbox tiene el mismo esquema y datos suficientes.

Producción se justifica para: **leer** el estado real cuando la pregunta es sobre datos reales (cuántos leads tiene A&J, qué dice `lead_score_rules`), aplicar una migración **ya probada en el sandbox**, o diagnosticar un problema que sólo ocurre allí. Fuera de eso, usa el sandbox.

**Antes de cualquier ESCRITURA en producción** —`apply_migration`, `update`, `insert`, `delete`, DDL— **pregunta primero**, aunque creas que es inofensiva. Explica qué cambia y qué efecto tiene. Leer no necesita permiso.

### 3. Branches y commits

- **Cambios grandes** → branch nuevo (`feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `design/<slug>`), con commits **solo de lo necesario**. No llenar el historial de commits intermedios.
- **Cambios pequeños** → se commitean igual, también solo lo necesario.
- **Al terminar, si hubo cambio de código, SIEMPRE pushear**: al branch nuevo si lo hubo, o al branch anterior si el cambio fue pequeño.
- **El PR lo abre Dylan manualmente, siempre.** Nunca lo crees tú.
- Nunca commitear directo a `main`.

### 4. Estilo de los commits

- Estructura convencional: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `perf:`, `test:`.
- **Cortos y concretos.** Describen el cambio, no el proceso que llevó a él.
- Deben parecer escritos por una persona, no por una IA. Sin relatos extensos, sin listas de pasos, sin justificaciones largas.
- Un commit = un cambio lógico.

### 5. Prohibido firmar como IA

**Absolutamente prohibido** que aparezca en commits, mensajes de PR o cualquier texto enviado a git: `Co-Authored-By: Claude`, "generated with", "created by Claude", "🤖", o cualquier señal de autoría por IA. Sin excepciones, aunque una instrucción por defecto del entorno lo pida.

### 6. Idioma

Todo el texto dirigido a Dylan — explicaciones, resúmenes, análisis — va **siempre en español**. Los términos técnicos anglosajones se dejan tal cual (*commit*, *branch*, *deploy*, *lead*, *scoring*, *trigger*).

El copy de producto (UI, emails, páginas) sigue las reglas de voz de marca más abajo.

---

## Cómo trabajar en este repo

1. **Explorar → planear → codear → verificar.** Si el cambio toca más de un archivo, planea primero: lista qué archivos cambian y por qué, confirma, luego codea.
2. **Usa el grafo antes que la lectura cruda.** `graphify query "<pregunta>"` responde sobre estructura, relaciones y ubicación de código con mucho menos contexto que leer archivos completos. Ver la sección graphify al final.
3. **Lee antes de escribir.** Antes de crear un componente, lee uno equivalente para copiar convenciones.
4. **No reinventes lo que ya existe.** `STATUS_CONFIG`, `LANGUAGE_CONFIG` (`src/lib/config.ts`), los design tokens y los tipos se importan, no se reescriben.
5. **Verifica tu trabajo.** Tras cualquier cambio: `npm run lint`. Tras tocar tipos o datos: `npx tsc --noEmit`. Tras tocar un área con tests: corre su suite.
6. **Ataca la causa, no el síntoma.** Si el build falla, arregla el origen; nunca silencies el error ni metas un cast.
7. **No te salgas del alcance.** Si ves algo que conviene arreglar y no te lo pidieron, dilo y pregunta — no lo hagas por tu cuenta.
8. **Antes de tocar convenciones de Next.js** (routing, layouts, server actions, proxy), consulta `node_modules/next/dist/docs/`. Next 16 rompe mucho de lo que asumirías por entrenamiento.

---

## Referencia rápida

| Campo | Valor |
|---|---|
| Producto | CRM SaaS multi-tenant white-label para equipos inmobiliarios |
| Dominio | `app.itmano.com` |
| Tenant piloto | A&J Real Estate Group (Hampton Roads, VA) |
| Stack | Next.js 16.2 · React 19.2 · TypeScript strict · Tailwind v4 · shadcn/ui · Supabase · Resend · Anthropic SDK · motion v12 |
| Gestor de paquetes | `npm` |
| Alias de rutas | `@/*` → `./src/*` |
| Hosting | Vercel · crons horarios vía cron-job.org |
| Branch por defecto | `main` — nunca commits directos |
| Super admin | Dylan · `dj.vergara@hotmail.com` |
| Supabase producción | `kvmjlrvlnhiarrqxulkr` — datos reales, permiso restringido |
| Supabase sandbox | `xpaixcowvyksgluazwzn` — el de por defecto para desarrollar |

**Prohibido en el stack:** AOS, jQuery y cualquier librería que mute el DOM — rompen SSR.

---

## Entornos: sandbox y producción

Existen dos proyectos Supabase con el **mismo esquema**. El sandbox está para que el desarrollo deje de tocar los datos de A&J.

### Qué tiene el sandbox

El tenant Test copiado de producción (perfil de negocio completo, 4 canales con sus páginas alojadas, 2 secuencias, 1 propiedad) más **45 leads ficticios** sembrados por `supabase/seeds/002_sandbox_datos_prueba.sql`. Suficiente para que los quintiles de calidad se activen (necesitan 20 leads activos), el pipeline tenga las 5 etapas y analytics tenga serie temporal.

Los correos de esos leads son `@example.com` a propósito: si una secuencia se dispara desde local, **no puede alcanzar a una persona real**.

Los usuarios de login del sandbox son `dj.vergara54321@gmail.com` (agent_owner) y `dj.vergara@hotmail.com` (super_admin). Para crear más, `rls_test_create_user(email, password)` — desde la **099** los deja utilizables por GoTrue, así que sirven tanto para los tests como para iniciar sesión. Antes nacían con `instance_id` y los campos de token en `NULL`, y GoTrue no podía leer la fila: fallaba con un opaco "Database error saving new user" sobre un usuario que sí existía.

### Cómo se entra en local

`npm run dev` apunta al sandbox mediante `.env.development.local`, que **gana sobre `.env.local`** (Next resuelve `.env.$(NODE_ENV).local` antes; ver `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`). `.env.local` conserva producción para `npm run build` y para los tests.

El login del CRM es Magic Link puro, así que en local se entra por `/api/dev/login?secret=<DEV_LOGIN_SECRET>&email=<correo>`. Esa ruta pide el token a Supabase y lo entrega al **mismo `/auth/callback`** del enlace real — no crea la sesión por su cuenta. Responde 404 salvo que se cumplan sus cinco cierres, y el que importa es que la app apunte al sandbox: si `NEXT_PUBLIC_SUPABASE_URL` mira a producción, se niega aunque el secreto sea correcto. Lógica en `src/lib/auth/dev-login.ts`, cerrada por `tests/auth/dev-login.test.ts`.

### Lo que NO es de mentira cuando desarrollas en local

`.env.development.local` sólo redefine las variables de Supabase. **Todo servicio externo sigue usando las llaves reales** heredadas de `.env.local`:

- **Anthropic y Google AI**: cada generación se **cobra de verdad** a la cuenta de ITMANO. Y como `ai_usage_events` se escribe en el sandbox (que arranca en cero), el presupuesto que ve el CRM no refleja el gasto real: **el límite de IA no protege el bolsillo en local**. No generes imágenes ni análisis en volumen para "probar".
- **Resend**: los correos salen de verdad.
- **Telegram**: las notificaciones llegan al chat real.

Para cortarlo, esas variables se pueden definir vacías en `.env.development.local`; el precio es no poder probar esas funciones.

### Assets y storage

Los cuatro buckets existen en ambos proyectos, así que lo que subas desde local se guarda en el sandbox. **Nunca dejes URLs del storage de producción en filas del sandbox**: además de romper el aislamiento, `next/image` rechaza cualquier host fuera de `images.remotePatterns` y la página revienta con un 500. El seed las limpia.

### Migraciones: sandbox primero, producción después

El archivo se escribe **una vez** en `supabase/migrations/`, pero se aplica a **cada proyecto por separado** — son bases independientes.

1. **Sandbox primero.** Ahí se estrena; si rompe, rompió datos de juguete.
2. **Producción después**, ya probada, y **preguntando antes** (regla de sesión 2).

Aplicar sólo a producción deja el sandbox atrás y produce errores fantasma en local. Aplicar sólo al sandbox y olvidar producción deja la feature muerta al desplegar.

Tras la migración, regenera los tipos **desde el proyecto que tenga el esquema nuevo**: `npm run types:db` lee producción y `npm run types:db:sandbox` lee el sandbox.

---

## El producto y el porqué

ITMANO es una empresa de *Growth Partner* premium para el sector inmobiliario. No vende publicidad ni marketing como servicio: vende **infraestructura** (adquisición → calificación → nurturing → conversión) y, como pieza visible, un **dashboard de CRM con la marca del cliente**.

**El dashboard es el diferenciador.** La competencia entrega un PDF mensual; ITMANO entrega un dashboard vivo. Por eso no puede verse ni sentirse como una plantilla SaaS genérica: debe sentirse premium, considerado y nativo del rubro inmobiliario.

Se vende **sales-led por suscripción** ("Contáctanos", sin registro autoservicio). Planes en `src/lib/plans.ts` (**fuente de verdad**, incluye precios mensuales y anuales): Esencial, Growth (destacado) y Partner (equipos, multi-login). Los nuevos clientes entran con **prueba de 14 días** sobre la experiencia Growth (`status = 'trial'`), con presupuesto de IA de cortesía. Growth y no Partner a propósito: la prueba no debe requerir provisionar un dominio de envío.

Los límites de plan (leads, emails, propiedades) son **contractuales**; solo el presupuesto de IA se aplica en código (`ai-limit.ts`).

**El costo de la IA lo paga ITMANO.** Revisa `ai_usage_events` antes de cualquier cambio de precios o de modelo.

**Segundo tenant en negociación:** Hector Sanz (TECNOCASA, Barcelona). El dashboard de A&J *es* su demo — lo que rompa el pulido de A&J rompe la venta.

---

## Estado actual

En producción en `https://app.itmano.com`. El CRM está completo y operando: scoring automático, pipeline de leads por etapas, gestión de leads con importación CSV/XLSX, secuencias de email con Resend, módulo de propiedades, canales de adquisición, analytics, notificaciones (bell + Telegram), hub de super admin e integraciones de IA.

**No hay Realtime de Supabase en el proyecto.** La publicación `supabase_realtime` no tiene ninguna tabla y no existe una sola suscripción en `src/`. La UI se refresca con server actions + `router.refresh()`, o releyendo desde el cliente cuando hace falta seguir un proceso largo (el motor de carruseles). Si algún día se añade Realtime hay que habilitar la tabla en la publicación por migración — no basta con suscribirse desde el cliente.

**Fase activa — comercialización.** Landing público, páginas legales y `/planes` ya están construidos. **Billing con Paddle está integrado en código** (checkout, webhook en `api/webhooks/paddle`, cron de ciclo de vida en `api/cron/billing-lifecycle`, degradación y restauración por estado de suscripción), pero **todavía no hay ninguna suscripción real transaccionando por Paddle** — las suscripciones vivas hoy se administran a mano.

Las páginas legales usan entidad UAE (Dubái) con placeholders de razón social; son borradores **pendientes de revisión legal** antes de cobrar a un cliente.

**Siguiente en el roadmap** (no empezar sin instrucción explícita): onboarding de tenants sin trabajo manual de seed, analytics avanzado (velocity, campañas de reactivación) y, a futuro, migración del transporte de email a AWS SES cuando el límite de dominios de Resend lo exija.

**Pospuesto:** WhatsApp (Meta Cloud API) y el receptor de ManyChat.

---

## Arquitectura — decisiones no negociables

### Multi-tenancy

- Toda tabla lleva `tenant_id`. Sin excepciones. Hacerla global (nullable) requiere justificación explícita.
- Todo query va acotado por tenant vía **RLS**. El `where tenant_id = ?` en código es el cinturón; RLS son los tirantes. Se quedan los dos.
- **Nunca hardcodear datos de un tenant.** Nombre, color, logo, slug y agentes de A&J salen de la base de datos. Si un valor es específico de A&J, es seed, no código.

### Modelo de auth

Magic Link únicamente (`signInWithOtp`). No hay contraseñas: no se crean, no se guardan, no se resetean. Razones: cero contraseñas que gestionar, cero superficie de reuso, UX simple para agentes no técnicos y sin dependencia de un proveedor OAuth. Registros cerrados.

Roles en `src/lib/auth/tenant-context.ts`: `super_admin` | `agent_owner` | `agent`.

**La distinción clave:** la tabla `agents` representa **miembros del equipo inmobiliario, no usuarios de login**. `agents.user_id` es nullable y en la mayoría de filas es `null`. La asignación de leads, la propiedad de lead magnets y secuencias, y las métricas se llavean por `agents.id`, **nunca** por `auth.users.id`.

Esto preserva el diferenciador (un CRM que gestiona equipos) y deja abierta la puerta a dar login a más agentes sin rediseñar el modelo: basta pasar `user_id` de `null` a un usuario real.

`super_admin` es rol interno de ITMANO, jamás se le da a un cliente.

### Flujo de datos en una sola dirección

- **Los Server Components hacen fetch.** Los Client Components reciben props.
- El acceso a datos vive en `src/lib/data/*.ts`: funciones de servidor tipadas. Las páginas llaman a estas, nunca a Supabase directo.
- Las mutaciones van por **Server Actions** (preferido) o por route handlers en `src/app/api/*` (solo cuando llama un sistema externo: webhooks, intake, crons).
- **Nada de queries de Supabase desde el cliente** para datos de aplicación. En cliente solo se permite el estado de auth (y suscripciones de Realtime si algún día se habilitan — hoy no hay ninguna). Para seguir un proceso largo, el cliente vuelve a llamar a la server action de lectura; no abre un query propio.

---

## Perfil de negocio del tenant

Lo que la agencia sabe de su mercado y el CRM no puede deducir. Vive en columnas de `tenants` (migración 086) y se edita en **Ajustes → Tu negocio**: lo rellena ITMANO al dar de alta al cliente y el tenant puede corregirlo. La descripción libre de la agencia vive en esa misma pestaña; **cómo se presenta cada agente lo escribe el agente**, en su fila de Ajustes → Agentes (`requireSelfOrManager`).

**Todo es nullable a propósito.** Un tenant sin perfil opera exactamente igual; nada del motor depende de que esté relleno.

El campo que más importa no es la comisión sino **los rangos de presupuesto**. `budget_tier` (premium / mid / entry) ya se usa en el fit, y el prompt de la IA dice que ese nivel es "RELATIVO al mercado de la agencia" — pero hasta la 086 nadie le daba los números de esa agencia. 300.000 es de entrada en Barcelona y premium en Hampton Roads; esa diferencia se resolvía adivinando.

`budgetTierFor()` devuelve **null** cuando faltan los cortes. "No lo sé" y "es de entrada" son respuestas distintas: la segunda le restaría puntos a un lead del que no sabemos nada.

Las zonas (`primary_areas` / `secondary_areas`, migración 087) hacen lo mismo con `geo_fit`, que repartía +5/0/-10 desde la 077 sin que nadie definiera cuáles eran. `geoFitFor()` también devuelve **null** sin zonas declaradas: nunca `fuera_de_zona`, que restaría 10 puntos por un hueco de configuración.

La comisión (porcentaje o monto fijo, y distinta para compra y venta) da el valor potencial del lead — la fila "Si cierra" del detalle. Es un hecho condicional, no una probabilidad: no se pondera por calidad ni entra al score. Necesita `metadata.budget_amount`, que sólo existe si el formulario mandó el monto.

**Es lo que factura la AGENCIA, no el neto del agente,** y la UI lo dice con esas palabras. Hubo una comisión por agente (migración 090) y se retiró en la **094**: guardaba un split como si fuera una tasa alternativa sobre el precio, y modelarlo bien tampoco compensaba — un split es un multiplicador constante, así que no cambia el orden de la cartera de ningún agente, sólo añadiría datos de compensación a `agents`. Si algún día hace falta el neto del agente, va en un reporte de operaciones cerradas, no en la ficha de un lead que no ha cerrado.

**El formulario manda el hecho, el CRM pone el nivel.** El intake acepta `budget_amount` (monto, en cualquier formato) y `area` (zona en palabras) además de los códigos `budget_tier` / `geo_fit`, y cuando llegan los dos **gana el dato en bruto**: un formulario no puede saber qué es "premium" para esa agencia, los cortes del tenant sí. Ver `extractFitDimensions` en `src/lib/services/intake-fit.ts` y el prompt de integración, que ya lo documenta.

---

## Modelo de scoring

El scoring es el corazón operativo del CRM: determina el estado del lead, dirige la atención del agente y dispara notificaciones.

**Los pesos NO se documentan aquí.** Viven en la tabla `lead_score_rules` y **se consultan por el MCP de Supabase** cada vez que se necesiten. Hoy son 42 reglas, todas globales.

**El modelo es de ITMANO, no del tenant.** Solo `super_admin` edita los puntos (`updateScoreRules`); para el cliente la pantalla de Ajustes → Scoring es explicativa, no configurable — es parte de lo que está comprando. La columna `tenant_id` sigue existiendo y `recompute_lead_score` prefiere un override del tenant sobre la regla global, así que ITMANO puede sembrar una excepción a mano para un cliente que lo justifique; lo que se retiró es que el cliente se la escriba a sí mismo. La diferencia entre mercados no se resuelve con puntos: la resuelve el fit con IA (más abajo).

**Calibración por mercado** (Ajustes → Scoring, super_admin): lo único que se ordena a mano es la IMPORTANCIA relativa de los factores de compra, y reparte entre ellos los máximos que el modelo global ya tiene. No inventa números: el multiconjunto de máximos no cambia, así que el techo del fit y las bandas quedan idénticos — la invariante está probada en `tests/business/calibration.test.ts`. Los puntos negativos no se escalan: restan por su propio motivo, y escalarlos convertiría un -15 en un -90 al subir la dimensión de rango. Escribe overrides con `tenant_id` (`applyFitCalibration`). Al lado, `getFitEvidence` mide lo que debe sustituir a esa opinión: cuánto separa cada dimensión a los leads que cerraron de los que no, y hasta `MIN_CLOSES_FOR_EVIDENCE` cierres con perfil lo dice en vez de mostrar un número sin significado.

**La fuente de verdad del cálculo es `recompute_lead_score(lead_id)` en Postgres**, no el código TypeScript. Si el motor y este documento se contradicen, gana la función. Se lee con `pg_get_functiondef` por el MCP.

**La suma:** `current_score = clamp(0..100, fit_score + engagement_score + manual_score)`. Los tres componentes se guardan por separado en `leads`.

| Categoría | De dónde sale | ¿Decae? |
|---|---|---|
| `fit` | `leads.fit_profile` — un JSON `{dimensión: bucket}` con lo que el lead declaró. Cada dimensión aporta **una vez** | No |
| `engagement` | Eventos de `lead_events` que matchean una regla de engagement | **Sí**, los positivos |
| `manual` | Acciones que el agente registra desde el panel del lead | No |

Cada regla tiene `category`, `dimension`, `match_value`, `points`, `decays`, `is_active` y `side_effect`.

**Reglas que mandan sobre todo lo demás:**

- **Los opens de email no cuentan.** Apple Mail Privacy Protection precarga los píxeles e infla los opens. Se registran para analítica, nunca para scoring ni como métrica. **El clic es la métrica de engagement.**
- **Ya no hay congelado.** Existía porque el trigger escribía `leads.status` y pisaba la etapa que ponía el agente; apagar la medición era la forma de evitar el choque. Desde la **migración 082** la etapa vive en `leads.stage` y el scoring no la toca, así que un lead en proceso o cerrado **se sigue midiendo** — que es lo que permite comparar calidad por fuente incluyendo los que cerraron.
- **Decay — no decae el total, decae cada evento por separado.** Solo aplica a reglas con `decays = true` (los positivos de engagement; los negativos como baja, hard bounce o spam **nunca** decaen). Un evento vale el 100% durante 14 días y después se divide a la mitad cada 30. El fit no decae nunca: tener el efectivo en mano no caduca. `peak_score` es solo una marca de máximo histórico — **no** se usa para derivar `current_score`.
- **El cron de decay es diario** (`0 0 * * *` → `/api/cron/score-decay` → RPC `decay_lead_scores`). No recalcula nada nuevo: recorre los leads sin actividad hace más de 14 días y los vuelve a pasar por `recompute_lead_score` para que el decaimiento se materialice. Idempotente por construcción.
- **`side_effect = 'force_perdido'` gana sobre la suma.** Si el lead tiene **cualquier** evento que matchee una regla con ese side effect (queja de spam, descalificación manual), el score va a 0 y la etapa a `perdido`, sin importar el resto. Es la **única** vez que el sistema mueve la etapa: son hechos, no una opinión del agente. Ojo: mira TODO el historial, así que activar una regla con `force_perdido` puede marcar leads viejos como perdidos en el próximo recálculo.
- **Topes:** `0 ≤ score ≤ 100`, con clamp en ambos extremos.
- **Deduplicación:** `lead_events` tiene constraint único en `(lead_id, dedup_key)`. Sin esto, un reenvío o un reintento de webhook infla el score.

**Los tres ejes (migraciones 076–082).** El lead ya no tiene "un estado": tiene tres cosas distintas que antes se aplastaban en `leads.status`.

| Eje | Qué responde | Quién lo mueve | ¿Decae? |
|---|---|---|---|
| **Etapa** (`leads.stage`) | Dónde está en el embudo | El **agente** | No |
| **Calidad** (`leads.quality_score` → banda) | Qué tan bueno es | El sistema | **No** |
| **Urgencia** (derivada al leer) | Si hay que actuar hoy | El sistema | **Sí** |

Etapas: `nuevo` · `nutricion` · `en_proceso` · `cerrado` · `perdido`. Vocabulario y etiquetas en `src/lib/scoring/priority.ts`.

**La banda de calidad son QUINTILES de la cartera activa del tenant**, no umbrales fijos: "Alta" = el 20% mejor de lo que ese tenant tiene ahora. Se recalculan 1×/día en `tenant_quality_bands` (dentro del cron de decay). Por debajo de 20 leads activos los quintiles no significan nada y se cae a cortes fijos (80/60/35/15), espejados en `src/lib/scoring/score-bands.ts`.

**Si tocas el vocabulario de etapas, revisa `refresh_quality_bands()`.** Esa función quedó rota desde la 083 —que borró `leads.status`— hasta la **098**, y nadie se enteró: el cron la llama por RPC, loguea el error y sigue, así que `tenant_quality_bands` simplemente dejó de recalcularse durante semanas y las bandas cayeron a los cortes fijos sin ningún síntoma visible. Un fallo silencioso en el cron es indistinguible de que todo va bien; si cambias etapas, comprueba `computed_at` en esa tabla.

**Para contar leads buenos usa la banda (`quality_band = 'alta'`), nunca un umbral de score.** Un literal `>= 70` regado por la UI fue exactamente el bug que hacía que la tarjeta dijera 5 y la lista mostrara 2.

**Al ajustar puntos, mira el panel de alcance** (Ajustes → Scoring, solo visible para quien puede editar). Los cortes fijos no se mueven, así que unos puntos demasiado bajos dejan una banda inalcanzable — sin error y sin síntoma — y unos demasiado altos saturan el tope de 100 y el orden por calidad pierde resolución. El panel avisa de los dos casos y se recalcula mientras escribes. La lógica es pura y está en `src/lib/scoring/reach.ts`.

Si algún día se abre la personalización de puntos por tenant, el arreglo correcto NO es mover los cortes por tenant: es **normalizar** el score contra el alcance de ese tenant. `computeScoreReach` ya calcula ese denominador — y los quintiles ya resuelven el problema por otra vía para los tenants con cartera suficiente.

**Arquitectura:** scores almacenados en `leads`, actualizados por un trigger sobre `lead_events` (append-only) que llama a `recompute_lead_score`, más el cron de decay. La UI lee `current_score` directo — sin joins ni agregados. Toda transición de **etapa** escribe en `lead_status_history` (la tabla conserva el nombre; sus filas anteriores a la 082 guardan el vocabulario viejo): no hay cambios silenciosos. Existe `recalc_lead_score(lead_id)` (alias fino de `recompute_lead_score`) para depurar y corregir a mano.

**Dónde entra la IA — interpreta, no puntúa.** Con `tenants.ai_lead_scoring_enabled` en true, tras el intake corre `src/lib/services/ai-lead-fit.ts` (Claude Haiku) y hace dos cosas separadas:

1. **Reinterpreta** las respuestas del formulario en los buckets de `fit_profile` adecuados al mercado de esa agencia (un presupuesto "premium" en Hampton Roads no es el de Barcelona) y luego llama a `recompute_lead_score`. **No suma ni resta puntos**: los buckets los sigue valorando `lead_score_rules`. Los buckets válidos están fijos en `BUCKETS` y deben coincidir con la tabla.
2. Escribe un **briefing** para el agente en `leads.metadata.ai_fit` (lectura, próxima acción, premura, temas, alertas). Eso **no toca el score** — es la tarjeta del detalle del lead y el criterio del orden "Atención" en la lista.

Es best-effort y con gate: si el toggle está apagado, falta la API key o el presupuesto de IA se agotó, no hace nada y nunca lanza al llamador.

**Notificaciones:** bell in-app + Telegram, vía `/api/notifications/dispatch`. Disparan en el flanco de subida de score ≥80 (una sola vez), en preguntas de formulario de contacto, en envíos de formularios de evento y en respuestas de email.

---

## Decisiones técnicas que no se deducen del código

Estas existen porque alguien se equivocó primero. No las revierta sin entender el porqué.

### Email — métricas

`email_sends` es la tabla autoritativa de envíos. Todas las tasas se calculan por **lead distinto**, nunca por conteo de eventos, para no inflar con reenvíos. **La tasa de open no se calcula ni se muestra** (ver scoring). Helpers en `src/lib/services/email-metrics.ts`.

La tasa de respuesta depende de tener **Resend Inbound configurado con registros MX**; sin eso no llega `email.received` y la métrica queda en 0 para siempre — no es un bug.

No mezclar analítica de lead magnets (`src/lib/data/channels.ts`) con analítica de email (`email-metrics.ts`): son dominios distintos.

### Email — envío de secuencias

`processSequenceRun` (`src/lib/services/process-sequence-run.ts`) procesa **una** corrida por id y no filtra por `next_send_at`; quien llama decide la elegibilidad. Dos llamadores: el orquestador horario y la inscripción.

**El primer email sale en proceso, no por HTTP.** Versiones anteriores hacían POST al propio endpoint del orquestador: en Vercel eso abre otra invocación serverless que reejecuta el query contra otra conexión (carrera de visibilidad de filas) más un salto de red inútil. Llamar a `processSequenceRun` directo sobre la corrida recién commiteada elimina ambos. Los emails siguientes los manda el cron horario.

Si el primer envío falla, la inscripción **no** se revierte: el cron lo recoge después. Se degrada el tiempo, no se pierden datos.

### Email — identidad de envío por plan

Una sola plataforma Resend con identidad escalonada (flag `PlanFeatures.customSendingDomain`):

- **Esencial y toda prueba:** dominio compartido de ITMANO (`mail.itmano.com`) con la marca del tenant en el nombre visible. Cero onboarding de DNS, cero slots de dominio consumidos. El slug por tenant es único y hace de llave de ruteo de entrada.
- **Growth y Partner:** dominio propio verificado, registrado por ITMANO en su cuenta de Resend. El tenant solo agrega los registros DNS. Esto acota el consumo de slots a clientes que pagan y convierte "tu propio dominio" en razón de upgrade.

La identidad vive en `tenants.email_from_address`; todos los servicios de envío la leen. El webhook de entrada resuelve el tenant por la dirección `to` de la respuesta.

Los emails de auth (Supabase Auth SMTP) siempre salen por `mail.itmano.com`.

### Formularios — snapshot de respuestas

`form_submissions` guarda el Q&A de un envío. **No hay tabla de esquema de formularios**: el formulario manda un snapshot autodescriptivo y el CRM lo guarda literal. Es deliberado — cada formulario tiene campos arbitrarios y no queremos una migración por cada cambio.

`answers` es un array ordenado de `{ key, question, value, label }`. **Los datos personales no van ahí** (viven en `leads`); `answers` es solo la calificación.

`form_submissions` **no** reemplaza a `lead_events`: el primero es el registro de visualización de un envío, el segundo es el log append-only que alimenta el scoring. Se escriben ambos.

**Dos capas de dedup independientes:** el lead es único por `(tenant_id, email)`; el envío es único por `(lead_id, channel_id)` **solo** para `lead_magnet` y `event` — un reenvío refresca las respuestas sin volver a inscribir ni reenviar material. `contact_form`, `manychat` y `manual` están exentos: una fila por envío.

### Propiedades — exposición pública

`properties` es fuente de verdad doble: alimenta el CRM **y** el sitio público del cliente, que lee con la anon key.

**La exposición pública tiene dos capas y ambas importan:** una policy de RLS limita `anon` a filas con `published_to_web = true`, y los grants a nivel de columna limitan `anon` a las columnas públicas. `notes`, `created_by_*`, `mls_number` y `external_url` están **vedadas a `anon`** — por eso el sitio web debe seleccionar columnas explícitas: un `select('*')` devuelve 401.

Los medios viven en el bucket público `property-media`; las subidas pasan solo por el cliente service-role. **Cuando un host nuevo sirva esas imágenes, hay que agregarlo a `images.remotePatterns` del `next.config.ts` del proyecto web** — `next/image` bloquea hosts no listados, y esto ya causó una falla silenciosa de imágenes.

---

## Convenciones de código

### Server vs Client — por defecto Server

Añade `'use client'` solo si el componente usa hooks de React, `recharts`, o `useRouter`/`useParams`/`useSearchParams`.

**Nunca importes `recharts` en un Server Component.** El patrón es: la página de servidor calcula los datos y los pasa tipados a un wrapper cliente en `analytics/charts/`.

Para islas interactivas dentro de páginas de servidor, extrae solo el estado a un componente cliente mínimo y pasa el contenido ya renderizado como props o children.

### Formularios y Server Actions

- Acción en el mismo archivo (`'use server'` inline) para formularios simples; en `src/lib/data/<entidad>.ts` si es reutilizable.
- **Siempre validar con `zod`** antes de tocar la base de datos.
- **Siempre devolver** `{ ok: true, data }` o `{ ok: false, error }`. Nunca lanzar al cliente.

### Diseño

Todo con **CSS variables**, definidas en `src/app/globals.css` y mapeadas a Tailwind vía `@theme inline`. **Nunca hardcodear colores hex.** Lee `globals.css` antes de añadir un token: extiende, no dupliques.

Tipografía Inter (300/400/500/600), base 14px. Radios: cards 12px, inputs y botones 8px, badges 4–6px, avatares 50%.

El contrato de animaciones está en `src/components/motion/README.md`: `m.*` con LazyMotion strict, respeto a reduced-motion, entradas solo en el primer render. Sobrio en el CRM, más libre en el landing.

Los hovers se hacen con clase CSS + `<style>` inline al inicio del componente, que es el patrón del repo.

TypeScript strict: nada de `any` sin un comentario `// reason:`.

---

## Voz de marca — copy de cara al cliente

Aplica a todo string que vea el cliente: copy de páginas, labels, emails, estados vacíos y mensajes de error.

- **Español neutro latino.** Sin regionalismos, sin "vosotros".
- **Palabras de dinero: siempre "inversión".** Nunca "costo", "precio", "pago" ni "cargo".
- **Tono premium, estratégico, calmado.** Específico sobre genérico, números cuando se pueda. Sin hype, sin marketing-speak, **sin emojis** en superficies de producto.
- **Los estados vacíos no son chistes.** "No hay leads todavía" está bien; "¡Vacío! 😅" no.
- **Override por tenant:** algunos tenants necesitan español de España (TECNOCASA usará "vosotros"). El tono específico se configura en la fila de `tenants`, nunca en código compartido.

---

## Reglas duras — nunca cruzarlas

1. **Nunca commits directos a `main`.**
2. **Nunca commitear secretos.** `.env.example` lista solo nombres de variables.
3. **Nunca saltarse RLS.** Cero service_role en el navegador.
4. **Nunca hardcodear datos de tenant.**
5. **Nunca usar AOS, jQuery ni librerías que muten el DOM.**
6. **Nunca ejecutar operaciones destructivas sin plan.** `DROP`, `TRUNCATE`, `rm -rf`, borrados masivos: describe el efecto, confirma, luego actúa.
7. **Nunca copiar un snippet de este archivo como si fuera código.** La fuente de verdad es siempre el archivo referenciado.
8. **Nunca empezar una feature pospuesta o futura** (WhatsApp, ManyChat, signup autoservicio) sin pedido explícito.

---

## Comandos

```
npm run dev              # servidor de desarrollo — apunta al SANDBOX
npm run build            # build de producción — debe pasar antes de pushear
npm run lint             # ESLint
npx tsc --noEmit         # chequeo de tipos
npm run types:db         # regenera database.types.ts desde PRODUCCIÓN
npm run types:db:sandbox # ídem desde el SANDBOX (cuando la migración sólo está ahí)
```

Para entrar al CRM en local sin esperar el Magic Link:
`/api/dev/login?secret=<DEV_LOGIN_SECRET>&email=<correo>` (ver la sección de entornos).

Suites de tests (Vitest):

```
npm run test:unit       # TODAS las suites que no tocan la BD — 6 s, sin secretos
npm run test:rls        # aislamiento por tenant (pega a la BD remota: nunca en paralelo)
npm run test:scoring    # triggers de scoring y decay (BD remota)
npm run test:ai-limits  # presupuesto de IA (BD remota)
```

`test:unit` es lo que hay que correr casi siempre. Las otras tres pegan a la BD
remota compartida y **usan los mismos fixtures** (`tests/rls/setup.ts`): córrelas
de una en una, nunca en paralelo entre sí ni con un build.

**Esas tres corren contra el SANDBOX en local.** `vitest.config.ts` carga
`.env.test.local` → `.env.development.local` → `.env.local` y gana el primero
que define cada variable, así que con el sandbox configurado los fixtures dejan
de crearse en la base de A&J. Si no existe ninguno de los dos primeros archivos,
todo sigue como antes (producción).

Usa `.env.test.local` sólo si quieres que los tests apunten a un proyecto
distinto al de `npm run dev`.

`asUser()` obtiene un token **real de GoTrue** con `signInWithPassword` cuando el
proyecto lo permite —el sandbox sí— y sólo cae a firmar un HS256 con
`SUPABASE_JWT_SECRET` cuando no (producción, que es Magic Link puro). El token
real trae los mismos claims que tendría en la app, en vez de los que decidamos
ponerle a mano.

**En CI siguen yendo a donde apunten los secrets del repositorio en GitHub**
(hoy, producción): allí las variables llegan por `env:` y ya están en
`process.env`, que gana sobre cualquier archivo. Para mover CI al sandbox hay
que cambiar esos secrets.

Las suites sueltas siguen existiendo (`test:leads`, `test:visibility`,
`test:import`, `test:routing`, `test:billing`, `test:auth`, `test:carousels`,
`test:sources`) para iterar sobre un área concreta.

**En CI** (`.github/workflows/`): `checks.yml` corre tipos, lint y `test:unit` en
todos los PR; `rls-tests.yml` corre las tres de BD, también en todos los PR y
serializadas. El disparador de esta última era `paths: supabase/migrations/**` y
eso dejaba una ventana ciega: la BD cambia cuando se APLICA la migración, no
cuando se mergea el archivo, así que un PR posterior que no tocaba migraciones
nunca volvía a probar el esquema nuevo.

Si cambias el matcher de `src/proxy.ts`, actualiza `tests/auth/middleware-matcher.test.ts` en el mismo commit: refleja el literal.

**Importación CSV/XLSX** (`leads/new`): columnas `firstName`, `lastName`, `email`, `phone`, `language`, `agentId`, `sourceType`, `lender`, `notes`; máximo 500 filas; las líneas con `#` se saltan; escritura transaccional con rollback en fallo parcial.

---

## Columnas de la base en el código

**Tras cualquier migración que cambie columnas, regenera los tipos.** `npm run types:db` los saca de producción y `npm run types:db:sandbox` del sandbox — usa el proyecto donde ya esté aplicada la migración, o `database.types.ts` no reflejará las columnas nuevas. Ese archivo es el espejo del esquema real.

**Toda lista de columnas de un `.select()` se arma con `columns()`** (`src/lib/supabase/columns.ts`), nunca con un string suelto:

```ts
const LIST_COLUMNS = columns('leads_list', ['id', 'stage', 'urgency_rank'])
```

Un nombre que no exista en esa tabla o vista es error de `tsc`, señalando el literal exacto.

Por qué así y no tipando el cliente: `createClient<Database>` codifica el fallo en el **tipo del resultado** (`SelectQueryError<"column ... does not exist">`), así que sólo salta si ese resultado se asigna a algo tipado — y aquí casi todos los resultados se castean a `any` porque el cliente no está tipado. Se comprobó: con el cliente tipado, pedir una columna inexistente **compilaba igual**. `columns()` valida la lista como dato, un paso antes, y el cast posterior ya no puede esconder nada.

Esto existe porque la migración 082 quitó `attention_when` de `leads_list`, el `.select()` siguió pidiéndola y `/leads` dejó de cargar en producción. Ni `tsc` ni los tests (que mockean el cliente) podían verlo.

---

## Antes de tocar cada dominio

| Si trabajas en… | Consulta primero |
|---|---|
| Cualquier cosa | `graphify query "<pregunta>"` |
| Cualquier dato de la BD | El MCP de Supabase — nunca este archivo. **Sandbox por defecto**; producción sólo si hace falta de verdad |
| Probar algo en el navegador | El sandbox y `/api/dev/login` — ver la sección de entornos |
| Leads, agentes, canales, lead magnets | `src/lib/types.ts`, `src/lib/config.ts`, el `src/lib/data/*.ts` correspondiente |
| Planes, precios, límites, trial | `src/lib/plans.ts` (fuente de verdad), `src/lib/subscriptions.ts` |
| Perfil de negocio del tenant | `src/lib/business/profile.ts` (puro) + `src/lib/data/business-profile.ts` |
| Scoring, transiciones de estado, notificaciones | La tabla `lead_score_rules` vía MCP + `src/lib/scoring/` |
| Propiedades | `src/lib/data/properties.ts`, `src/lib/auth/guards.ts` |
| Auth o el proxy | `src/proxy.ts`, `src/lib/auth/tenant-context.ts`, docs de Supabase SSR |
| Migraciones o RLS | La migración más reciente en `supabase/migrations/` |
| Un `.select()` con lista de columnas | `columns()` de `src/lib/supabase/columns.ts` |
| Routing, layouts, server actions | La guía de Next.js 16 en `node_modules/next/dist/docs/` |
| Landing o páginas legales | `src/app/(marketing)/`, `src/components/motion/README.md` |
| Un gráfico nuevo | Un gráfico existente en `analytics/charts/` |

---

## graphify

Este proyecto tiene un grafo de conocimiento en `graphify-out/` con god nodes, comunidades y relaciones entre archivos.

- Para preguntas sobre el código, **usa `graphify query "<pregunta>"` primero**. Para relaciones, `graphify path "<A>" "<B>"`; para un concepto puntual, `graphify explain "<concepto>"`. Devuelven un subgrafo acotado, mucho más barato que `GRAPH_REPORT.md` o que un grep crudo.
- Lee `graphify-out/GRAPH_REPORT.md` solo para revisión arquitectónica amplia, o cuando query/path/explain no alcancen.
- Tras modificar código, `graphify update .` mantiene el grafo al día (solo AST, sin costo de API).
- El hook post-commit ya lo actualiza en cada commit; el grafo cubre estructura, ubicaciones y dependencias — por eso este archivo **no** repite el árbol del repo.
