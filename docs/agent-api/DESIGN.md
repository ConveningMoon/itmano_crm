# Superficie `/agent/v1` — API de agente para CONDUIT

Fecha: 2026-08-12
Branch: `feat/agent-api`
Estado: diseño aprobado (Dylan + revisión de CONDUIT)

---

## 1. Qué es esto y por qué

CONDUIT es una capa de agente conversacional: un usuario habla por Telegram, el
agente decide qué herramientas llamar y ejecuta contra un sistema de negocio.
Uno de sus adapters habla con este CRM.

CONDUIT **no** toca Postgres, **no** tiene service key, **no** reimplementa RLS
y **no** migra este esquema. Todo el aislamiento multi-tenant se queda aquí.
Lo único que CONDUIT hace es llamar a un endpoint HTTP autenticado y recibir
exactamente lo que ese tenant tiene permitido ver.

A medio plazo CONDUIT se fusiona con el CRM como una herramienta más. Por eso
esta superficie se diseña como **parte nativa del repo**, no como una fachada
para un sistema extraño: la estructura de la BD manda, y donde el modelo
genérico de CRM no encaja, gana el modelo real.

Todo el trabajo es **aditivo**. No se modifica ninguna ruta, tabla o policy
existente.

---

## 2. Choques con el modelo genérico de CRM, y cómo se resuelven

La petición original asumía un CRM genérico con `leads`, `contacts`, `deals`,
`pipelines` y custom fields. Este CRM no tiene eso. Resolución acordada:

| Concepto pedido | Realidad del repo | Resolución |
|---|---|---|
| `lead` y `contact` separados | Una sola tabla `leads`: el lead **es** la persona | `/contacts` existe como proyección de `leads` (mismos ids, solo campos de persona), marcada para que CONDUIT la excluya de su catálogo |
| `deal` con `amount` y `stage` propios | `purchase_processes`: `address`, `loan_type`, `closing_date`, `notes`, flags de email. Sin importe, sin etapa | `/deals` = `purchase_processes`. `amount` sale **siempre `null`**. Los campos prestados llevan nombre prestado: `lead_stage`, `lead_budget_amount` |
| filtro `status` | `leads.status` eliminado en la migración 082 | `stage`, con `status` aceptado como alias de entrada |
| `owner` | `agents.id`. Los agents **no son usuarios de login** (`agents.user_id` casi siempre null) | `owner` = `agents.id` |
| custom fields | No existen. Hay `leads.metadata` y `form_submissions.answers`, sin tabla de esquema | `/metadata` devuelve `custom_fields: []`, explícito |
| `pipeline` | No existe el concepto | Un único pipeline constante, `compra`, declarado en `/metadata` |

**Regla de fondo, acordada con CONDUIT:** un campo prestado se expone con su
nombre prestado, y un dato que no existe sale `null`. Un número inventado es
peor que un hueco, porque el agente lo dice en voz alta como si fuera bueno.

Consecuencia sobre los filtros pedidos: `min_amount` pasa a `min_lead_budget` y
el filtro de etapa de deals pasa a `lead_stage`, porque filtrar por un campo
que siempre es `null` no devolvería nunca nada. `close_before` se queda igual:
`closing_date` sí es una columna real del proceso.

---

## 3. Dónde vive el código

```
src/app/api/agent/v1/**            route handlers (runtime Node)
src/lib/agent-api/
  auth.ts                          token -> tenant + scopes -> sesión Supabase
  scopes.ts                        read | write
  cursor.ts                        codificación/decodificación del cursor keyset
  errors.ts                        taxonomía y envelope
  rate-limit.ts                    ventana fija en Postgres
  idempotency.ts                   replay y conflicto
  deadline.ts                      corte por clase de endpoint
  serializers/                     fila de BD -> forma pública
  schemas/                         schemas zod (fuente del OpenAPI)
  registry.ts                      inventario de rutas para el generador
supabase/migrations/103_agent_api.sql
scripts/agent-token.mjs            emisión, rotación, revocación
scripts/seed-agent-demo.mjs        siembra idempotente + export JSON
scripts/gen-openapi.mjs            generación del contrato
docs/agent-api/openapi.json        contrato commiteado
docs/agent-api/demo-tenant.json    fixture offline
tests/agent-api/                   suite (entra en test:unit)
```

