# ITMANO CRM — contrato operativo para agentes

Este archivo es la fuente compartida de reglas críticas para Claude Code, Codex
y cualquier otro agente que trabaje en el repositorio. Las explicaciones largas
viven en `docs/agents/`; este archivo debe mantenerse compacto para cargarse
completo en cada sesión.

## Antes de actuar

1. Lee este archivo completo y ejecuta `git status --short --branch`.
2. Consulta `graphify query "<pregunta>"` antes de una exploración amplia. El
   grafo es una caché local; verifica en el código cualquier decisión material.
3. Lee el documento de dominio indicado en la tabla final.
4. Si la tarea afecta Next.js, lee primero la guía relevante de
   `node_modules/next/dist/docs/`. Este proyecto usa Next 16.3 y contiene cambios
   incompatibles con versiones anteriores.
5. Explora, plantea el cambio, implementa y verifica. Pregunta sólo cuando una
   duda no verificable cambie materialmente el resultado.

## Reglas no negociables

- Responde a Dylan en español. Conserva términos técnicos en inglés cuando sean
  más claros.
- No hagas commits directos a `main`. Usa commits convencionales, breves y sin
  firmas, emojis ni menciones de autoría por IA.
- Dylan abre los pull requests manualmente. El agente puede preparar, commitear
  y pushear la rama, pero no abre el PR.
- Nunca commitees secretos ni muestres sus valores. `.env.example` contiene sólo
  nombres y ejemplos no sensibles.
- No uses `service_role` en el navegador. Toda tabla de datos de aplicación debe
  estar protegida por RLS y toda consulta debe mantener también el filtro de
  `tenant_id` en código.
- Nunca hardcodees identidad, assets o configuración de un tenant en código.
  Los valores específicos de un cliente pertenecen a datos o seeds.
- Antes de `DROP`, `TRUNCATE`, borrados masivos, rotación de credenciales o una
  operación difícil de recuperar, explica el alcance y confirma el objetivo.
- No empieces features de roadmap o pospuestas sin una petición explícita.
- No ocultes fallos con casts, excepciones permanentes o checks desactivados.
  Corrige la causa.

## Supabase: sandbox por defecto

Hay dos proyectos y producción contiene datos de clientes:

| Entorno | `project_ref` | Uso |
|---|---|---|
| Sandbox | `xpaixcowvyksgluazwzn` | Desarrollo, pruebas y primera aplicación de migraciones |
| Producción | `kvmjlrvlnhiarrqxulkr` | Datos reales; acceso excepcional |

- Usa el MCP `supabase-sandbox` configurado en el proyecto. Está acotado al
  sandbox y sus escrituras requieren aprobación del cliente MCP.
- Para cualquier tarea Supabase, carga las skills `supabase` y, antes de escribir
  SQL, `supabase-postgres-best-practices`.
- No mantengas un MCP de producción habilitado de forma permanente. Si una tarea
  necesita evidencia real, crea una conexión temporal acotada a producción,
  `read_only=true` y sólo los feature groups necesarios; elimínala al terminar.
- Toda migración se prueba primero en sandbox. Antes de cualquier escritura en
  producción, detente, describe el efecto y pide autorización explícita.
- No infieras el estado actual de una base sólo desde migraciones o documentos:
  verifícalo con el MCP correspondiente.

Detalles: `docs/agents/environments.md`.

## Servicios externos y dinero real

Local usa Supabase sandbox, pero puede heredar llaves reales de Anthropic,
Google AI, Resend, Telegram y Paddle.

- Antes de ejecutar cualquier flujo que consuma IA pagada, avisa a Dylan con una
  estimación y el número de ejecuciones. Incluye pruebas disparadas desde UI.
- No uses el límite `ai_monthly_limit_usd` como garantía de gasto local: los
  eventos se registran en sandbox, mientras el proveedor factura la cuenta real.
- No envíes correos ni notificaciones reales como efecto secundario de una prueba
  salvo autorización y destinatario explícitos.
- Los leads de demo deben usar dominios reservados como `example.com`.

## Git entre Windows, Mac y dos agentes

- GitHub es el canal de sincronización. OneDrive, stashes y archivos sin commit
  no son mecanismos de handoff entre computadoras.
