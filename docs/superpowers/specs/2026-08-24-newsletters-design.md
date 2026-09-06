# Newsletters — contenido editorial con captación de suscriptores

Fecha: 2026-08-24
Estado: aprobado, pendiente de plan de implementación

---

## 1. Problema

El CRM sabe qué hacer con un lead desde que entra, pero no tiene forma de
atraerlo. Hoy las fuentes de adquisición son formularios: el visitante ya tiene
que querer algo (descargar una guía, apuntarse a un evento, preguntar). No hay
ninguna superficie que atraiga a quien todavía no sabe que quiere nada.

Una newsletter es esa superficie: contenido editorial sobre el mercado de la
agencia, publicado en una página propia, con un formulario de suscripción que
alimenta el mismo motor de nurturing que ya existe.

Es además la pieza que más se parece al diferenciador que ITMANO vende. La
competencia entrega un PDF mensual; aquí el cliente publica análisis de su
mercado con datos citables, generados en minutos, con su marca.

## 2. Alcance

**Dentro:**

- Sección `/newsletters` en el CRM, autoservicio para el tenant, incluida en
  los planes Growth y Partner (`PlanFeatures.newsletters`).
- Series de newsletter como canal de adquisición (`channel_type = 'newsletter'`).
- Tabla `newsletter_editions` con contenido en bloques versionados.
- Portada obligatoria por edición: subida, elegida del Estudio, o generada.
- Formato apaisado (16:9) nuevo en el Estudio.
- Generación con IA en dos pasos: investigación con búsqueda web restringida a
  una allowlist de fuentes por mercado, y redacción con salida estructurada.
- Fuentes verificables guardadas por edición y mostradas en la página pública.
- Páginas públicas alojadas en `news.itmano.com` con ISR.
- Formulario de suscripción con consentimiento explícito y su prueba.
- El suscriptor entra como lead marcado, se inscribe en la secuencia vinculada
  a su serie, y queda fuera del cálculo de bandas de calidad.

**Fuera:**

- **Broadcast**: enviar una edición por email a toda la lista. Decisión
  explícita (§10). El esquema se diseña para admitirlo después sin migración
  destructiva, pero no se construye ahora.
- Traducción automática de una edición a otros idiomas.
- Propuesta mensual automática por cron.
- Dominio propio del tenant para las newsletters (§10).
- Cambiar los límites de plan de "leads" a "contactos de marketing" (§10 —
  decisión aparte, es copy y contrato, no código).

## 3. Decisiones de arquitectura

### 3.1 La serie es un canal de adquisición

> **Superada — 2026-08-31.** El modelo de series descrito en esta sección se
> retiró: un tenant tiene UNA newsletter implícita, no varias series a elegir.
> Ver `docs/superpowers/plans/2026-08-27-newsletters-sin-series.md`. Se deja el
> texto tal cual, como registro de por qué se decidió así en su momento — el
> canal de adquisición como soporte (sin tabla propia) sigue vigente, lo que
> cambió es que el usuario ya no ve ni elige esa fila.

Se añade `'newsletter'` al CHECK de `acquisition_channels.channel_type`. La
serie **es** una fila de esa tabla; no hay tabla de series.

Con eso salen gratis, sin escribir código nuevo:

| Pieza | De dónde |
|---|---|
| Vinculación a secuencia | `acquisition_channels.email_sequence_id` |
| Config de página pública | `acquisition_channels.hosted_page` |
| Asignación del lead a un agente | `agent_id` + `route-channel-agent.ts` |
| Inscripción en la secuencia | `enroll-lead-in-sequence.ts`, sin tocar |
| Analítica de fuente | `lead_analytics_stats`, ya agrupa por `channel_type` |
| Dedup de envíos | `form_submissions` |

Los atributos editoriales de la serie (descripción pública, portada de serie)
viven en `metadata`/`hosted_page`, que es el patrón ya establecido para páginas
alojadas.

Se descartó una tabla `newsletter_series` propia con un canal espejo: la
sincronización en dos direcciones (renombrar, archivar, desactivar) es
exactamente donde aparecen los fallos silenciosos que este repositorio ya ha
pagado dos veces.