---

## 4. Autenticación — el token es la sesión

### 4.1 Tabla

`agent_tokens`:

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid pk | |
| `tenant_id` | text | FK a `tenants` |
| `name` | text | "CONDUIT demo (read)" |
| `token_prefix` | text | primeros caracteres, para mostrar y revocar |
| `token_hash` | text unique | sha256 del secreto completo |
| `scopes` | text[] | `{read}` o `{read,write}` |
| `bot_user_id` | uuid | FK a `auth.users` |
| `expires_at` | timestamptz | 90 días por defecto |
| `revoked_at` | timestamptz | null = vigente |
| `last_used_at` | timestamptz | |
| `created_at` | timestamptz | |

RLS activo **sin ninguna policy**: deny by default, solo service_role la toca.

### 4.2 Flujo por request

1. `Authorization: Bearer itmano_agent_<env>_<32 bytes base64url>`
2. sha256 del token → fila. Inexistente, vencida o revocada → 401.
3. Se mintea un JWT HS256 de Supabase para `bot_user_id` mediante
   `agent_api_mint_jwt(user_id uuid, ttl_seconds int)`, función **dedicada**,
   SECURITY DEFINER, solo service_role. No se reutiliza `rls_test_mint_jwt`:
   un helper de tests en la ruta de auth se rompe el día que alguien arregle
   un test.
4. Todas las queries del request corren con ese JWT.

**Por qué importa:** el bot es un `auth.users` real con
`user_profiles.tenant_id` = tenant demo y rol `agent`. El aislamiento lo aplica
la RLS que ya existe (`get_my_tenant_id()`), no un `.eq('tenant_id', …)` que se
pueda olvidar en un endpoint nuevo. Un registro de otro tenant no devuelve 403:
**no existe** para esa conexión, así que el 404 sale solo. No se filtra
existencia porque no hay existencia que filtrar.

El bot nunca lleva rol `agent_owner` ni `super_admin`, y no tiene fila en
`agents`: no es un miembro del equipo.

### 4.3 Scopes

`read` y `write`, separados. La RLS del repo permite escribir en el propio
tenant, así que el modo solo-lectura lo impone el router **antes** de tocar la
BD. Scope insuficiente → 403.

### 4.4 Ciclo de vida

- **Emisión:** `npm run agent:token -- --tenant <id> --scopes read --name "…"`.
  Imprime el token una sola vez. **Aborta si el project ref es el de
  producción.**
- **Expiración:** 90 días.
- **Rotación:** emitir uno nuevo no invalida el viejo. Ventana de solapamiento;
  se revoca cuando el consumidor ya migró.
- **Revocación:** `--revoke <prefix>`, efecto inmediato, comprobado en cada
  request sin caché.

---

## 5. Endpoints

Todas las operaciones llevan `x-itmano-agent-tool: true|false` en el OpenAPI,
para que CONDUIT filtre su catálogo programáticamente.

### 5.1 Lectura (scope `read`)

| Ruta | Filtros | `agent-tool` |
|---|---|---|
| `GET /whoami` | — | true |
| `GET /metadata` | — | true |
| `GET /leads` | `stage` (alias `status`), `owner`, `created_after`, `q` | true |
| `GET /leads/{id}` | — | true |
| `GET /contacts`, `/contacts/{id}` | igual que leads | **false** |
| `GET /deals` | `lead_stage`, `pipeline`, `min_lead_budget`, `close_before` | true |
| `GET /deals/{id}` | — | true |
| `GET /search` | `q` | true |
| `GET /openapi.json` | — | **false** |

- `whoami` no toca datos de negocio: tenant, scopes, versión, entorno y
  vencimiento del token. Sirve para verificar el cableado sin leer nada.