- Una rama de trabajo tiene un único propietario activo: una computadora y un
  agente a la vez. Claude y Codex pueden alternarse, pero nunca editar la misma
  rama simultáneamente.
- Al comenzar: `git fetch --prune`, revisa `git status` y actualiza sólo con
  fast-forward (`git pull --ff-only`) cuando corresponda.
- Al entregar una rama a la otra computadora: verifica, crea un commit lógico y
  pushea. En el mensaje final indica rama, commit, verificaciones y pendientes.
- No borres branches, worktrees o stashes sin comprobar primero qué commits sólo
  existen localmente.
- Mantén los clones normales fuera de carpetas sincronizadas. En Windows usa
  `C:\dev\itmano-crm`; en Mac, una ruta local como `~/Developer/itmano-crm`.

Detalles y protocolo de handoff: `docs/agents/workflow.md`.

## Runtime y herramientas

- Runtime fijado por `package.json`: Node 24.20.0 y npm 11.19.0 mediante Volta.
- Instala Volta en cada computadora; no cambies las versiones sólo en una.
- Graphify fijado operacionalmente en 0.9.55 mediante
  `uv tool install "graphifyy[sql]==0.9.55"`.
- `graphify-out/` es caché local ignorada por Git. Nunca la agregues a commits.
- Tras clonar, ejecuta `npm run setup:hooks`; los hooks versionados actualizan el
  grafo en segundo plano después de commits y cambios de checkout.
- Si Graphify no responde o su grafo está ausente, continúa con `rg` y lectura
  directa; la herramienta acelera la exploración, no sustituye la evidencia.

## Arquitectura esencial

- CRM SaaS multi-tenant white-label para equipos inmobiliarios.
- Next.js 16.3, React 19.2, TypeScript strict, Tailwind v4, Supabase, Resend,
  Anthropic y Motion.
- Server Components hacen fetch. Client Components reciben props y sólo se usan
  cuando necesitan estado, hooks o APIs de navegador.
- Lecturas en `src/lib/data/*.ts`; mutaciones mediante Server Actions. Route
  handlers se reservan para sistemas externos, webhooks, intake y crons.
- La tabla `agents` representa miembros del equipo, no identidades de login.
  Relaciones de negocio usan `agents.id`; `agents.user_id` puede ser `null`.
- Auth es Magic Link y los registros están cerrados. Roles:
  `super_admin`, `agent_owner`, `agent`.
- La fuente de verdad del scoring es `recompute_lead_score(lead_id)` en Postgres.
- Toda lista de columnas de `.select()` se construye con `columns()` de
  `src/lib/supabase/columns.ts`.
- No uses AOS, jQuery ni librerías que muten el DOM; rompen el contrato SSR.

## Verificación

Ejecuta sólo lo proporcional al cambio, pero no declares terminado algo sin
verificarlo:

```text
npm run lint
npx tsc --noEmit
npm run test:unit
npm run build
```

Las suites remotas (`test:schema`, `test:rls`, `test:scoring`,
`test:ai-limits`, `test:sources`) comparten fixtures y se ejecutan de una en una
contra sandbox. `npm run check:db-targets` debe pasar antes. No ejecutes dos
suites remotas o builds con fixtures en paralelo.

Si cambias el matcher de `src/proxy.ts`, actualiza
`tests/auth/middleware-matcher.test.ts` en el mismo commit.

## Contexto por dominio

| Trabajo | Lee antes |
|---|---|
| Producto, estado, planes, roadmap o copy | `docs/agents/product.md` |
| Entornos, Supabase, migraciones, CI o credenciales | `docs/agents/environments.md` |
| Auth, multi-tenancy, flujo de datos o convenciones | `docs/agents/architecture.md` |
| Scoring, etapas, calidad, urgencia o decay | `docs/agents/scoring.md` |
| Email, formularios, propiedades o newsletters | `docs/agents/domains.md` |
| Git, worktrees, Mac/Windows, setup o handoff | `docs/agents/workflow.md` |

Cuando un documento contradiga el código o la base actual, gana la fuente de
verdad señalada por ese documento. Actualiza la documentación en el mismo cambio
si modificas una decisión duradera.
