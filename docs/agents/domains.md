# Decisiones por dominio

## Email

`email_sends` es la fuente autoritativa. Las tasas se calculan por lead distinto,
no por número bruto de eventos. No se muestra open rate; reply rate requiere que
Resend Inbound y sus MX estén configurados.

`processSequenceRun` procesa una corrida por ID; el llamador determina
elegibilidad. El primer email se envía en proceso después de inscribir, no por
HTTP a la propia aplicación. Si falla, la inscripción permanece y el cron puede
reintentar.

Una secuencia se activa de tres formas (`email_sequences.activation_type`):

- `form` — el lead envía el formulario de un canal vinculado. Es el único tipo
  que auto-inscribe, y el guard de `enrollLeadInSequence` es positivo: comprueba
  que sea `form`, no que no sea otro.
- `manual` — alguien inscribe leads desde `/emails/[id]`.
- `tag` — la dispara una etiqueta del lead (ver *Etiquetas de leads*). Es un
  correo OBLIGATORIO, como los hitos del proceso de compra: no se borra ni admite
  inscripción manual, y no se puede enganchar a una fuente.

`/emails` separa las tres en pestañas (`?tab=secuencias|etiquetas|cierre`) porque
las obligatorias no se lanzan, se configuran: su pregunta es si está escrita la
versión de cada idioma.

La identidad de envío vive en el tenant:

- Esencial y trial: dominio compartido ITMANO con nombre visible del tenant.
- Growth y Partner: dominio propio verificado.
- Auth de Supabase usa la identidad común aprobada.

Todos los envíos leen `tenants.email_from_address`. No introduzcas remitentes de
A&J en código. Antes de cambiar envíos, revisa guards de `email_blocked`,
cancelación de secuencias, unsubscribe y reputación del dominio.

Las secuencias por etiqueta se crean automáticamente para cada combinación de
etiqueta obligatoria e idioma atendido; no dependen de que alguien pulse un alta
manual. La pestaña importa todo el catálogo en un único JSON identificado por
`tag_slug + language`, según el contrato de `src/lib/email-sequence-import.ts`.
`send_at_hours` representa horas acumuladas desde que se aplica la etiqueta y
la base lo convierte a `delay_hours` relativo. Las restricciones horarias son
independientes por combinación. Una secuencia con runs conserva su `step_order`
histórico y sólo admite por importación horarios posteriores al último paso.

No expongas rutas públicas de smoke test que acepten destinatario o HTML
arbitrarios. Usa una herramienta local o administrativa con allowlist, auditoría
y rate limit.

## Formularios

`form_submissions.answers` guarda un snapshot ordenado y autodescriptivo de
`{ key, question, value, label }`; no existe un esquema global de formularios.
PII primaria vive en `leads`, no se duplica en answers.

`form_submissions` sirve para visualizar el envío; `lead_events` es el log
append-only que alimenta scoring. Se escriben ambos.

- Lead único por `(tenant_id, email)`.
- Para lead magnets y eventos, submission único por `(lead_id, channel_id)`.
- Contact form, ManyChat y manual pueden registrar una fila por envío.

La importación CSV/XLSX acepta hasta 500 filas y las columnas documentadas en el
formulario de `leads/new`. Mantén escritura transaccional y rollback en fallo
parcial.

## Propiedades

`properties` alimenta el CRM y el sitio público. La exposición anónima requiere
dos capas: RLS sólo para `published_to_web=true` y grants únicamente sobre
columnas públicas. Un `select('*')` anónimo puede y debe fallar.

Los medios están en `property-media` y las subidas privilegiadas pasan por
servidor. Cuando otro host consuma imágenes, añádelo deliberadamente a
`images.remotePatterns` del proyecto correspondiente.

## Newsletters

Cada tenant tiene una newsletter implícita: una fila de
`acquisition_channels` con `channel_type='newsletter'`. No se modelan múltiples
series. La categoría de cada edición clasifica contenido, no crea otra audiencia
o secuencia.

La lectura pública combina policy de RLS y grants de columnas. Mantén
`PUBLIC_EDITION_COLUMNS` alineado con el grant real; verifícalo contra sandbox.

La firma separa persona y organización. `author_name`, `author_org_name` y
`author_avatar_url` se desnormalizan para congelar el estado de una edición
publicada. `author_agent_id` es interno. Sin foto, cada superficie deriva sus
iniciales; no lleves colores internos del CRM al sitio del cliente.

Las estadísticas viven en `src/lib/data/newsletter-stats.ts`; la atribución de un
suscriptor corresponde a la edición desde la que se registró.

## Carpetas

Las carpetas de `/sources` y `/emails` (migración 115) son **personales**: cada
usuario tiene las suyas y la organización de uno no se le impone a nadie más.
`folders.owner_user_id` es parte de la identidad de la carpeta y `folder_items`
guarda la pertenencia con dos FK anulables —`channel_id` o `sequence_id`—, así
que borrar una fuente o una secuencia limpia sus filas por cascada.