- `metadata` publica los enums vivos: stages, bandas de calidad, urgencias,
  agents, canales, estados de propiedad, pipelines, currency, locales, y las
  dimensiones y buckets de `fit_profile` que acepta `POST /leads`.
  `custom_fields: []`.
- `q` en leads usa la columna `leads.search_text` que ya existe.
- `search` devuelve `{type, id, label}` sobre leads, propiedades y deals.
- `/contacts` es proyección: solo campos de persona, sin scoring ni fit. Mismos
  ids que `/leads`. Se mantiene para otros consumidores; CONDUIT la excluye.

### 5.2 Escritura (scope `write`)

| Ruta | Nota |
|---|---|
| `POST /leads` | Acepta los campos de calificación del intake (`budget_amount`, `area`, `timeline`, `intent`, `form_answers`) y corre el mismo `extractFitDimensions`. Emite `lead_created`; emite `form_baseline` **solo** si vienen respuestas de calificación |
| `PATCH /leads/{id}` | `stage` y `owner`. El cambio de etapa escribe en `lead_status_history` — en este repo no hay transiciones silenciosas |
| `POST /notes` | `{target_type: lead\|contact\|deal, target_id, body}` → fila en `lead_events` tipo `agent_note`, 0 puntos, sin efecto en scoring |
| `POST /emails/draft` | Persiste el cuerpo **que manda el cliente**, literal. El CRM no genera nada. Tabla nueva `agent_email_drafts` |

**`POST /deals/{id}/stage` queda fuera a propósito.** La etapa se mueve solo por
`PATCH /leads/{id}`. Dos rutas mutando el mismo campo rompen la detección de
bucles de CONDUIT (hashea la intención: dos nombres = dos hashes) y dejan el
audit log con dos vocabularios para el mismo hecho.

### 5.3 Reglas permanentes del contrato

- **Esta superficie no expone `DELETE` en ninguna versión.** Queda escrito en
  el OpenAPI y hay un test que falla si algún archivo del árbol exporta `DELETE`.
- **Ninguna ruta envía un email de verdad.** Un test recorre el árbol
  `src/app/api/agent/` y `src/lib/agent-api/` y falla si aparece cualquier
  import de Resend o de los servicios de envío.
- No hay endpoint genérico de query. No se acepta SQL ni filtros arbitrarios:
  cada filtro es un campo declarado en un schema zod.

---

## 6. Idempotencia

Header `Idempotency-Key` en toda escritura. Tabla `agent_idempotency_keys`, PK
`(tenant_id, key)`, guarda `request_hash` (sha256 de método + ruta + body
canónico), estado y respuesta.

| Caso | Resultado |
|---|---|
| Misma key, mismo body, < 24h | Replay de la respuesta guardada + header `Idempotency-Replayed: true` |
| Misma key, **body distinto** | 409 `idempotency_key_reuse`, retryable **false** |
| Misma key, petición en vuelo | 409 `idempotency_key_in_flight`, retryable **true** |
| Key con más de 24h | Caduca; se trata como nueva |

Se inserta la fila en estado `in_flight` antes de ejecutar; la unicidad de la PK
resuelve la carrera. Purga diaria de filas de más de 24h.

---

## 7. Paginación

- Cursor **opaco**: base64url de `{k: [created_at, id], f: <hash de filtros>}`.
  Keyset, nunca offset — los datos se mueven entre páginas.
- Orden estable: `created_at desc, id desc`.
- `limit` por defecto 25, **máximo 100**. Un `limit` mayor devuelve 400, no se
  trunca en silencio.
- Cursor presentado con filtros distintos a los que lo generaron →
  `invalid_arguments`.
- Envelope: `{ "data": [...], "next_cursor": null | "<opaco>" }`.
  `next_cursor` es `null` en la última página.

---

## 8. Taxonomía de errores

Envelope: `{ "error": { "code", "message", "retryable", "details"? } }`.

