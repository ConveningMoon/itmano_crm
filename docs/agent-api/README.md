# Superficie `/agent/v1` — guía de integración

Contrato completo: [`openapi.json`](./openapi.json) · Datos offline: [`demo-tenant.json`](./demo-tenant.json) · Diseño y porqués: [`DESIGN.md`](./DESIGN.md)

---

## 1. Entorno

| | |
|---|---|
| Base URL | `https://<pendiente-de-deploy>` |
| Proyecto Supabase | `xpaixcowvyksgluazwzn` (**sandbox**, nunca producción) |
| Tenant demo | `tenant-conduit-demo` — "Costa Verde Realty" |
| Datos | 60 leads, 5 agentes, 6 canales, 10 propiedades, 25 procesos. **100 % sintéticos** |
| Envío de email | **Imposible**: el deployment lleva una `RESEND_API_KEY` inválida a propósito |

Todos los correos del tenant demo son `@example.com`, un dominio reservado que no acepta correo.

## 2. Autenticación

```
Authorization: Bearer itmano_agent_sbx_<secreto>
```

El token **determina el tenant**. Ninguna ruta acepta `tenant_id` como parámetro.

| Token | Scopes | Uso |
|---|---|---|
| `itmano_agent_sbx_BaYhhfMK…` | `read` | Operación normal del agente |
| `itmano_agent_sbx_9150gCoh…` | `read,write` | Sólo cuando necesite crear o modificar |

Vencen a los 90 días. Para emitir, listar o revocar:

```bash
node scripts/agent-token.mjs --issue --tenant tenant-conduit-demo --scopes read --name "..."
```

```bash
node scripts/agent-token.mjs --list --tenant tenant-conduit-demo
```

```bash
node scripts/agent-token.mjs --revoke <prefijo>
```

La revocación es inmediata: se comprueba en cada petición, sin caché. Emitir uno nuevo **no** invalida el viejo, así que se puede rotar con ventana de solapamiento.

## 3. Un `curl` por endpoint

Exporta primero:

```bash
export BASE="https://<tu-deployment>" TOKEN="itmano_agent_sbx_BaYhhfMK..."
```

**Identidad y vocabulario**

```bash
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/agent/v1/whoami"
```

```bash
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/agent/v1/metadata"
```

**Leads**

```bash
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/agent/v1/leads?limit=5&stage=nuevo"
```

```bash
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/agent/v1/leads/demo-lead-001"
```

**Contactos** (proyección de leads — no la registres como herramienta)

```bash
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/agent/v1/contacts?limit=5"
```

```bash
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/agent/v1/contacts/demo-lead-001"
```

**Procesos de compra**

```bash
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/agent/v1/deals?lead_stage=cerrado&limit=5"
```

```bash
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/agent/v1/deals?close_before=2026-12-31&min_lead_budget=300000"
```

**Búsqueda**

```bash
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/agent/v1/search?q=Camila&limit=5"
```

**Contrato** (público, sin token)

```bash
curl -s "$BASE/api/agent/v1/openapi.json"
```

