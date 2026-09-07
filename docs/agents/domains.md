# Decisiones por dominio

## Email

`email_sends` es la fuente autoritativa. Las tasas se calculan por lead distinto,
no por número bruto de eventos. No se muestra open rate; reply rate requiere que
Resend Inbound y sus MX estén configurados.

`processSequenceRun` procesa una corrida por ID; el llamador determina
elegibilidad. El primer email se envía en proceso después de inscribir, no por
HTTP a la propia aplicación. Si falla, la inscripción permanece y el cron puede
reintentar.

La identidad de envío vive en el tenant:

- Esencial y trial: dominio compartido ITMANO con nombre visible del tenant.
- Growth y Partner: dominio propio verificado.
- Auth de Supabase usa la identidad común aprobada.

Todos los envíos leen `tenants.email_from_address`. No introduzcas remitentes de
A&J en código. Antes de cambiar envíos, revisa guards de `email_blocked`,
cancelación de secuencias, unsubscribe y reputación del dominio.

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

## Archivos iniciales por área

| Área | Fuente inicial |
|---|---|
| Leads, agentes y canales | `src/lib/types.ts`, `src/lib/config.ts`, `src/lib/data/*.ts` |
| Planes y límites | `src/lib/plans.ts`, `src/lib/subscriptions.ts` |
| Perfil de negocio | `src/lib/business/profile.ts`, `src/lib/data/business-profile.ts` |
| Propiedades | `src/lib/data/properties.ts`, `src/lib/auth/guards.ts` |
| Newsletters | `src/lib/newsletters/*`, `src/lib/data/newsletters.ts` |
| Carpetas | `src/lib/data/folders.ts`, `src/app/(dashboard)/folder-actions.ts` |
| Auth y proxy | `src/proxy.ts`, `src/lib/auth/tenant-context.ts`, docs actuales de Supabase SSR |
| Migraciones/RLS | Última migración, skills Supabase y esquema real sandbox |
| Landing/legal | `src/app/(marketing)/`, `src/components/motion/README.md` |