- `kind` separa los dos catálogos: `source` para fuentes, `sequence` para emails.
- Un elemento está en una sola carpeta por usuario (índices únicos parciales).
  Mover es "sacar de donde esté y volver a poner".
- Son una capa de VISTA, no de permisos: quién ve qué lo siguen decidiendo
  `scopeFor` y RLS. Por eso la página filtra primero y agrupa después
  (`groupByFolder`), y una carpeta nunca revela algo que el usuario no vería.
- Sus policies no siguen el patrón `is_super_admin() or tenant_id = ...` del
  resto del repo: filtran por dueño, porque una carpeta ajena no es asunto del
  super_admin.
- En `/sources` sólo agrupan en el tab "Todos". Los tabs por tipo y "Archivados"
  siguen mostrando listas planas.
- Borrar una carpeta no borra su contenido: los elementos vuelven a "Sin carpeta".

Fuente inicial: `src/lib/data/folders.ts`, `src/app/(dashboard)/folder-actions.ts`
y `src/components/dashboard/folders.tsx`.

## Etiquetas de leads

Las etiquetas (migración 116) son lo que una PERSONA decide sobre un lead:
"contactado sin respuesta", "pre-aprobado", "cliente de otro agente". No
duplican nada de lo que ya está modelado — `stage` lo mueve el embudo,
`quality_band` y `urgency` los calcula el scoring, y de dónde vino el lead lo
dicen `traffic_source` y `acquisition_channel_id`.

- Son del TENANT, no personales como las carpetas de la 115: disparan
  automatización y sostienen supervisión compartida, así que sus policies sí
  siguen el patrón `is_super_admin() or tenant_id = ...`. El insert de una
  asignación exige además que ese tenant sea dueño del lead y de la etiqueta.
- Etiquetar NO escribe un `lead_event`: el trigger de scoring refresca
  `last_event_at` en todo insert, y anotar "no contestó" marcaría al lead como
  recién activo. La fecha y el autor viven en la fila de asignación.
- No hay acción masiva. Una etiqueta puede mandar correos, así que etiquetar 180
  leads de un clic serían 180 correos reales. Asignar es por lead y el permiso es
  el de escritura del lead; el catálogo lo administran owner/super_admin.
- El `slug` es el identificador estable (viaja en `?tag=` de `/leads`) y
  renombrar NO lo recalcula. Un slug que ya no existe devuelve lista vacía, no la
  lista completa.
- `leads_list.tag_ids` agrega las etiquetas con una subconsulta escalar: los
  conteos de la cabecera no la pagan y el filtro se aplica sobre lo que ya pasó
  tenant, agente y etapa.
- El catálogo por defecto lo crea `seed_default_lead_tags(tenant)`, que también
  llama `createTenant`. Es configuración de producto, no de un cliente: no
  incluye ninguna etiqueta de procedencia (eso es `traffic_source`) ni de bloqueo
  de envíos (eso es `leads.email_blocked`).

`requires_sequence` marca las etiquetas que deben mandar correo. Cuáles son es un
DATO del tenant, no una lista en el código. Para esas, `email_sequences` lleva
una secuencia creada automáticamente por `(etiqueta, idioma)` con
`trigger_tag_id` (`on delete restrict`):

- El idioma se resuelve con `resolveLeadEmailLanguage`, la misma regla que los
  correos de cierre: el del lead si su agente lo atiende, inglés si no. Manda el
  agente porque firma el correo y recibe la respuesta.
- Si falta la versión de ese idioma, la etiqueta se pone y no se envía nada.
  Mandar en otro idioma es peor; el hueco se ve en `/emails?tab=etiquetas`.
- Quitar la etiqueta cancela la corrida activa (`cancelled_reason =
  'tag_removed'`).
- Las guardas del disparo son las de `enrollLeadInSequence` más dos propias:
  etapa dentro del embudo vivo e idioma disponible.

Fuente inicial: `src/lib/leads/tags.ts`, `src/lib/data/lead-tags.ts`,
`src/lib/services/enroll-lead-by-tag.ts` y `src/lib/data/tag-sequences.ts`.

## Open houses

Un open house es un evento con fecha que vive en una propiedad y se repite (la
misma casa se abre varios sábados), por eso tiene tabla propia
(`open_houses`, migración `open_houses`) y no es una fuente. Es el PRIMER envío
masivo del producto: todo lo demás sale lead por lead.

- Sólo lo usan tenants cuyos correos salen de su PROPIO dominio verificado
  (`resolveOpenHouseSender` → `usesSharedDomain`). Un anuncio desde el dominio
  compartido de ITMANO pondría en riesgo la entrega de todos los tenants. Se
  vuelve a comprobar en cada envío: un tenant que se degrada después de
  programar no manda nada.