**Escrituras** — requieren el token con scope `write`:

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN_RW" -H "content-type: application/json" -H "Idempotency-Key: demo-001" -d '{"first_name":"Prueba","last_name":"Humo","email":"prueba.humo@example.com","owner":"demo-agent-01"}' "$BASE/api/agent/v1/leads"
```

```bash
curl -s -X PATCH -H "Authorization: Bearer $TOKEN_RW" -H "content-type: application/json" -d '{"stage":"en_proceso"}' "$BASE/api/agent/v1/leads/demo-lead-001"
```

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN_RW" -H "content-type: application/json" -d '{"target_type":"lead","target_id":"demo-lead-001","body":"Llamada hecha."}' "$BASE/api/agent/v1/notes"
```

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN_RW" -H "content-type: application/json" -d '{"lead_id":"demo-lead-001","subject":"Tres opciones","body":"Hola..."}' "$BASE/api/agent/v1/emails/draft"
```

El borrador **se guarda y se devuelve. No se envía.** Ninguna ruta de esta superficie tiene acceso a un transporte de email.

## 4. Errores

Envelope: `{ "error": { "code", "message", "retryable", "details"? } }`

| HTTP | `code` | Equivalente CONDUIT | Retryable |
|---|---|---|---|
| 400 | `invalid_arguments` | `invalid_arguments` | no |
| 401 | `unauthorized` | `unauthorized` | no |
| 403 | `insufficient_scope` | `unauthorized` | no |
| 404 | `not_found` | `not_found` | no |
| 409 | `idempotency_key_reuse` | `invalid_arguments` | no |
| 409 | `idempotency_key_in_flight` | `upstream_error` | **sí** |
| 422 | `unprocessable` | `invalid_arguments` | no |
| 429 | `rate_limited` | `rate_limited` | **sí** |
| 500 / 502 / 503 | `upstream_error` | `upstream_error` | **sí** |
| 504 | `timeout` | `timeout` | **sí** |

Un registro de otro tenant devuelve **404, nunca 403**, y el cuerpo es indistinguible del de un id inexistente: no se filtra existencia.

## 5. Campos con datos personales

Cada uno lleva `x-itmano-pii: true` **en el propio OpenAPI**, así que la redacción de logs puede leerse del contrato en vez de mantener esta lista a mano.

| Entidad | Campos |
|---|---|
| lead | `first_name`, `last_name`, `email`, `phone`, `language`, `notes`, `budget` |
| lead (entrada) | `first_name`, `last_name`, `email`, `phone`, `notes`, `budget_amount` |
| contact | `first_name`, `last_name`, `email`, `phone`, `language` |
| deal | `address`, `notes`, `lead_budget_amount` |
| search | `label` (compone nombre y correo) |
| note | `body` |
| email draft | `subject`, `body` |

`budget` y `lead_budget_amount` se marcan por ser dato financiero de una persona identificable.

## 6. Paginación

Cursor opaco, keyset, nunca offset.

- `limit` por defecto 25, **máximo 100**. Por encima devuelve 400, no trunca en silencio.
- `next_cursor` es `null` en la última página.
- Un cursor sólo vale con **los mismos filtros** que lo generaron; con otros devuelve `invalid_arguments` en vez de una página incoherente.

## 7. Rate limits

120 peticiones/minuto por token, y 20 escrituras/minuto.

Toda respuesta lleva `X-RateLimit-Limit`, `X-RateLimit-Remaining` y `X-RateLimit-Reset` (epoch en segundos). El 429 añade `Retry-After`.

## 8. Idempotencia

Header `Idempotency-Key` en cualquier escritura.

| Caso | Resultado |
|---|---|
| Misma key, mismo cuerpo, < 24 h | La respuesta guardada, con `Idempotency-Replayed: true` |
| Misma key, **cuerpo distinto** | 409 `idempotency_key_reuse` |
| Misma key, petición aún en curso | 409 `idempotency_key_in_flight` (retryable) |
| Más de 24 h | Caduca; se trata como nueva |

## 9. Convenciones

- **IDs opacos.** `leads.id` y `agents.id` son `text` por legado; `properties.id` y `purchase_processes.id` sí son uuid. **No valides formato uuid.**
- **Timestamps** ISO 8601 UTC con sufijo `Z`.
- **Dinero:** `{ "amount": "350000.00", "currency": "USD" }` — decimal como cadena, nunca coma flotante.
- **Enums** en español snake_case (`nuevo`, `en_proceso`, `media_alta`) porque así están en la base; la etiqueta legible está en `/metadata`.
- **Sin `DELETE`** en ninguna versión de esta superficie.

## 10. Tiempos

El servidor corta y devuelve **504 con cuerpo**, nunca deja colgada la petición:

| Clase | Deadline | Cliente recomendado |
|---|---|---|
| `whoami`, `metadata` | 3 s | 10 s |
| listados y gets | 5 s | 10 s |
| `search` | 5 s | 10 s |
| escrituras | 8 s | 15 s |

**Línea base medida** (20 llamadas por endpoint, app + base desde una máquina local, sin la red de Vercel):

| Endpoint | p50 | p95 |
|---|---|---|
| whoami | 808 ms | 1441 ms |
| metadata | 1076 ms | 1999 ms |
| leads (25) | 1074 ms | 1358 ms |
| deals (25) | 1062 ms | 1114 ms |
| search | 1065 ms | 1432 ms |

Lo interesante es que **`whoami` cuesta casi lo mismo que listar 25 leads sin consultar ni un dato de negocio**: el coste fijo son los tres viajes a la base de la cadena de autenticación (buscar el token, mintear el JWT, contar el rate limit), no las queries. Desplegado junto a la base esos viajes bajan de ~270 ms a pocos milisegundos. Si aun así los percentiles molestan, ahí está el margen: fusionar los tres en un solo RPC.

## 11. Reseña de la siembra

```bash
npm run seed:agent-demo
```

Idempotente —ids deterministas y generador sin aleatoriedad— y **aborta si el proyecto destino es producción**. Al terminar comprueba las cinco garantías de no-envío y sale con error si alguna falla.

```bash
npm run openapi:gen
```

Regenera `openapi.json`, `openapi.generated.json` y `demo-tenant.json` llamando a los endpoints. `npm run test:agent-api` falla si el commiteado se separó del código.