Se descartó un sistema de captación propio ajeno a `acquisition_channels`:
duplicaría intake, routing, dedup y analítica.

### 3.2 Una edición pertenece a un idioma

`newsletter_editions.language` es único por fila. Las traducciones son filas
hermanas unidas por `translation_group_id`.

**No** se copia el multi-idioma de `properties` (`descriptions` jsonb +
`content_languages`). Ahí funciona porque son tres campos cortos por idioma;
un artículo completo en tres idiomas dentro de un jsonb produce filas enormes y
un editor confuso.

### 3.3 El cuerpo son bloques, no HTML ni Markdown

`src/lib/newsletters/content.ts`, client-safe, mismo patrón que
`src/lib/email-content.ts`: el contenido se guarda estructurado y el HTML lo
compila el servidor al renderizar. **El HTML nunca se guarda.**

```
NewsletterContentSchema = { v: 1, blocks: Block[] }

Block =
  | { type: 'heading',   level: 2 | 3, text }
  | { type: 'paragraph', text, sourceIds?: string[] }
  | { type: 'list',      style: 'bullet' | 'number', items: string[] }
  | { type: 'image',     url, alt, caption? }
  | { type: 'quote',     text, attribution? }
  | { type: 'callout',   tone: 'info' | 'warning', text }
  | { type: 'stat',      label, value, sourceIds: string[] }   // sourceIds OBLIGATORIO
```

La razón no es estética. La página es pública, la sirve `anon`, y el texto lo
escribe una IA: guardar HTML obliga a sanear en cada render, y una fuga es XSS
en el escaparate del cliente. Con bloques el render es determinista y no hay
nada que sanear.

`EmailContent` no sirve: es un único campo de texto de 8.000 caracteres,
diseñado a propósito para que los correos parezcan escritos a mano.

### 3.4 Ningún número sin fuente

`newsletter_editions.sources` es un array de:

```
{ id, url, title, publisher, published_at, accessed_at }
```

Un bloque `stat` con `sourceIds` vacío **no pasa la validación de publicación**.
No es un aviso: el botón de publicar queda deshabilitado y la server action lo
rechaza. Si el modelo no consiguió respaldar un dato, el dato no sale.

`data_as_of` guarda la fecha a la que se refieren los datos de la edición. La
página pública la muestra. Un artículo sobre tasas hipotecarias de hace un año
no es contenido antiguo: es contenido falso, y sigue indexado con la cara del
cliente encima.

### 3.5 El suscriptor no contamina las bandas de calidad

`refresh_quality_bands()` calcula quintiles sobre todo lead en etapa `nuevo` o
`nutricion`. Un suscriptor entra con `fit_profile` vacío (`fit_score = 0`),
`form_baseline` +10, etapa `nuevo`: score ≈ 10.

Con 60 leads reales y 400 suscriptores, el percentil 80 cae de ~70 a ~15 y
**toda la cartera pasa a banda "alta"**. La banda de calidad —el mecanismo que
dirige la atención del agente— deja de significar nada, sin error y sin
síntoma.

Se aplica el patrón de la migración 080 (`is_imported`), cuya conclusión vale
literalmente aquí: *lo que falta no es una etapa nueva, es la procedencia*.

- Al crearse, el lead lleva `metadata.newsletter_subscriber = { at, channel_id, consent }`.
- **Y la prueba del consentimiento se guarda además en `metadata.newsletter_consent`,
  en clave propia.** Corregido durante la implementación: la graduación borra la
  clave `newsletter_subscriber` entera, así que una prueba que viviera solo dentro
  de esa marca se destruiría al graduar al lector — desde cuatro caminos distintos
  y sin dejar traza. Son dos hechos con vidas distintas: la procedencia caduca
  cuando el lector muestra intención, el consentimiento no caduca nunca.
  Un lead que ya existía por otra vía y se suscribe recibe `newsletter_consent`
  pero **no** la marca de procedencia: ya no es solo un lector.
