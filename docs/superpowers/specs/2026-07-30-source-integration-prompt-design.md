# Diseño — Prompt de integración copiable para fuentes de adquisición

**Fecha:** 2026-07-30
**Rama:** `feat/source-integration-prompt`
**Fase del roadmap:** Fuera del roadmap formal — mejora de soporte/DX para tenants que conectan un formulario propio al CRM
**Estado:** diseño aprobado, pendiente de plan de implementación

---

## 0. Resumen

Hoy, al crear un Lead Magnet, Evento o Formulario (`acquisition_channels` de tipo
`lead_magnet` | `event` | `contact_form`), el modal de creación muestra una
pantalla de "resultado" con snippets/URLs sueltos (ID público, script de
tracking, endpoint(s)). Esa pantalla **desaparece para siempre** al cerrar el
modal — no hay forma de volver a verla desde el perfil de la fuente.

Esto ya causó un incidente real: un desarrollador externo (proyecto web del
tenant A&J) integró un formulario de contacto sin ver ese contrato de nuevo,
asumió un shape de `form_answers` distinto al real (`{question, answer}` en vez
de `{key, question, value, label}`), y además pegó las respuestas a un endpoint
cuyo schema Zod no aceptaba `form_answers` en absoluto — se perdían en
silencio. Ver commit `fix(contact): aceptar y reenviar form_answers en el
webhook generico` en `fix/carousel-render-resilience`.

