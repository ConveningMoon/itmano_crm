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
 * Las ÚNICAS columnas que `anon` puede leer (migración 105, grants por columna).
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
    '  "website":      "string, honeypot: déjalo VACÍO"',
    '}',
    fence,
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
    '`200` con `{ "ok": true }` cuando entra. Cualquier otro código trae `error` con',
    'el motivo. Reenviar el mismo email a tu newsletter no duplica: refresca al',
    'suscriptor existente.',
    '',
    '### Qué pasa después',
    input.hasSequence
      ? '  · El suscriptor entra en la secuencia de seguimiento vinculada a tu newsletter.'
      : '  · Tu newsletter no tiene secuencia vinculada todavía, así que el suscriptor sólo queda registrado. Se vincula desde el CRM, sin tocar tu web.',
    '  · Se registra como suscriptor, NO como prospecto: no ensucia el pipeline ni',
    '    las métricas de calidad de leads. Si esa misma persona rellena después un',
    '    formulario de contacto o descarga una guía, el CRM la asciende sola.',
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
    '### La categoría de cada edición no es pública',
    'En el CRM cada edición tiene una `category` (informativo, educativo, análisis',
    'o anuncio) para organizar el contenido. No está en la lista de columnas de',
    'arriba: `anon` no puede leerla hoy, así que no puedes filtrar ni mostrarla',
    'desde tu web con la clave anónima. Si la necesitas, pídesela a ITMANO — es un',
    'cambio en el grant del CRM, no algo que resuelvas desde tu lado.',
    '',
    '## 3) Errores que dan problemas',
    '  · `select=*` en la lectura → 401. Columnas explícitas siempre.',
    '  · Omitir `consent_text` → la suscripción se rechaza.',
    '  · Rellenar el honeypot `website` desde el código → el envío se descarta.',
    '  · Usar la clave `service_role` en el navegador → NUNCA. La anónima es la que',
    '    va en el front; es pública por diseño y está acotada por RLS.',
  ]

  return lines.join('\n')
}
