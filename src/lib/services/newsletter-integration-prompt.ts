// El prompt de integración de la newsletter de un tenant: lo que el tenant le
// pega a su desarrollador (o a una IA) para conectar su web con el CRM.
//
// Mismo papel que `integration-prompt.ts` cumple para lead magnets, eventos y
// formularios, y por el mismo motivo: el contrato se escribe UNA vez, aquí, y
// se genera desde los datos vigentes en cada lectura. Una segunda copia a mano
// —en un PDF, en un correo, en la cabeza de alguien— es la que se queda vieja.
//
// Puro y sin dependencias de servidor: entra data, sale texto. Así se puede
// probar el contrato sin levantar nada.

export interface NewsletterIntegrationInput {
  tenantName:   string
  /** El tenant, para filtrar la lectura pública por `tenant_id` en vez de por canal. */
  tenantId:     string
  /** acquisition_channels.public_id — la llave del endpoint de suscripción. */
  publicId:     string
  /** Base del CRM, para el endpoint de intake. */
  baseUrl:      string
  /** URL pública de la newsletter del tenant, o null si el tenant no tiene slug. */
  archiveUrl:   string | null
  /** URL del proyecto Supabase, para leer las ediciones publicadas. */
  supabaseUrl:  string
  /** Clave anónima (pública por diseño: viaja en cada página del CRM). */
  anonKey:      string
  /** true si la newsletter tiene una secuencia de seguimiento vinculada. */
  hasSequence:  boolean
}

/**
 * Las ÚNICAS columnas que `anon` puede leer: 15 de la migración 105 (grants por
 * columna) más `author_name` y `author_title`, que sumó la 111.
 *
 * `category` (migración 110) NO está aquí a propósito: el grant real sólo se la
 * da a `authenticated` y `service_role` (comprobado contra el sandbox). Añadirla
 * sería repetir el bug que este archivo existe para evitar — un campo que el
 * prompt promete y el servidor en realidad rechaza con 401.
 */
export const PUBLIC_EDITION_COLUMNS = [
  'id', 'tenant_id', 'channel_id', 'slug', 'title', 'dek', 'language',
  'translation_group_id', 'cover_image_url', 'content', 'sources',
  'data_as_of', 'status', 'published_at', 'created_at',
  'author_name', 'author_title',
] as const