- `leads_list` deriva `is_subscriber` como columna, igual que `is_imported`.
- `refresh_quality_bands()` excluye `is_subscriber` del cálculo de quintiles.
- El suscriptor **sí** cuenta en la analítica por fuente: ahí es donde aporta.

**La graduación hay que construirla.** *(Corregido durante la implementación:
este spec afirmaba que ya existía, y era falso.)* `assessLeadFit` se invoca hoy
desde el intake de formularios, el webhook de Resend al recibir una respuesta,
el formulario de contacto, y a mano desde la ficha del lead — todas señales de
intención. Pero `assessLeadFit` escribe `fit_profile` y **nunca toca
`metadata`**, así que no retira la marca: un suscriptor que mostrara intención
habría quedado fuera de los quintiles para siempre.

Hace falta un `graduateSubscriber(db, leadId)` best-effort que borre la clave
`newsletter_subscriber` (y solo esa), llamado desde esos mismos cuatro puntos.
La otra regla es una omisión: el intake de un canal `newsletter` no llama a
`assessLeadFit`.

El gate de gasto se expresa como **"¿tiene `fit_profile` con contenido?"**, no
como "¿es suscriptor?". Es la pregunta correcta, evita una rama condicional y
protege además el caso de un lead magnet mal configurado.

## 4. Esquema

### 4.1 Migración: `acquisition_channels`

```sql
alter table acquisition_channels drop constraint acquisition_channels_channel_type_valid;
alter table acquisition_channels add constraint acquisition_channels_channel_type_valid
  check (channel_type = any (array[
    'lead_magnet', 'event', 'contact_form', 'manychat_flow', 'manual', 'newsletter'
  ]));
```

Y la allowlist de fuentes del tenant (§5):

```sql
alter table tenants
  add column if not exists newsletter_source_domains text[];

comment on column tenants.newsletter_source_domains is
  'Dominios que la búsqueda web puede consultar como fuente al generar
   newsletters. Máximo 64. null = el tenant no puede generar con IA.';
```

### 4.2 Migración: `newsletter_editions`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid pk | |
| `tenant_id` | text not null | |
| `channel_id` | uuid not null → `acquisition_channels(id)` | la serie |
| `slug` | text not null | único por `(channel_id, slug)` |
| `title` | text not null | |
| `dek` | text | entradilla |
| `language` | text not null | mismo CHECK que `leads.language` |
| `translation_group_id` | uuid | ediciones hermanas |
| `cover_image_url` | text **not null** | portada obligatoria por esquema |
| `cover_source` | text | `upload` \| `studio` \| `ai` |
| `content` | jsonb not null | `NewsletterContentSchema` |
| `sources` | jsonb not null default `'[]'` | |
| `data_as_of` | date | |
| `status` | text not null default `'draft'` | `draft` \| `published` \| `archived` |
| `published_at` | timestamptz | |
| `ai_generated` | boolean not null default false | |
| `ai_run` | jsonb | modelo, tema pedido, coste, dominios usados |
| `unpublished_by_billing` | boolean not null default false | patrón de `properties` |
| `created_by_agent_id` | text | |
| `created_by_user_id` | uuid | |
| `created_at`, `updated_at` | timestamptz | |

Índices: `(tenant_id, channel_id, status)`, `(channel_id, slug)` único,
`(translation_group_id)`.

### 4.3 RLS y exposición pública

- Policy por `tenant_id` para `authenticated`, idéntica al resto de tablas.
- Policy `anon` limitada a `status = 'published'` **y**
  `unpublished_by_billing = false`.
- **Grants a nivel de columna** para `anon`: quedan vedadas `ai_run`,
  `created_by_agent_id`, `created_by_user_id`, `unpublished_by_billing`.
  Consecuencia obligatoria: la lectura pública selecciona columnas explícitas.
  Un `select('*')` devuelve 401.
- Toda lista de columnas se arma con `columns()` de
  `src/lib/supabase/columns.ts`, nunca con un string suelto.

### 4.4 Storage

Bucket público `newsletter-media`, patrón de `property-media`: subidas solo por
el cliente service-role.