- Cualquier rol crea un open house (las propiedades son visibles para todo el
  equipo); lo gestiona quien lo creó, el owner o ITMANO.
- Estados: `draft` → `scheduled` → `cancelled`. "Terminado" se deriva de
  `ends_at`. Un borrador no es público ni envía nada; se borra. Uno confirmado
  se reprograma o se cancela, nunca se edita en silencio.
- La audiencia del anuncio son leads con las etiquetas elegidas (`any`/`all`).
  Una lista vacía no selecciona a nadie. Los slugs preseleccionados
  (`pre-aprobado`, `contactado-sin-respuesta`) son del catálogo por defecto del
  producto; si el tenant los cambió, no se preselecciona nada.
- Hasta 3 idiomas (los de un lead: es, en, pt), cada correo con su versión por
  idioma: contenido del CRM (composer, con IA) o template de Resend. El lead
  recibe el suyo con `resolveLeadEmailLanguage`; sin versión, no recibe nada.
- Correos: `announcement` (a la audiencia), `reminder` (sólo a quien
  confirmó), `update` y `cancellation` (sólo a quien recibió el anuncio o
  respondió; nunca gente nueva). Reprogramar o cancelar DESPUÉS del anuncio
  exige escribir el aviso; antes, no se avisa a nadie. No se permite un cambio
  mientras algo se está enviando o hay un aviso pendiente (`planReschedule`,
  `planCancel`).
- Conflictos de agenda: un `EXCLUDE` impide dos open houses vivos solapados en
  la misma propiedad; el anuncio sale antes del inicio, el recordatorio
  después del anuncio y antes del inicio; una hora que no existe por cambio de
  horario se rechaza. Todo en `src/lib/open-houses/schedule.ts`.
- Envío: el anuncio "al confirmar" sale en proceso con `after()`; lo
  programado lo despacha la etapa 0 del orquestador horario
  (`dispatchDueOpenHouseEmails`, tope de 45 s por ejecución). Claim optimista,
  destinatarios congelados con PK `(email_id, lead_id)`, lotes de 100 por la
  API batch de Resend con `Idempotency-Key`, y un 429 o una excepción dejan el
  correo `pending` con el error visible. Cada envío escribe `email_sends`
  (`send_type = 'open_house'`) para que rebotes y bajas bloqueen al lead.
- No se escribe `lead_event` por envío (marcaría a cientos de leads como
  activos). Lo que puntúa es CONFIRMAR asistencia: `event_submission` (+20) una
  vez por open house (`dedup_key = open_house_rsvp:<id>`).
- RSVP: el enlace del correo abre `/web/<tenant>/rsvp/<token>` (firmado con
  `UNSUBSCRIBE_SECRET` y prefijo propio) y responde con un botón, nunca con el
  GET — los escáneres de enlaces visitan cada URL. La web usa
  `POST /api/open-houses/<id>/rsvp` (CORS abierto, honeypot); un email nuevo
  crea el lead para el agente del open house. `rsvp` es slug de propiedad
  reservado.
- Web: la ficha alojada (y su iframe) muestra la cuenta regresiva sola. La web
  propia lee `open_houses` con `anon` por columnas (`PUBLIC_OPEN_HOUSE_COLUMNS`,
  atado al GRANT por test) y sólo ve confirmados o cancelados de propiedades
  publicadas. El prompt para esa web lo genera `integration-prompt.ts`.

Fuente inicial: `src/lib/open-houses/*`, `src/lib/services/open-house-*.ts`,
`src/lib/data/open-houses.ts` y `src/app/(dashboard)/properties/open-house-actions.ts`.

## Archivos iniciales por área

| Área | Fuente inicial |
|---|---|
| Leads, agentes y canales | `src/lib/types.ts`, `src/lib/config.ts`, `src/lib/data/*.ts` |
| Planes y límites | `src/lib/plans.ts`, `src/lib/subscriptions.ts` |
| Perfil de negocio | `src/lib/business/profile.ts`, `src/lib/data/business-profile.ts` |
| Propiedades | `src/lib/data/properties.ts`, `src/lib/auth/guards.ts` |
| Newsletters | `src/lib/newsletters/*`, `src/lib/data/newsletters.ts` |
| Carpetas | `src/lib/data/folders.ts`, `src/app/(dashboard)/folder-actions.ts` |
| Etiquetas de leads | `src/lib/leads/tags.ts`, `src/lib/data/lead-tags.ts`, `src/lib/services/enroll-lead-by-tag.ts` |
| Open houses | `src/lib/open-houses/*`, `src/lib/services/open-house-dispatch.ts`, `src/app/(dashboard)/properties/open-house-actions.ts` |
| Auth y proxy | `src/proxy.ts`, `src/lib/auth/tenant-context.ts`, docs actuales de Supabase SSR |
| Migraciones/RLS | Última migración, skills Supabase y esquema real sandbox |
| Landing/legal | `src/app/(marketing)/`, `src/components/motion/README.md` |