export function buildNewsletterIntegrationPrompt(input: NewsletterIntegrationInput): string {
  const fence = '```'
  const columnas = PUBLIC_EDITION_COLUMNS.join(',')

  const lines: string[] = [
    `Estoy conectando la web de ${input.tenantName} con el sistema de newsletters`,
    'del CRM de ITMANO. Sigue este contrato exactamente: es todo lo que hace falta',
    'para captar suscriptores y, si quiere, mostrar las ediciones en el propio sitio.',
    '',
    '### Tu newsletter',
    `ID público: ${input.publicId}`,
    input.archiveUrl
      ? `Archivo público ya publicado por ITMANO: ${input.archiveUrl}`
      : 'Tu newsletter todavía no tiene archivo público (falta el slug del tenant).',
    '',
    '## 1) Formulario de suscripción',
    '',
    '### Endpoint',
    `POST ${input.baseUrl}/api/intake/${input.publicId}/submit`,
    'Content-Type: application/json',
    'CORS abierto (`Access-Control-Allow-Origin: *`). Se puede llamar directo desde',
    'el navegador. Está protegido por ID no adivinable + honeypot + validación de',
    'schema, no por origen.',
    '',
    '### Cuerpo (JSON)',
    `${fence}json`,
    '{',
    '  "first_name":   "string, requerido",',
    '  "last_name":    "string, opcional",',
    '  "email":        "string, requerido, email válido",',
    '  "language":     "es | en | pt, por defecto es",',
    '  "consent_text": "string, OBLIGATORIO en newsletters — ver abajo",',
    '  "source_url":   "string, opcional, la URL donde se suscribió",',
    '  "edition_id":   "uuid, opcional — ver abajo",',
    '  "visitor_id":   "string, opcional — ver abajo",',
    '  "website":      "string, honeypot: déjalo VACÍO"',
    '}',
    fence,
    '',
    '### `edition_id` y `visitor_id`',
    'Dos campos opcionales, pero cada uno resuelve un problema real si te falta:',
    '',
    '  · `edition_id` — el uuid de la edición desde la que se suscribe (sólo si el',
    '    formulario vive en la página de una edición, no en la portada). Es lo que',
    '    atribuye el suscriptor a la edición que lo captó; sin él, la métrica por',
    '    edición queda en cero aunque el total de suscriptores sea correcto.',
    '  · `visitor_id` — el endpoint lo acepta y lo valida, pero HOY NO LO USA PARA',
    '    NADA: no se cruza con la vista de la sección 3, no se guarda en el lead,',
    '    no une nada con nada — se valida y se descarta. Mandarlo es inofensivo,',
    '    pero no habilita ninguna métrica todavía. Si más adelante el CRM empieza a',
    '    correlacionar vistas con suscripciones, este mismo campo es donde llegaría;',
    '    hoy simplemente no pasa nada con él.',
    '',
    '### `consent_text` no es opcional aquí',
    'Manda el texto EXACTO que el usuario aceptó, palabra por palabra, tal y como',
    'estaba escrito junto a la casilla o al botón. Ejemplo:',
    '',
    `  "Acepto recibir la newsletter de ${input.tenantName} y entiendo que puedo darme de baja cuando quiera."`,
    '',
    'El CRM lo guarda como prueba del consentimiento junto a la fecha y la URL de',
    'origen. Sin este campo la suscripción se RECHAZA: no es una validación',
    'caprichosa, es lo que permite demostrar después que esa persona dijo que sí.',
    'No lo rellenes con un texto genérico desde el código — tiene que ser el mismo',
    'que se vio en pantalla.',
    '',
    '### Honeypot',
    'Incluye un campo `website` oculto por CSS (no con `type="hidden"`, que los bots',
    'también rellenan) y mándalo vacío. Si llega con contenido, el envío se descarta',
    'en silencio.',
    '',
    '### Respuesta',
    `${fence}json`,
    '{ "ok": true, "status": "created" | "already_submitted", "channel_type": "newsletter" }',
    fence,
    '`created` = alta nueva. `already_submitted` = ese email ya estaba suscrito (se',
    'refresca, nunca se duplica). Es lo que distingue "gracias por suscribirte" de "ya',
    'estabas suscrito" en tu propio copy — usa el campo, no adivines por el código',
    '`200`, que es el mismo en los dos casos. `channel_type` viene siempre en',
    '"newsletter" para este endpoint (es el tipo de este canal) — no hace falta que',
    'lo leas, pero está ahí porque el mismo endpoint sirve a otros tipos de canal.',
    'Cualquier otro código trae `error` con el motivo.',
    '',
    '### Qué pasa después',
    input.hasSequence
      ? '  · El suscriptor entra en la secuencia de seguimiento vinculada a tu newsletter.'
      : '  · Tu newsletter no tiene secuencia vinculada todavía, así que el suscriptor sólo queda registrado. Se vincula desde el CRM, sin tocar tu web.',
    '  · Se registra como suscriptor, NO como prospecto: no ensucia el pipeline ni',
    '    las métricas de calidad de leads. Si esa misma persona rellena después un',
    '    formulario de contacto o descarga una guía, el CRM la asciende sola.',
    '  · El canal NO envía las ediciones por correo. Lo único que dispara la',
    '    suscripción es la entrada a esa secuencia (o nada, si todavía no tiene una),',
    '    y una secuencia nace vacía: no prometas en tu formulario que la persona va a',
    '    recibir la newsletter por email a menos que tú mismo configures esa entrega.',
    '',
    '## 2) Mostrar las ediciones en tu propia web (opcional)',
    '',
    `Si no quieres esto, ya está: enlaza a ${input.archiveUrl ?? 'la página pública de tu newsletter'} y salta esta sección.`,
    '',
    'Las ediciones publicadas se leen con la clave anónima de Supabase:',
    '',
    `${fence}bash`,
    `GET ${input.supabaseUrl}/rest/v1/newsletter_editions`,
    `  ?select=${columnas}`,
    `  &tenant_id=eq.${input.tenantId}`,
    '  &status=eq.published',
    '  &order=published_at.desc',
    'apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>',
    `Authorization: Bearer ${input.anonKey}`,
    fence,
    '',
    '### La regla que rompe a todo el mundo la primera vez',
    '**Pide las columnas una por una. Un `select=*` devuelve 401.**',
    'El acceso anónimo está limitado POR COLUMNA además de por fila: `anon` sólo',
    'puede leer las de arriba. Pedir una que no esté en la lista tumba la consulta',
    'entera, no la omite.',
    '',
    'Por filas, `anon` sólo ve ediciones con `status = "published"` y no degradadas',
    'por facturación. Una edición en borrador o archivada simplemente no existe para',
    'tu web: no hace falta que la filtres tú.',
    '',
    '### El campo `content`',
    'Es JSON con la forma `{ "v": 1, "blocks": [...] }`. Cada bloque trae un `type`',
    '(`heading`, `paragraph`, `list`, `image`, `quote`, `callout`, `stat`) y sus',
    'campos. Los bloques `stat` llevan `sourceIds` que apuntan a entradas de',
    '`sources`: si publicas una cifra, publica también su fuente — el sistema entero',
    'existe para que cada dato sea verificable.',
    '',
    '### La firma: `author_name` y `author_title`',
    '`author_name` trae la firma de la edición — píntala con marcado de autor (un',
    '`rel="author"`, un `<address>`, o el `author` de tu propio JSON-LD) en vez de',
    'como texto suelto: es la señal que un buscador necesita para atribuir el',
    'contenido a una persona en vez de a la página. `author_title` está en esta',
    'misma lista y ES pública, pero HOY SIEMPRE LLEGA VACÍA — reserva el campo en tu',
    'plantilla sin depender de que traiga nada por ahora; el día que un agente',
    'declare su cargo, empezará a poblarse sin que cambies tu lado.',
    '',
    '### `translation_group_id`: ediciones traducidas',
    'Las traducciones de una misma edición comparten este uuid, una fila por',
    'idioma (`language`). Puede venir vacío — significa que esa edición no tiene',
    'traducciones. Recomendación: agrupa las filas que compartan el mismo valor y',
    'muéstrale al visitante la que coincida con el idioma de su navegador, con las',
    'demás como alternativa.',
    '',
    '### La categoría de cada edición no es pública',
    'En el CRM cada edición tiene una `category` (informativo, educativo, análisis',
    'o anuncio) para organizar el contenido. No está en la lista de columnas de',
    'arriba: `anon` no puede leerla hoy, así que no puedes filtrar ni mostrarla',
    'desde tu web con la clave anónima. Si la necesitas, pídesela a ITMANO — es un',
    'cambio en el grant del CRM, no algo que resuelvas desde tu lado.',
    '',
    '### Revalidación: no hay webhook',
    'Al publicar o editar una edición, ITMANO revalida sus PROPIAS páginas alojadas',
    '(news.itmano.com) — no avisa a ningún sitio externo. Si lees estas columnas',
    'para renderizar tu propia página, ITMANO no te notifica cuándo cambia el',
    'contenido: la estrategia de refresco (ISR con un intervalo corto, revalidación',
    'bajo demanda desde tu propio panel, o leer siempre en el momento de la visita)',
    'la decides tú.',
    '',
    '## 3) Medir las lecturas (si alojas las ediciones en tu dominio)',
    '',
    'Sin esta llamada, "Vistas" queda en cero PARA SIEMPRE para cualquier edición',
    'que muestres en tu propia web — el CRM no tiene otra forma de saber que alguien',
    'la leyó ahí.',
    '',
    `${fence}bash`,
    `POST ${input.baseUrl}/api/newsletters/view`,
    'Content-Type: text/plain',
    '',
    '{ "editionId": "<uuid de la edición>", "visitorId": "<el mismo itmano_visitor_id>" }',
    fence,
    '',
    '`visitorId` aquí SÍ hace algo — a diferencia del campo del mismo nombre en el',
    'formulario de suscripción (sección 1), donde el servidor lo descarta sin usarlo.',
    'Aquí es la huella con la que se deduplica: como mucho una vista por visitante y',
    'por edición cada 24 horas, para que recargar la página no infle el conteo. Usa',
    'la misma clave estable que ya usa el formulario propio del CRM (`localStorage`,',
    '`itmano_visitor_id`) para que un mismo visitante no cuente dos veces. Sin',
    '`visitorId` la vista NO se registra EN ABSOLUTO — el servidor la descarta antes',
    'de tocar la base de datos.',
    '',
    'Dispárala una vez por vista, con `keepalive: true` para que no se corte si el',
    'visitante navega a otra página antes de que termine:',
    '',
    `${fence}js`,
    `fetch('${input.baseUrl}/api/newsletters/view', {`,
    '  method: "POST",',
    '  headers: { "Content-Type": "text/plain" },',
    '  body: JSON.stringify({ editionId, visitorId }),',
    '  keepalive: true,',
    '})',
    fence,
    '',
    '`text/plain` + sin headers custom es a propósito: es lo que mantiene la',
    'llamada como "simple request" y evita el preflight de CORS, que un `fetch` con',
    '`keepalive` no siempre puede completar a tiempo. El servidor SÍ recibe y procesa',
    'la petición — la vista se cuenta igual —, pero como esta ruta no manda',
    '`Access-Control-Allow-Origin`, el navegador no te deja LEER la respuesta desde',
    'un dominio cruzado: vas a ver el propio `fetch` fallar (`TypeError: Failed to',
    'fetch` en la consola) aunque la vista sí se haya registrado. No es un bug tuyo',
    'ni nuestro — dispárala y olvídala (`.catch(() => {})`), igual que hace el propio',
    'CRM en sus páginas alojadas, y no intentes leer el cuerpo ni el código de estado.',
    '',
    '## 4) Canonical: quién es el original (opcional)',
    '',
    'Si NO muestras las ediciones en tu dominio, salta esta sección — ITMANO ya',
    'declara su propia página como canónica y no hay nada que configurar.',
    '',
    'Si SÍ las muestras, repórtale a ITMANO la plantilla de tu URL en Ajustes → Tu',
    'negocio → "Dirección de tus ediciones en tu web", con `{slug}` en el lugar',
    'exacto donde tu ruta pone el identificador de la edición:',
    '',
    '  https://tusitio.com/newsletter/{slug}',
    '',
    'Con eso configurado, ITMANO apunta el `rel="canonical"` de sus propias páginas',
    'a las tuyas y RETIRA esas ediciones de su sitemap. A cambio, la responsabilidad',
    'de que Google encuentre esas páginas pasa a ser tuya: inclúyelas en tu propio',
    'sitemap. Sin este paso, ambos sitios sirven el mismo contenido y ninguno de los',
    'dos se queda con el posicionamiento completo.',
    '',
    '## 5) Errores que dan problemas',
    '  · `select=*` en la lectura → 401. Columnas explícitas siempre.',
    '  · Omitir `consent_text` → la suscripción se rechaza.',
    '  · Rellenar el honeypot `website` desde el código → el envío se descarta.',
    '  · Usar la clave `service_role` en el navegador → NUNCA. La anónima es la que',
    '    va en el front; es pública por diseño y está acotada por RLS.',
  ]

  return lines.join('\n')
}