**Al desplegar hay que añadir el host del bucket a `images.remotePatterns` del
`next.config.ts` del proyecto web.** `next/image` bloquea hosts no listados y
esto ya causó una falla silenciosa de imágenes con las propiedades.

### 4.5 Migración: exclusión de suscriptores

`leads_list` recreada añadiendo:

```sql
jsonb_exists(coalesce(l.metadata, '{}'::jsonb), 'newsletter_subscriber') as is_subscriber
```

`refresh_quality_bands()` recreada con el filtro adicional:

```sql
where l.stage not in ('en_proceso','cerrado','perdido')
  and not jsonb_exists(coalesce(l.metadata, '{}'::jsonb), 'newsletter_subscriber')
```

Tras la migración, regenerar tipos con `npm run types:db:sandbox`.

## 5. Pipeline de IA

Modelo: **`claude-sonnet-5`**. Decisión tomada con números (§10, análisis de
alternativas). Ya está en `MODEL_PRICING` de `ai-usage.ts` a precio de lista.

### Paso 1 — Investigación

Claude con la herramienta de servidor `web_search_20260209`, restringida por
`allowed_domains` a la **allowlist de fuentes del mercado del tenant**.

La lista se guarda en una columna nueva `tenants.newsletter_source_domains`
(text[], nullable) y se edita en **Ajustes → Tu negocio**, en la misma pestaña
que el resto del perfil, con el campo visible para todos y editable solo por
`super_admin` — mismo criterio que la pantalla de Scoring: el cliente ve el
criterio, ITMANO lo fija.

Un tenant sin lista declarada **no puede generar con IA**: el botón queda
deshabilitado con el motivo. Es deliberado — generar sin allowlist significaría
buscar en toda la web, que es justo lo que este diseño existe para evitar.
Ejemplos de lista:

| Mercado | Dominios permitidos |
|---|---|
| Hampton Roads, VA | `nar.realtor`, `fred.stlouisfed.org`, `redfin.com`, `zillow.com`, `census.gov` |
| Barcelona | `ine.es`, `idealista.com`, `bde.es`, `registradores.org` |

Límite de la herramienta: entre 1 y 64 hostnames, subdominios incluidos. Se
pasa `allowed_domains` **o** `blocked_domains`, nunca ambos.

Esto es lo que hace el sistema verificable por construcción y no por
instrucción: un dato que no esté en esas fuentes no se encuentra, y por tanto
no se puede citar. Es la diferencia entre una newsletter escrita con IA y una
newsletter que le puede costar la reputación al cliente.

Salida del paso: un dossier con hallazgos, cifras y la URL de cada uno.

### Paso 2 — Redacción

Claude con `output_config.format` sobre `NewsletterContentSchema`, alimentado
por el dossier y **sin acceso a la web**. La salida viene validada contra el
esquema de bloques.

Los dos pasos van separados por dos razones: la salida estructurada y las citas
de documento son mutuamente excluyentes en la API (devuelve 400 si se
combinan), y el dossier del paso 1 es cacheable entre ediciones del mismo mes.

### Paso 3 — Portada

Se genera **después** del texto, para que la pieza refleje el titular real.
Requiere añadir el formato apaisado al Estudio:

- `CANVAS` en `src/lib/studio/canvas.ts` gana `'16:9': { width: 1920, height: 1080 }`.
- `allowedZones` para `16:9`: `['top', 'bottom', 'left']`, como `1:1` y `4:5`.
- Una plantilla editorial nueva en `src/lib/studio/templates/`.

El Estudio gana el formato apaisado para todo, no solo para newsletters.

### Gates y contabilidad

- `assertAiWithinLimit` **antes** de gastar nada, en cada paso. Es el orden que
  ya respeta `studio/generate.ts`.
- `recordAiUsage` por paso, con el modelo real.
- Las búsquedas web se facturan aparte del token ($10 por 1.000 búsquedas).
  Hay que añadir esa unidad al ledger, igual que `IMAGE_UNIT_COST_USD` existe
  para Nano Banana.
- Coste estimado por edición completa: ≈ $0,30.
- La IA **nunca publica**. Devuelve siempre `status = 'draft'`.

## 6. Superficie pública

