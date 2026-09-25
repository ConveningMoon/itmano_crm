// Cómo se ESCRIBE un open house: fecha y hora en el idioma del lead y en la
// zona del evento, las variables de sus correos, y los enlaces de calendario.
// PURO: lo usan el despachador, la vista previa, la página pública y la ruta
// del .ics.

export const OPEN_HOUSE_MERGE_TAGS = [
  { tag: '{{customer_name}}',    label: 'Nombre del lead' },
  { tag: '{{agent_name}}',       label: 'Nombre del agente' },
  { tag: '{{property_name}}',    label: 'Nombre de la propiedad' },
  { tag: '{{property_address}}', label: 'Dirección' },
  { tag: '{{open_house_date}}',  label: 'Fecha del open house' },
  { tag: '{{open_house_time}}',  label: 'Horario del open house' },
  { tag: '{{open_house_notes}}', label: 'Indicaciones públicas' },
  { tag: '{{property_url}}',     label: 'Enlace a la propiedad' },
  { tag: '{{rsvp_url}}',         label: 'Enlace para confirmar asistencia' },
  { tag: '{{calendar_url}}',     label: 'Enlace para agregar al calendario' },
] as const

const INTL_LOCALE: Record<string, string> = {
  es: 'es-419',
  en: 'en-US',
  pt: 'pt-BR',
}

export function intlLocale(language: string): string {
  return INTL_LOCALE[language] ?? 'en-US'
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s
}

/** "Sábado, 3 de octubre de 2026" */
export function formatOpenHouseDate(startsAt: Date | string, timeZone: string, language: string): string {
  return capitalize(new Intl.DateTimeFormat(intlLocale(language), {
    timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(startsAt)))
}

/** "11:00 a. m. – 2:00 p. m. (EDT)" — la zona abreviada evita malentendidos. */
export function formatOpenHouseTime(
  startsAt: Date | string,
  endsAt:   Date | string,
  timeZone: string,
  language: string,
): string {
  const fmt = new Intl.DateTimeFormat(intlLocale(language), { timeZone, hour: 'numeric', minute: '2-digit' })
  const zone = new Intl.DateTimeFormat(intlLocale(language), { timeZone, timeZoneName: 'short' })
    .formatToParts(new Date(startsAt))
    .find(p => p.type === 'timeZoneName')?.value
  const range = `${fmt.format(new Date(startsAt))} – ${fmt.format(new Date(endsAt))}`
  return zone ? `${range} (${zone})` : range
}

export interface OpenHouseMergeInput {
  customerName:    string
  agentName:       string
  agentEmail:      string
  propertyName:    string
  propertyAddress: string
  startsAt:        Date | string
  endsAt:          Date | string
  timeZone:        string
  language:        string
  publicNotes:     string | null
  propertyUrl:     string
  rsvpUrl:         string
  calendarUrl:     string
}

/** Variables de un correo de open house (las de siempre más las del evento). */
export function buildOpenHouseMergeVars(i: OpenHouseMergeInput): Record<string, string> & {
  customer_name: string; agent_name: string; agent_email: string
} {
  return {
    customer_name:    i.customerName,
    agent_name:       i.agentName,
    agent_email:      i.agentEmail,
    property_name:    i.propertyName,
    property_address: i.propertyAddress,
    open_house_date:  formatOpenHouseDate(i.startsAt, i.timeZone, i.language),
    open_house_time:  formatOpenHouseTime(i.startsAt, i.endsAt, i.timeZone, i.language),
    open_house_notes: i.publicNotes ?? '',
    property_url:     i.propertyUrl,
    rsvp_url:         i.rsvpUrl,
    calendar_url:     i.calendarUrl,
  }
}

// ── Calendario ───────────────────────────────────────────────────────────────

/** 20261003T150000Z */
function icsStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function icsEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

// RFC 5545 §3.1: las líneas de más de 75 octetos se pliegan con CRLF + espacio.
function icsFold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const out: string[] = []
  let current = ''
  let size = 0
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length
    if (size + n > (out.length === 0 ? 75 : 74)) {
      out.push(current)
      current = ''
      size = 0
    }
    current += ch
    size += n
  }
  out.push(current)
  return out.join('\r\n ')
}

export interface CalendarEventInput {
  id:          string
  revision:    number
  title:       string
  location:    string
  description: string
  startsAt:    Date | string
  endsAt:      Date | string
  cancelled:   boolean
  url?:        string
}

/**
 * Archivo .ics del evento. UID estable y SEQUENCE = revisión: al reprogramar,
 * un cliente de calendario que ya lo tenía lo ACTUALIZA en vez de duplicarlo, y
 * STATUS:CANCELLED lo marca como cancelado.
 */
export function buildIcs(e: CalendarEventInput, now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ITMANO//Open House//ES',
    'CALSCALE:GREGORIAN',
    `METHOD:${e.cancelled ? 'CANCEL' : 'PUBLISH'}`,
    'BEGIN:VEVENT',
    `UID:open-house-${e.id}@itmano.com`,
    `SEQUENCE:${Math.max(0, e.revision - 1)}`,
    `DTSTAMP:${icsStamp(now)}`,
    `DTSTART:${icsStamp(new Date(e.startsAt))}`,
    `DTEND:${icsStamp(new Date(e.endsAt))}`,
    `SUMMARY:${icsEscape(e.title)}`,
    `LOCATION:${icsEscape(e.location)}`,
    `DESCRIPTION:${icsEscape(e.description)}`,
    ...(e.url ? [`URL:${e.url}`] : []),
    `STATUS:${e.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(icsFold).join('\r\n') + '\r\n'
}

/** Enlace "Agregar a Google Calendar". */
export function googleCalendarUrl(e: Omit<CalendarEventInput, 'id' | 'revision' | 'cancelled'>): string {
  const params = new URLSearchParams({
    action:   'TEMPLATE',
    text:     e.title,
    dates:    `${icsStamp(new Date(e.startsAt))}/${icsStamp(new Date(e.endsAt))}`,
    details:  e.description,
    location: e.location,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