Este diseño reemplaza esas pantallas sueltas por **un único prompt generado,
copiable, pensado para pegarse en un asistente de IA externo** ("tu IA de
confianza") junto con el pedido de construir el formulario. El prompt se genera
siempre desde la misma fuente de verdad viva (código + `lead_score_rules`), y
queda **siempre disponible** vía un botón "Ver Opciones de integración" en el
perfil de la fuente — no solo al crearla.

### Decisiones tomadas

| Decisión | Elegido |
|---|---|
| Brecha de fit-scoring en contact_form (secret/Webflow no llaman a `extractFitDimensions`) | **No se corrige** — solo se documenta con precisión cuál endpoint da qué |
| Secret de contact_form | **Se corrige** — pasa de un secret global compartido por todos los tenants a uno propio por canal |
| Ubicación de "Ver Opciones de integración" | Botón junto a Editar/Archivar en el header del perfil, abre modal |
| Contenido del prompt | Generado en el servidor desde código + `lead_score_rules` en vivo — nunca texto estático congelado |
| Pantallas de resultado de los 3 modales de creación | Se **reemplazan** por el mismo modal/contenido — no coexisten dos versiones del contrato |
| Vocabulario de fit (`budget_tier`, `timeline`, etc.) | Se documenta en el prompt para los 3 tipos de canal, aunque solo el endpoint de intake lo puntúa hoy |
| Snippet de tracking de vistas | Se documenta para los 3 tipos de canal (hoy solo existe para `lead_magnet`) |
| Secret HMAC de Webflow (`metadata.webflow_secret`) | Fuera de alcance — sigue con su fallback global sin cambios |

---

## 1. Hallazgos verificados (2026-07-30)

Contra el código real, no memoria del modelo:

- **`src/app/(dashboard)/sources/[slug]/page-options.tsx:184-186`** le dice hoy
  al desarrollador que `form_answers` "puede tener las preguntas y opciones que
  definas, sin claves fijas" — cierto para el análisis de IA en texto libre
  (`assessLeadFit` lee `question`/`label`/`value` sin filtrar por `key`), pero
  **falso** para el scoring automático de fit: `src/lib/services/intake-fit.ts`
  solo reconoce como `key` exactamente `timeline`, `financing`, `budget_tier`,
  `agent_status` (intención comprar/invertir) o `sell_motivation`, `timeline`,
  `listing_status` (intención vender) — cualquier otro `key` se guarda y se
  muestra, pero nunca suma puntos de fit. Esta contradicción ya vive en el
  código de hoy, sin que este diseño la haya introducido.
- Los códigos de valor reconocidos por dimensión están sembrados en
  `supabase/migrations/029_scoring_engine_rewrite.sql:43-62` (tabla
  `lead_score_rules`, `category='fit'`, global hoy — `tenant_id null` — pero el
  esquema ya soporta override por tenant). Son datos, no constantes de código:
  el generador debe leerlos en vivo, no copiarlos a este documento como texto
  fijo.
- `src/lib/services/handle-contact-submission.ts` (usado por
  `/api/contact/[publicId]/submit` y por el webhook de Webflow) **nunca** llama
  a `normalizeIntent`/`extractFitDimensions` — solo el endpoint de intake
  (`/api/intake/[publicId]/submit`) lo hace. Confirmado con el usuario: esta
  brecha se documenta, no se corrige aquí.
- `src/app/(dashboard)/sources/actions.ts#createContactForm` acepta un parámetro
  `webflowSecret` que **ningún componente de UI pasa nunca** (`ContactFormModal`
  no tiene ese campo). Como resultado, `metadata.webflow_secret` nunca se
  escribe hoy, y el endpoint de secret
  (`src/app/api/contact/[publicId]/submit/route.ts:50`) lee de todos modos una
  clave distinta (`metadata.contact_secret`) — que tampoco se escribe nunca.
  Todo canal `contact_form` cae siempre al fallback global
  `process.env.CONTACT_WEBHOOK_SECRET`, **compartido por todos los tenants**.
  Ese endpoint ya lee la clave correcta (`contact_secret`) — el único trabajo
  real es generarla y persistirla.
- `src/app/api/contact/[publicId]/submit/route.ts` no define `CORS_HEADERS` ni
  `OPTIONS` (a diferencia de `/api/intake/*`) — es intencionalmente
  servidor-a-servidor. Hoy ningún texto se lo advierte explícitamente al
  desarrollador; un intento de `fetch` desde JS de navegador fallaría por CORS
  sin explicación.
- `src/app/api/intake/[publicId]/view/route.ts` es genérico para cualquier
  `channel_id` — no exige `channel_type`. Hoy solo `createLeadMagnet` genera el
  snippet de tracking (`embedSnippet`); `createEvent` y `createContactForm` no
  lo mencionan. Cualquier página construida a medida para un evento o un
  formulario de contacto tiene hoy "Vistas" y "Conversión" en 0 de forma
  silenciosa, porque nadie le dijo al desarrollador que ese beacon existe.

---

## 2. Arquitectura

### 2.1 Módulo único de contrato — `src/lib/services/integration-prompt.ts`

Nuevo módulo `server-only`. Responsabilidad única: dado un canal + su catálogo
de fit vigente, devolver el texto del prompt. No accede a Supabase
directamente — recibe los datos ya resueltos, para quedar testeable sin red.

```ts
export interface FitCatalogEntry { dimension: string; matchValue: string; label: string }

export interface IntegrationPromptInput {
  channelType:  'lead_magnet' | 'event' | 'contact_form'
  channelName:  string
  publicId:     string
  tenantName:   string
  baseUrl:      string
  contactSecret?: string   // solo contact_form
  fitCatalog:   FitCatalogEntry[]
}

export function buildIntegrationPrompt(input: IntegrationPromptInput): string
```

`intake-fit.ts` exporta ahora `FIT_DIMENSIONS` (mapa intención → dimensiones
reconocidas), que ya existe como constante privada — solo se le agrega
`export`. Es la única lista de nombres de dimensión, y ya es la que usa el
scoring real: el prompt no puede desalinearse de ella porque la importa
directamente en vez de copiarla.

Una función separada, `getFitCatalog(db, tenantId)`, consulta
`lead_score_rules` (`category='fit'`, `is_active`, `tenant_id = :tenantId OR
tenant_id IS NULL`), agrupa por `(dimension, match_value)` prefiriendo la fila
del tenant sobre la global cuando ambas existen, y arma el `FitCatalogEntry[]`.
Cruzando esa lista con `FIT_DIMENSIONS` el módulo arma, por intención, la tabla
dimensión → valores que va en el prompt. Si mañana un tenant tiene reglas de
fit propias (columna `tenant_id` ya lo soporta), su prompt las refleja sin
tocar código.

### 2.2 Punto único de generación

Una sola acción de servidor produce el prompt, usada en los dos lugares donde
se necesita:

- `getIntegrationInfo(channelId)` — nueva, en `sources/actions.ts`. Resuelve el
  canal (tenant-scoped), el tenant, el catálogo de fit, y — solo para
  `contact_form` — el secret del canal (generándolo si el canal es anterior a
  este cambio y todavía no tiene uno; ver §3). Llama a
  `buildIntegrationPrompt` y devuelve `{ ok: true; prompt: string }`.
- `createLeadMagnet` / `createEvent` / `createContactForm` — cada una, tras
  crear el canal, arma el mismo `IntegrationPromptInput` (ya tienen todos los
  datos: `publicId`, tenant, y en el caso de `contact_form` el secret recién
  generado) y devuelve `integrationPrompt: string` junto al resto del
  resultado.

Nunca hay una segunda copia del contrato escrita a mano — "ver al crear" y "ver
después" llaman literalmente a la misma función constructora.

**Los campos sueltos que devuelven hoy estas 3 acciones —
`embedSnippet`, `formSnippet`, `webflowWebhookUrl`, `contactBackupUrl`,
`publicIntakeUrl`, `hasChannelSecret` — se eliminan de los tipos de resultado
(`CreateLeadMagnetResult`, `CreateEventResult`, `CreateContactFormResult`).**
Quedan superados por `integrationPrompt`, que ya incluye esa misma información
en contexto; mantenerlos vivos y sin usar en la UI sería recrear exactamente el
problema que este diseño resuelve (contrato duplicado en dos lugares que
pueden desalinearse). `channelId`, `publicId` y `slug` se conservan — no son
snippets, son identificadores que el resto del código todavía puede necesitar.

---

## 3. Secret propio por canal (`contact_form`)

- `createContactForm` genera siempre `crypto.randomBytes(24).toString('hex')`
  (192 bits) al crear el canal y lo guarda en `metadata.contact_secret`. El
  endpoint `/api/contact/[publicId]/submit` ya lee exactamente esa clave — no
  necesita ningún cambio.
- Se elimina el parámetro `webflowSecret` de `createContactForm` (nunca
  wireado a ningún input de UI) y el campo `hasChannelSecret` del resultado
  (describía ese parámetro muerto). El texto de la opción Webflow en el modal
  pasa a afirmar sin condicional que usa el secret global del servidor, que es
  lo único que hoy es cierto — el mecanismo HMAC de Webflow queda fuera de
  alcance de este diseño.
- **Backfill perezoso:** canales `contact_form` creados antes de este cambio no
  tienen `metadata.contact_secret`. `getIntegrationInfo` lo genera y persiste
  la primera vez que alguien abre "Ver Opciones de integración" para ese canal
  — sin migración de datos.
- Nueva acción `regenerateContactSecret(channelId)` (mismo guard
  `requireWriteAccess` que el resto de mutaciones de canal): sobreescribe
  `metadata.contact_secret` con un valor nuevo y devuelve el prompt
  reconstruido. El modal de integración muestra un botón "Generar nuevo
  secret" con una advertencia corta de que invalida integraciones que usaban
  el anterior.
- El secret se muestra en texto plano dentro del prompt (mismo patrón que el
  resto de snippets/IDs en esta página — ninguno se enmascara hoy) porque la
  página ya está protegida por autenticación + RLS de tenant.

---

## 4. Contenido del prompt generado

Formato: Markdown ligero (encabezados `###`, listas, bloques ` ``` `) — se
pega tal cual en un chat de IA, que lo interpreta mejor que prosa plana.
Redactado en español neutro, en primera persona del tenant (es su mensaje hacia
su propia IA).

Estructura común a los 3 tipos:

1. **Encabezado de intención** — 1 frase: "Estoy integrando un formulario web
   con el CRM de ITMANO para *{tenantName}*. Sigue este contrato exactamente
   — es todo lo que el CRM necesita para reconocer cada respuesta."
2. **Identificación del canal** — nombre, tipo legible, `publicId`.
3. **Endpoint(s)** — URL completa con el `publicId` real ya insertado, método,
   `Content-Type`, si requiere auth, si tiene CORS abierto o es
   servidor-a-servidor únicamente.
4. **Cuerpo JSON** — todos los campos, marcados requerido/opcional, con tipo y
   ejemplo.
5. **Contrato de `form_answers`** — shape `{key, question, value, label}` +
   aclaración explícita: cualquier `key` se guarda y se muestra en el CRM, pero
   **solo** las claves/valores de la tabla de fit (§4.1) suman puntaje
   automático.
6. **Tabla de fit vigente** — generada desde `getFitCatalog` en el momento de
   pedir el prompt, agrupada por intención (comprar/invertir vs. vender).
7. **Qué pasa después de un envío exitoso** — shape de la respuesta,
   deduplicación por email, y el efecto específico del tipo de canal
   (enrollment de secuencia para `lead_magnet`, notificación de registro para
   `event`, notificación de contacto para `contact_form`).
8. **Snippet de tracking de vistas** — el mismo beacon para los 3 tipos, para
   que "Vistas"/"Conversión" no queden en 0.
9. **Solo `contact_form` — nota final de Webflow.** La pantalla que este
   diseño reemplaza ofrecía Webflow como primera opción, y el comentario de
   `api/webhooks/webflow/[publicId]/route.ts` ("Exact keys from A&J's Webflow
   Contact Us form are primary") confirma que es una integración real, no
   hipotética — no puede desaparecer de la UI solo porque el prompt nuevo está
   pensado para el escenario "mi IA construye el formulario". Va como nota
   corta, separada del cuerpo del prompt (Webflow no necesita IA, solo pegar
   una URL en un ajuste): la URL `{baseUrl}/api/webhooks/webflow/{publicId}`,
   una frase de que Webflow firma cada envío con HMAC, y que el secret vigente
   se pide a ITMANO (ese mecanismo sigue con su fallback global sin cambios,
   §8 Fuera de alcance — aquí solo se documenta, no se le da un valor real
   porque no existe uno por canal).

### 4.1 Ejemplo ilustrativo — `contact_form`

Los valores de la tabla de fit son los sembrados hoy en la migración 029; el
generador real los lee de la base en cada solicitud, así que este bloque es
solo referencia de formato, no un texto a congelar en código:

```markdown
Estoy integrando un formulario web con el CRM de ITMANO para A&J Real Estate
Group. Sigue este contrato exactamente — es todo lo que el CRM necesita para
reconocer cada respuesta.

### Canal
Contáctanos — Home (Formulario) · ID público: chn_x5yxx15jt7wf

### Endpoint recomendado (sin autenticación, se puede llamar desde el navegador)
POST https://app.itmano.com/api/intake/chn_x5yxx15jt7wf/submit
Content-Type: application/json
CORS abierto (`Access-Control-Allow-Origin: *`). Protegido por ID no
adivinable + honeypot + validación de schema, no por origen.

### Alternativa autenticada (solo si llamas desde TU backend, nunca desde JS de navegador)
POST https://app.itmano.com/api/contact/chn_x5yxx15jt7wf/submit
Header: x-contact-secret: 4f1e9c...   (secret propio de este canal)
Sin CORS — un fetch directo desde el navegador fallará. Esta ruta no alimenta
el scoring automático de fit (sección de abajo) — solo el análisis de IA en
texto libre.

### Cuerpo (JSON)
{
  "first_name": "string, requerido",
  "last_name":  "string, opcional",
  "email":      "string, requerido, formato email",
  "phone":      "string, opcional",
  "language":   "\"es\" | \"en\" | \"pt\", opcional (default \"es\")",
  "intent":     "\"buy\" | \"sell\" | \"invest\", opcional — activa el scoring de fit de abajo",
  "source_url": "string, opcional",
  "website":    "string — SIEMPRE vacío (honeypot anti-spam)",
  "form_answers": [ /* ver abajo */ ]
}

### form_answers — cómo el CRM reconoce cada respuesta
Arreglo de objetos, uno por pregunta respondida:
{ "key": "...", "question": "texto de la pregunta", "value": "código interno", "label": "texto legible" }

Puedes mandar cualquier pregunta con cualquier `key` — se guarda y se muestra
en el CRM tal cual. Pero si preguntas presupuesto, tiempos, financiamiento o si
ya tiene agente, usa EXACTAMENTE estas claves y códigos para que además sumen
puntaje automático (otro `key`/valor se guarda igual, pero no puntúa):

Intención "buy" / "invest":
  - timeline     → under_3_months | 3_6_months | 6_12_months | over_12_explorando
  - financing    → cash | preapproved | in_process | not_started
  - budget_tier  → premium | mid | entry | undefined
  - agent_status → sin_agente | con_agente

Intención "sell":
  - timeline        → (mismos valores que arriba)
  - sell_motivation → alta | media | baja
  - listing_status  → no_listado_sin_agente | ya_listado_con_agente

### Respuesta y qué dispara
{ "ok": true, "status": "created" | "already_submitted" }
Mismo email + mismo tenant = mismo lead (se actualiza, nunca se duplica).
Cada envío dispara notificación de contacto en el CRM (bell + Telegram).

### Métricas de vistas (opcional, recomendado)
Sin esto, "Vistas" y "Conversión" de este canal quedan en 0. Dispara esto en
cada carga de página (no bloquea, no espera respuesta):

<script>
(function(){
  var d = {v: localStorage.getItem('_itm_vid') || (function(){
    var id = crypto.randomUUID(); localStorage.setItem('_itm_vid', id); return id;
  })()};
  navigator.sendBeacon('https://app.itmano.com/api/intake/chn_x5yxx15jt7wf/view', JSON.stringify(d));
})();
</script>

### ¿Usas Webflow? (sin código, sin IA)
Si tu sitio está en Webflow y usas su formulario nativo, no necesitas nada de lo
anterior: en Site Settings → Forms → Webhooks, apunta el formulario "Contact Us" a
POST https://app.itmano.com/api/webhooks/webflow/chn_x5yxx15jt7wf
Webflow firma cada envío con HMAC — pide el secret vigente a ITMANO.
```

`lead_magnet` agrega, antes de la sección de métricas, el mismo snippet ya
existente para pegar en el `<head>` (hoy generado por `createLeadMagnet`) y una
nota de que el envío inscribe automáticamente en la secuencia de email del
canal. `event` agrega una nota de que cada registro dispara notificación y
scoring de `event_submission` (+20), sin campos adicionales al contrato común.

---

## 5. Superficies de UI

- **Nuevo componente compartido** `src/app/(dashboard)/sources/integration-prompt-modal.tsx`
  (`'use client'`): recibe `{ channelName, prompt, onClose, showRegenerate?,
  onRegenerate? }`. Un único bloque de texto copiable (mismo patrón visual que
  `SnippetBlock`, adaptado a texto largo con salto de línea) + botón "Copiar
  prompt" +, si `showRegenerate`, botón "Generar nuevo secret".
- `LeadMagnetModal` / `EventModal` / `ContactFormModal`
  (`sources-client.tsx`): la pantalla de "resultado" tras crear pasa a ser
  este modal en vez del contenido bespoke actual (snippet suelto / URLs
  sueltas). Una sola pieza de UI para "ver esto ahora" y "verlo después".
- `ChannelActions` (`[slug]/channel-actions.tsx`): nuevo botón "Ver Opciones de
  integración" junto a Editar/Archivar. Al click, llama a
  `getIntegrationInfo(channelId)` y abre el mismo modal.
- **`page-options.tsx` (bloque "Formulario 100% propio (avanzado)",
  líneas 177-213):** este bloque es la segunda copia manual del mismo contrato
  que el hallazgo de §1 señala como desalineada ("sin claves fijas" +
  reglas obligatorias hardcodeadas, sin la tabla de fit). Se elimina el
  contrato duplicado y se reemplaza por 1-2 frases que apuntan al botón "Ver
  Opciones de integración" del header — mismo principio que el resto de este
  diseño: un solo lugar genera el contrato, todo lo demás apunta ahí.

---

## 6. Manejo de errores y casos borde

- `getIntegrationInfo` / `regenerateContactSecret` siguen el contrato existente
  de las acciones de este archivo: `{ok:true,...} | {ok:false,error}`, scope
  por `tenant_id` salvo `super_admin`, `requireWriteAccess` para las mutaciones
  (generar/regenerar secret).
- Canal no encontrado o de un tenant distinto → error genérico, igual que el
  resto de acciones de `sources/actions.ts`.
- `fitCatalog` vacío (tabla `lead_score_rules` sin filas activas de categoría
  fit, escenario hipotético) → la sección de fit del prompt se omite en vez de
  mostrar una tabla vacía.
- Copia al portapapeles: mismo `navigator.clipboard.writeText` ya usado por
  `SnippetBlock`/`CopyBtn` — sin cambios de patrón.

---

## 7. Testing / verificación

Sin cambios de comportamiento en scoring, RLS ni auth — no aplica ninguna
suite Vitest existente ni se crea una nueva. Verificación manual:

- `npx tsc --noEmit` y `npm run lint` tras los cambios.
- Crear un Lead Magnet, un Evento y un Formulario reales en el navegador;
  confirmar que el prompt final tiene el `publicId` correcto, el secret
  correcto (solo contact_form) y la tabla de fit vigente.
- Abrir "Ver Opciones de integración" en un canal `contact_form` creado antes
  de este cambio (sin `contact_secret` en `metadata`) y confirmar el backfill
  perezoso.
- Probar "Generar nuevo secret" y confirmar que el prompt se actualiza con el
  valor nuevo.

---

## 8. Fuera de alcance

- Extender `handleContactSubmission` para llamar
  `normalizeIntent`/`extractFitDimensions` (decisión explícita del usuario:
  solo documentar la brecha, no cerrarla).
- Secret propio por canal para el mecanismo HMAC de Webflow
  (`metadata.webflow_secret`) — sigue con su fallback global sin cambios.
- Rate limiting de los endpoints de intake/contact (TODO preexistente,
  no relacionado).
- Cualquier cambio a la lógica de secuencias de email, notificaciones o al
  motor de scoring más allá de lo descrito arriba.
- Traducir el prompt generado a otros idiomas — queda en español neutro, igual
  que el resto de la copy de esta página.