Subdominio `news.itmano.com`. Una entrada en `HOSTED_SUBDOMAIN_REWRITE` de
`src/lib/hosted-page.ts` (`news: '/nl'`); el rewrite por host del proxy ya lo
recoge sin cambios.

| URL pública | Ruta interna | Contenido |
|---|---|---|
| `news.itmano.com/<tenant>` | `/nl/[tenantSlug]` | Series del tenant |
| `.../<tenant>/<serie>` | `/nl/[tenantSlug]/[seriesSlug]` | Archivo + formulario |
| `.../<tenant>/<serie>/<edicion>` | `.../[editionSlug]` | Edición + fuentes + `data_as_of` |

ISR siguiendo el patrón de `src/app/(hosted)/web/[tenantSlug]/`:
`export const revalidate` **más** `generateStaticParams` — sin lo segundo, un
segmento dinámico no entra al manifiesto de prerender y el `revalidate` se
ignora en silencio. `generateStaticParams` devuelve `[]` si la lectura falla:
un build no debe caerse porque la base no responda.

`revalidatePath` en las server actions de publicar, editar y despublicar.

Un tenant con `pages_managed_by_itmano = true` sigue la regla existente:
`resolveChannelPageUrl` da prioridad a `metadata.page_url`. Cero lógica nueva.

## 7. UI del CRM

Ítem de nav **"Newsletters"**, después de Propiedades. Acceso: todos los roles
de tenant (`agent_owner`, `agent`) y `super_admin`. Un `agent` solo edita lo
que creó, con `requireSelfOrManager`, igual que en propiedades.

**Feature de plan.** Se añade `newsletters: boolean` a `PlanFeatures` en
`src/lib/plans.ts`: `false` en Esencial, `true` en Growth y Partner. El criterio
es el mismo que gobierna `customSendingDomain`: la newsletter consume
presupuesto de IA de forma recurrente y produce contenido publicado con la marca
del cliente, así que acompaña a los planes que ya incluyen dominio propio y
analítica completa. Un tenant Esencial ve el ítem de nav con el patrón de
upgrade que ya usa el resto del CRM, no una página rota.

**Degradación por billing.** `unpublished_by_billing` sigue exactamente el
mecanismo de `properties`: al caer la suscripción se despublica sin borrar, y al
restaurarse vuelve solo lo que esa columna marcó. Se engancha en el cron de
`api/cron/billing-lifecycle`, junto al de propiedades.

**Índice `/newsletters`** — series como tarjetas: nombre, secuencia vinculada,
nº de suscriptores, última edición, enlace a la página pública. La acción
principal es *Nueva edición*: se crean pocas series y muchas ediciones.

**Editor `/newsletters/[id]`** — dos columnas: bloques a la izquierda, vista
previa real a la derecha. Fijos arriba: portada, `data_as_of` y estado.

**Panel de fuentes** — lateral. Cada bloque `stat` sin fuente aparece marcado y
*Publicar* queda deshabilitado mientras quede uno.

**Modal "Generar con IA"** — tema (o "propón tú"), idioma, y la allowlist de
fuentes **a la vista**: el cliente debe ver de dónde va a salir su contenido.

**Formulario de suscripción** — reutiliza el hosted-form existente. Email +
nombre + casilla de consentimiento **explícita y no premarcada**. El texto
literal de la casilla, el timestamp y la URL de origen se guardan en
`metadata.newsletter_subscriber.consent`.

El RGPD no exige doble opt-in, tampoco en España, pero sí exige poder
**demostrar** el consentimiento (art. 7.1), y eso no se puede añadir
retroactivamente a una lista ya capturada. Por eso va desde el primer día.

El copy del formulario describe lo que la secuencia vinculada envía
realmente. **No promete una edición periódica por email**, porque en esta fase
no se envía (§10).

## 8. Voz y copy

Todo el copy de producto sigue las reglas de marca: español neutro latino,
"inversión" nunca "costo", sin emojis, estados vacíos serios.

El contenido de las newsletters lo escribe el tenant o la IA en el idioma de la
edición, y sigue el perfil de negocio del tenant, no las reglas de voz de
ITMANO.

