// Prompt de integración de los open houses: lo que el tenant le pega a su
// desarrollador (o a una IA) para mostrar la cuenta regresiva y el RSVP en SU
// propia web. Mismo papel que newsletter-integration-prompt.ts: el contrato se
// escribe una vez, aquí, y se genera con los datos vigentes.
//
// PURO: entra data, sale texto. El test compara PUBLIC_OPEN_HOUSE_COLUMNS con
// el GRANT de la migración para que el prompt nunca prometa una columna que
// `anon` no puede leer (el select entero fallaría con 401).

export const PUBLIC_OPEN_HOUSE_COLUMNS = [
  'id', 'tenant_id', 'property_id', 'starts_at', 'ends_at', 'timezone', 'public_notes',
  'rsvp_enabled', 'status', 'revision', 'updated_at',
] as const

export interface OpenHouseIntegrationInput {
  tenantName:   string
  tenantId:     string
  /** Base del CRM: endpoints de RSVP y calendario. */
  baseUrl:      string
  supabaseUrl:  string
  anonKey:      string
  /** Propiedad concreta desde la que se abrió el prompt (para el ejemplo). */
  propertyId:   string
  propertyName: string
  propertySlug: string | null
}

export function buildOpenHouseIntegrationPrompt(input: OpenHouseIntegrationInput): string {
  const fence = '```'
  const cols  = PUBLIC_OPEN_HOUSE_COLUMNS.join(',')

  return [
    `Estoy conectando la web de ${input.tenantName} con los open houses del CRM de`,
    'ITMANO. Quiero mostrar, en la ficha de cada propiedad, una CUENTA REGRESIVA al',
    'próximo open house y un formulario para confirmar asistencia (RSVP). Sigue este',
    'contrato exactamente.',
    '',
    '## 1) Leer los open houses',
    '',
    'Se leen con la clave anónima de Supabase, directo desde el navegador o desde tu',
    'servidor:',
    '',
    `${fence}bash`,
    `GET ${input.supabaseUrl}/rest/v1/open_houses`,
    `  ?select=${cols},properties(slug,name)`,
    `  &tenant_id=eq.${input.tenantId}`,
    '  &ends_at=gt.<ahora en ISO 8601, UTC>',
    '  &order=starts_at.asc',
    `apikey: ${input.anonKey}`,
    `Authorization: Bearer ${input.anonKey}`,
    fence,
    '',
    `Para una sola propiedad agrega \`&property_id=eq.<id>\`. Por ejemplo, para`,
    `"${input.propertyName}": \`&property_id=eq.${input.propertyId}\`` +
      (input.propertySlug ? ` (su slug es \`${input.propertySlug}\`).` : '.'),
    '',
    '### Pide las columnas una por una',
    '**Un `select=*` devuelve 401.** El acceso anónimo está limitado por columna: sólo',
    'las de la lista de arriba. Pedir otra tumba la consulta entera.',
    '',
    'Por filas, sólo existen para tu web los open houses CONFIRMADOS o CANCELADOS de',
    'propiedades publicadas. Un borrador no aparece: no hace falta filtrarlo.',
    '',
    '### Qué open house mostrar',
    'Por propiedad, el primero con `status = "scheduled"`. Si no hay ninguno pero sí',
    'uno con `status = "cancelled"`, muestra "Este open house fue cancelado" en vez de',
    'ocultarlo sin explicación. Si no hay ninguno, no muestres nada.',
    '',
    '## 2) La cuenta regresiva',
    '',
    '`starts_at` y `ends_at` vienen en UTC (ISO 8601). `timezone` es la zona IANA del',
    'LUGAR del evento (por ejemplo `America/New_York`): úsala para ESCRIBIR la fecha y',
    'la hora, no la zona del visitante — alguien que mira desde otro país tiene que',
    'leer la hora a la que abre la casa.',
    '',
    `${fence}js`,
    "const fecha = new Intl.DateTimeFormat('es', { timeZone: oh.timezone, dateStyle: 'full' }).format(new Date(oh.starts_at))",
    "const hora  = new Intl.DateTimeFormat('es', { timeZone: oh.timezone, timeStyle: 'short' }).format(new Date(oh.starts_at))",
    fence,
    '',
    'La cuenta regresiva se calcula contra `starts_at` en el navegador, cada segundo:',
    '',
    '  · antes de `starts_at` → días, horas, minutos y segundos restantes;',
    '  · entre `starts_at` y `ends_at` → "El open house está ocurriendo ahora";',
    '  · después de `ends_at` → oculta el bloque (ya no aparecerá en la consulta).',
    '',
    'Renderiza el primer valor en el servidor si puedes y deja que el cliente lo',
    'actualice: así el bloque no "salta" al cargar. Respeta `prefers-reduced-motion`',
    'si animas los números.',
    '',
    '`public_notes` son indicaciones públicas del agente (estacionamiento, acceso).',
    'Pueden venir vacías. Son texto plano: escápalas, no las pintes como HTML.',
    '',
    '## 3) Confirmar asistencia (RSVP)',
    '',
    'Muestra el formulario sólo si `rsvp_enabled = true` y el evento no está',
    'cancelado.',
    '',
    `${fence}bash`,
    `POST ${input.baseUrl}/api/open-houses/<id>/rsvp`,
    'Content-Type: application/json',
    fence,
    '',
    `${fence}json`,
    '{',
    '  "first_name": "string, requerido",',
    '  "last_name":  "string, opcional",',
    '  "email":      "string, requerido",',
    '  "phone":      "string, opcional",',
    '  "language":   "es | en | pt, por defecto es",',
    '  "response":   "yes | no, por defecto yes",',
    '  "guests":     "número de acompañantes, 0 a 10, opcional",',
    '  "website":    "honeypot: déjalo VACÍO"',
    '}',
    fence,
    '',
    'CORS abierto: se puede llamar desde el navegador. El campo `website` va oculto',
    'por CSS (no con `type="hidden"`) y vacío; si llega con contenido, el envío se',
    'descarta en silencio.',
    '',
    'Respuestas:',
    '',
    `${fence}json`,
    '{ "ok": true, "status": "created" | "updated" }',
    fence,
    '',
    '`created` = primera respuesta de esa persona a este open house; `updated` = ya',
    'había respondido y se actualizó. Con error llega `{ "ok": false, "error": "..." }`',
    'y un código: 404 (no existe o no es público), 409 (cancelado, terminado o sin',
    'RSVP), 400 (datos inválidos). Muestra el mensaje de `error`: ya viene en español.',
    '',
    'Qué pasa en el CRM: si el email no existe, se crea el lead y se le asigna al',
    'agente del open house; si existe, se le anota la respuesta. El agente recibe un',
    'aviso cuando alguien confirma.',
    '',
    '## 4) Agregar al calendario',
    '',
    `Enlaza a \`${input.baseUrl}/api/open-houses/<id>/ics\`: devuelve un archivo .ics`,
    'que se actualiza solo si el open house cambia de horario o se cancela (mismo UID,',
    'secuencia creciente).',
    '',
    '## 5) Caché',
    '',
    'Si cacheas la consulta, que sea como mucho 5 minutos. `revision` sube cada vez',
    'que el open house se reprograma y `updated_at` cambia con cualquier edición:',
    'úsalos para invalidar.',
  ].join('\n')
}