| HTTP | `code` | Código CONDUIT | Retryable |
|---|---|---|---|
| 400 | `invalid_arguments` | `invalid_arguments` | no |
| 401 | `unauthorized` | `unauthorized` | no |
| 403 | `insufficient_scope` | `unauthorized` | no |
| 404 | `not_found` | `not_found` | no |
| 409 | `idempotency_key_reuse` | `invalid_arguments` | no |
| 409 | `idempotency_key_in_flight` | `upstream_error` | sí |
| 422 | `unprocessable` | `invalid_arguments` | no |
| 429 | `rate_limited` | `rate_limited` | sí |
| 500 / 502 / 503 | `upstream_error` | `upstream_error` | sí |
| 504 | `timeout` | `timeout` | sí |

---

## 9. Rate limits

No existe infraestructura de rate limiting en el repo. Se implementa en
Postgres (ventana fija, upsert atómico por RPC) para no añadir un proveedor.

- **120 peticiones/minuto** por token.
- **20 escrituras/minuto** por token.
- Toda respuesta lleva `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
  `X-RateLimit-Reset` (epoch en segundos).
- El 429 añade `Retry-After` en segundos y código `rate_limited`.

---

## 10. Deadlines

No hay tráfico todavía, así que no hay p99 real. Lo que sí se garantiza es el
corte por parte del servidor:

| Clase | Deadline servidor | Cliente recomendado |
|---|---|---|
| `whoami`, `metadata` | 3s | 10s |
| listados y gets | 5s | 10s |
| `search` | 5s | 10s |
| escrituras | 8s | 15s |

Pasado el deadline se devuelve **504 `timeout` con cuerpo**, nunca un cuelgue.
`maxDuration` de la función a 30s para que la plataforma no corte antes con un
504 vacío. Los percentiles reales se miden contra el sandbox sembrado y se
publican después.

El tenant demo va con `ai_lead_scoring_enabled = false`, así que `POST /leads`
no dispara la llamada a Claude del pipeline de intake: sin eso la cola de esa
ruta serían segundos y costaría dinero por request.

---

## 11. Scoring en la superficie

`recompute_lead_score` es un trigger de Postgres sobre `lead_events`: corre
siempre, con independencia de `ai_lead_scoring_enabled`. La IA solo
**reinterpreta** los buckets de `fit_profile`; quien los rellena de base es
`extractFitDimensions`, que es determinista.

Pesos relevantes (de `lead_score_rules`, consultados por MCP):

- `lead_created` → **0 puntos**. Es bitácora, no regla.
- `form_baseline` → 10 puntos.
- Todo el `fit` sale de `fit_profile`.

Por tanto el score de un lead creado por la API **no depende del toggle de IA,
depende del payload**. Un lead con solo nombre y email sale con 0, que es
correcto: el CRM no sabe nada de él. Por eso `POST /leads` acepta los campos de
calificación y `/metadata` publica qué dimensiones y buckets son válidos.

Las bandas de calidad son quintiles recalculados 1×/día, así que un lead creado
en vivo recibe banda contra los cortes del día anterior. Con 60 leads sembrados
los quintiles aplican; por debajo de 20 activos se caería a cortes fijos.

---

## 12. Tenant demo

`tenant-conduit-demo`, **nuevo**. No se reutiliza "Tenant Test", que arrastra un
lead con dirección de gmail real.

### 12.1 Contenido

- **60 leads**, todos `@example.com`, nombres sintéticos, repartidos por las
  cinco etapas, con `created_at` distribuido en 180 días con jitter de día y
  hora.
- **5 agentes**, **6 canales de adquisición**, **10 propiedades**.
- **25 purchase_processes** colgando de leads en `en_proceso` o `cerrado`.
- Eventos sembrados en `lead_events` para que los scores y las bandas varíen de
  verdad.

### 12.2 Casos raros pedidos por CONDUIT

Un deal sin proceso asociado es imposible aquí, porque un deal **es** un
proceso. Los equivalentes que sí se siembran:

- Un lead `cerrado` **sin** proceso asociado — el deal que esperarías y no está.
- Un proceso con `closing_date` null — `close_before` debe excluirlo sin romperse.
- Un proceso cuyo lead está en `perdido` — `lead_stage` contradictorio a propósito.
- Un lead sin `agent_id` (owner null) y otro sin teléfono.
- Un lead sin `budget_amount` → `amount` y `lead_budget_amount` ambos null.
- Un lead forzado a `perdido` por queja de spam, con score 0. Su rareza vive en
  el evento `email_spam_complaint` con side effect `force_perdido`, **no** en
  `email_blocked_reason`, que sigue siendo `hard_bounce` como el resto (ver
  12.3). Este lead no tiene proceso de compra asociado.
- Un apellido con apóstrofe y otro con acentos, para `q` y encoding.
- Al menos un lead en cada una de las cinco etapas, con `cerrado` y `perdido`
  cubiertos.

### 12.3 Garantías de que no sale ningún email

Cinco capas, a nivel de datos y de entorno:

1. Los 25 procesos se siembran con `email_start_sent`, `email_preclose_sent` y
   `email_completed_sent` en `true`. La Stage 3 del cron
   (`sequence-orchestrator/route.ts:113-117`) solo recoge los no enviados.
2. Cero filas en `email_sequences` para el tenant, y
   `acquisition_channels.email_sequence_id = null` en los 6 canales.
3. `email_blocked = true` y **`email_blocked_reason = 'hard_bounce'`** en los 60
   leads. La razón importa: `send-purchase-email.ts:140` solo corta con ese
   valor exacto. Además es la etiqueta honesta — `example.com` es un dominio
   reservado que no acepta correo, así que esas direcciones rebotarían de verdad.
4. El deployment sandbox va **sin `RESEND_API_KEY`**. Sin clave no hay transporte.
5. El proyecto Vercel sandbox no se registra en cron-job.org. Los crons de este
   repo son externos, así que nadie los llama.

### 12.4 Seguridad del script

`scripts/seed-agent-demo.mjs`:

- Ids deterministas + upsert: resembrar no duplica.
- **Aborta** si el project ref es el de producción.
- **Aborta** si el tenant destino no es `tenant-conduit-demo`.
- `--export` escribe `docs/agent-api/demo-tenant.json` **llamando a los
  endpoints de lectura**, no volcando SQL, para que fixture y contrato no puedan
  divergir.

---

## 13. Contrato OpenAPI 3.1

- Cada request y response es un schema zod en `src/lib/agent-api/schemas/`.
- `scripts/gen-openapi.mjs` recorre `registry.ts` y emite con
  `z.toJSONSchema(schema, { target: 'draft-2020-12' })` de zod 4 — draft 2020-12
  es exactamente el dialecto de OpenAPI 3.1, así que no hace falta librería
  nueva. Verificado que zod propaga claves custom (`x-itmano-pii`) al JSON
  Schema resultante.
- **zod pasa a dependencia directa.** Hoy entra como transitiva (4.4.3), que es
  frágil independientemente de este trabajo.
- Los ejemplos de cada response se obtienen **consultando la BD sandbox**: una
  fila real del tenant demo por response, siempre sintética.
- Se sirve en `GET /agent/v1/openapi.json` y se commitea en
  `docs/agent-api/openapi.json`. Un test falla si el archivo commiteado no
  coincide con la regeneración, igual que el patrón de `types:db`.

---

## 14. Campos PII

Se declaran **campo a campo en el propio OpenAPI** con `x-itmano-pii: true`, no
en un documento aparte: la redacción de logs de CONDUIT lee el contrato.

Campos marcados:

| Entidad | Campos |
|---|---|
| lead / contact | `first_name`, `last_name`, `email`, `phone`, `notes`, `language`, `metadata`, `budget_amount`, `lead_budget_amount` |
| agent / owner | `name`, `email`, `phone` |
| deal | `address`, `notes` |
| property | `address` |
| note | `body` |
| email draft | `subject`, `body` |
| search result | `label` |

`budget_amount` se marca por ser dato financiero de una persona identificable.
`label` de búsqueda se marca porque compone nombre y dirección.

---

## 15. Convenciones

- **IDs opacos, no uuid.** `leads.id` y `agents.id` son `text` por legado;
  `properties.id` y `purchase_processes.id` sí son uuid. El adapter **no debe
  validar formato uuid**.
- **Timestamps** ISO 8601 en UTC con sufijo `Z`. Postgres devuelve `+00`; el
  serializer convierte.
- **Dinero:** `{ "amount": "350000.00", "currency": "USD" }` — decimal como
  string, sin coma flotante. La currency sale de `tenants.currency`.
- **Locale:** los códigos de enum son español snake_case (`nuevo`, `en_proceso`,
  `media_alta`) porque así están en la BD; el `label` legible viene en
  `/metadata`. Cada lead trae su `language` (`es` / `en` / `pt`).

---

## 16. Entorno sandbox

- **Proyecto Supabase nuevo**, separado de producción, con todas las migraciones
  aplicadas y el tenant demo sembrado.
- **Proyecto Vercel nuevo**, mismo código, apuntando a la BD sandbox, con base
  URL propia y **sin `RESEND_API_KEY`**.
- Ninguna credencial entregada apunta a producción. Los scripts abortan si
  detectan el project ref de producción.

---

## 17. Orden de entrega

CONDUIT no necesita el sandbox desplegado para empezar. Orden acordado:

1. Proyecto Supabase sandbox creado, migraciones aplicadas, tenant demo sembrado.
2. **`docs/agent-api/openapi.json`** con `x-itmano-agent-tool` y `x-itmano-pii`
   ya puestos → commit.
3. **`docs/agent-api/demo-tenant.json`** (export offline) → commit.
4. Deploy a Vercel, token demo y prueba de humo.

Los pasos 2 y 3 desbloquean el adapter; el 4 va en paralelo. Ambos artefactos
dependen de la **BD sandbox sembrada**, no del deploy.

---

## 18. Tests

En `tests/agent-api/`, dentro de `test:unit` salvo los que necesiten BD:

- Taxonomía de errores y envelope.
- Cursor: ida y vuelta, filtros cambiados, `limit` fuera de rango.
- Idempotencia: replay, conflicto por body distinto, carrera en vuelo.
- Serializers: timestamps con `Z`, dinero como string, `amount` siempre null.
- Guarda de envío: ningún import de Resend en el árbol.
- Guarda de `DELETE`: ninguna ruta lo exporta.
- Deriva del OpenAPI: el archivo commiteado coincide con la regeneración.
- Aislamiento por tenant (estilo suite RLS): un token del tenant A pide un
  registro del tenant B y recibe **404**, nunca 403.

---

## 19. Desviaciones respecto a la petición original

1. `/contacts` y `/deals` existen, pero como proyección y como
   `purchase_processes`. No hay entidades separadas debajo.
2. `deal.amount` es siempre `null`; los campos prestados se llaman
   `lead_stage` y `lead_budget_amount`.
3. Los filtros `stage` y `min_amount` de deals pasan a `lead_stage` y
   `min_lead_budget`.
4. `POST /deals/{id}/stage` no se construye.
5. `status` se llama `stage`, con `status` aceptado como alias de entrada.
6. 60 leads en lugar de "40 leads + 60 contactos": es la misma entidad.
7. Dos códigos de error adicionales para idempotencia, con su mapeo a los seis
   códigos de CONDUIT.
8. `custom_fields` va vacío: el CRM no tiene ese concepto.
9. Los IDs no son uuid en todas las entidades.
10. Los p99 no se entregan al inicio; se entregan deadlines garantizados y se
    miden después contra el sandbox sembrado.

---

## 20. Punto fuera de alcance, planteado aparte

Al verificar las garantías de no-envío apareció un asunto de producción que
**no se toca desde este trabajo**: `send-purchase-email.ts:140` solo bloquea por
`hard_bounce`. Para `unsubscribed` es una decisión deliberada y defendible
(correo transaccional de un proceso que el lead inició). Para `spam_complaint`
la justificación del comentario no se sostiene, porque la Stage 3 del cron lee
`purchase_processes` sin mirar corridas ni estado del lead. Exposición actual en
producción: **cero** — no hay ningún lead bloqueado hoy. Queda planteado como
tarea independiente.