## 9. Pruebas

**Unitarias** (`npm run test:unit`, sin BD):

- `NewsletterContentSchema`: acepta cada tipo de bloque, rechaza `stat` sin
  `sourceIds`, rechaza `v` desconocida.
- Validación de publicación: falla con portada ausente, con `stat` sin fuente,
  con `sources` que referencian ids inexistentes.
- Resolución de la allowlist de dominios: devuelve `null` (no lista vacía)
  cuando el tenant no tiene dominios declarados, trunca a 64 entradas, y
  rechaza entradas inválidas (IPs, TLD desnudo, nombres de una sola etiqueta,
  `localhost`), que la herramienta rechaza.
- Gate de plan: `newsletters` es false en Esencial y true en Growth y Partner.
- `CANVAS['16:9']` y `allowedZones('16:9')` — la geometría del Estudio ya se
  prueba aislada, se extiende esa suite.
- Compilador de bloques → HTML: escapa todo texto de usuario.

**Esquema** (`npm run test:schema`): la migración queda registrada y ambos
proyectos convergen. Vaciar las listas de excepciones al mergear.

**RLS** (`npm run test:rls`): un tenant no ve ediciones de otro; `anon` solo ve
publicadas; `anon` recibe 401 al pedir una columna vedada.

**Scoring** (`npm run test:scoring`): un lead con
`metadata.newsletter_subscriber` no entra en `refresh_quality_bands`; el mismo
lead, tras un evento de intención, sí cuenta.

## 10. Decisiones tomadas y notas de futuro

**Sin broadcast.** Enviar cada edición a toda la lista es un subsistema aparte:
audiencia, motor de envío por tandas, reintentos, respeto de `email_blocked` a
escala, métricas por edición y límites de Resend. El esquema admite añadirlo
después sin migración destructiva. Consecuencia inmediata: el copy del
formulario no puede prometer una edición periódica por email.

**SEO.** Alojar en `news.itmano.com` acumula la autoridad de dominio en
`itmano.com`, no en el dominio del cliente. Con propiedades da igual —el
catálogo es un escaparate transaccional—; con contenido editorial el SEO es el
activo. Servir bajo el dominio del tenant para Growth y Partner es una decisión
comercial pendiente, no un bug.

**Modelo.** Se evaluaron alternativas más baratas con datos de agosto de 2026.
Kimi K2.6 ($0.60/$2.50 por MTok) es ~5× más barato que Sonnet 5 y compite en
calidad de redacción; Qwen3.7 Flash baja a $0.03/$0.13. El ahorro real en este
caso de uso es ≈ $0,19 por edición: con 10 tenants publicando 4 al mes, unos
$7,60 mensuales. A cambio se perdería `allowed_domains` server-side —la pieza
que hace verificable el sistema—, habría que montar la búsqueda con un tercero
(Exa, Brave, Tavily) y mantener un proveedor más en `ai-usage.ts`. No compensa.

La cuenta se invierte si algún día se genera contenido en volumen (traducción
automática de cada edición a varios idiomas, o cientos de piezas al mes). La
vía de bajo compromiso para probarlo entonces es el AI Gateway de Vercel, donde
ya está desplegado el proyecto: acceso unificado con failover, sin integrar
cada SDK.

**Límites de plan.** `PlanLimits.leads` solo se usa hoy en
`src/app/(marketing)/planes/page.tsx`; los límites son contractuales, no se
aplican en código. Reinterpretarlos como **contactos de marketing** —contando
solo a quien recibe correo automatizado, y excluyendo importados dormidos,
`email_blocked` y bajas— alinea el precio con el coste y sigue el modelo de
HubSpot, donde los contactos que no reciben marketing son gratis. Es copy y
contrato, y va en su propio cambio, no en esta entrega.

Lo que **no** conviene es prometer análisis de IA ilimitado sobre contactos
ilimitados: guardar una fila no cuesta nada, pero analizarla sí, y ese es el
único coste que el CRM ya gobierna (`ai_monthly_limit_usd`). El análisis se
sigue rigiendo por el presupuesto de IA, no por el número de contactos.
