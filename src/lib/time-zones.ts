// Zonas horarias legibles para el CRM. Módulo PURO (servidor y cliente).
//
// Una lista de 400 identificadores IANA ordenados alfabéticamente
// ("America/Kentucky/Monticello"…) es imposible de usar: nadie sabe que su
// ciudad está bajo "America/New_York". Aquí vive una lista CURADA con nombres
// que un agente reconoce, agrupada por región, y la deducción de la zona a
// partir de las zonas de trabajo que el negocio ya declaró en su perfil.

export interface TimeZoneOption {
  id:    string
  label: string
}

export interface TimeZoneGroup {
  region: string
  zones:  TimeZoneOption[]
}

export const COMMON_TIME_ZONES: TimeZoneGroup[] = [
  {
    region: 'Estados Unidos',
    zones: [
      { id: 'America/New_York',    label: 'Este — Nueva York, Florida, Virginia, Carolinas, Georgia' },
      { id: 'America/Chicago',     label: 'Centro — Texas, Illinois, Tennessee, Luisiana' },
      { id: 'America/Denver',      label: 'Montaña — Colorado, Utah, Nuevo México' },
      { id: 'America/Phoenix',     label: 'Arizona (sin horario de verano)' },
      { id: 'America/Los_Angeles', label: 'Pacífico — California, Nevada, Washington, Oregón' },
      { id: 'America/Anchorage',   label: 'Alaska' },
      { id: 'Pacific/Honolulu',    label: 'Hawái' },
      { id: 'America/Puerto_Rico', label: 'Puerto Rico' },
    ],
  },
  {
    region: 'México, Centroamérica y Caribe',
    zones: [
      { id: 'America/Mexico_City',    label: 'Ciudad de México, Guadalajara, Monterrey' },
      { id: 'America/Cancun',         label: 'Cancún, Quintana Roo' },
      { id: 'America/Tijuana',        label: 'Tijuana, Baja California' },
      { id: 'America/Guatemala',      label: 'Guatemala' },
      { id: 'America/El_Salvador',    label: 'El Salvador' },
      { id: 'America/Costa_Rica',     label: 'Costa Rica' },
      { id: 'America/Panama',         label: 'Panamá' },
      { id: 'America/Santo_Domingo',  label: 'República Dominicana' },
    ],
  },
  {
    region: 'Sudamérica',
    zones: [
      { id: 'America/Bogota',                  label: 'Colombia' },
      { id: 'America/Lima',                    label: 'Perú' },
      { id: 'America/Caracas',                 label: 'Venezuela' },
      { id: 'America/Santiago',                label: 'Chile' },
      { id: 'America/Argentina/Buenos_Aires',  label: 'Argentina' },
      { id: 'America/Sao_Paulo',               label: 'Brasil — São Paulo, Río de Janeiro' },
    ],
  },
  {
    region: 'Europa',
    zones: [
      { id: 'Europe/Madrid', label: 'España (península)' },
      { id: 'Europe/Lisbon', label: 'Portugal' },
      { id: 'Europe/London', label: 'Reino Unido' },
    ],
  },
]

const CURATED = new Map(COMMON_TIME_ZONES.flatMap(g => g.zones.map(z => [z.id, z.label] as const)))

export function isCuratedTimeZone(id: string): boolean {
  return CURATED.has(id)
}

/** Desfase actual de una zona, p. ej. "UTC−4". Cambia con el horario de verano. */
export function utcOffsetLabel(timeZone: string, at: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
      .formatToParts(at)
      .find(p => p.type === 'timeZoneName')?.value ?? ''
    // "GMT-4" → "UTC−4"; "GMT" → "UTC"
    return part.replace('GMT', 'UTC').replace('-', '−')
  } catch {
    return ''
  }
}

/** Nombre legible de una zona: la etiqueta curada o el identificador IANA. */
export function timeZoneLabel(id: string): string {
  return CURATED.get(id) ?? id.replace(/_/g, ' ')
}

// ── Deducción desde las zonas del negocio ────────────────────────────────────
//
// El perfil guarda zonas en texto libre ("Virginia Beach", "Norfolk, VA",
// "Miami"). Sin geocodificar, lo más fiable es buscar el ESTADO o el país en el
// texto. Es una sugerencia: el perfil tiene su propio campo de zona horaria,
// que siempre gana.

const US_STATES: [string[], string][] = [
  [['virginia', 'va', 'north carolina', 'nc', 'south carolina', 'sc', 'new york', 'ny', 'new jersey', 'nj',
    'florida', 'fl', 'georgia', 'ga', 'maryland', 'md', 'delaware', 'de', 'pennsylvania', 'pa', 'ohio', 'oh',
    'michigan', 'mi', 'massachusetts', 'ma', 'connecticut', 'ct', 'rhode island', 'ri', 'vermont', 'vt',
    'new hampshire', 'nh', 'maine', 'me', 'west virginia', 'wv', 'district of columbia', 'dc', 'washington dc',
    'miami', 'orlando', 'tampa', 'atlanta', 'charlotte', 'raleigh', 'boston', 'philadelphia', 'baltimore',
    'norfolk', 'chesapeake', 'richmond', 'jacksonville'], 'America/New_York'],
  [['texas', 'tx', 'illinois', 'il', 'tennessee', 'tn', 'louisiana', 'la', 'alabama', 'al', 'mississippi', 'ms',
    'arkansas', 'ar', 'missouri', 'mo', 'iowa', 'ia', 'minnesota', 'mn', 'wisconsin', 'wi', 'oklahoma', 'ok',
    'kansas', 'ks', 'nebraska', 'ne', 'houston', 'dallas', 'austin', 'san antonio', 'chicago', 'nashville',
    'new orleans'], 'America/Chicago'],
  [['colorado', 'co', 'utah', 'ut', 'new mexico', 'nm', 'wyoming', 'wy', 'montana', 'mt', 'denver',
    'salt lake city', 'albuquerque'], 'America/Denver'],
  [['arizona', 'az', 'phoenix', 'scottsdale', 'tucson'], 'America/Phoenix'],
  [['california', 'ca', 'nevada', 'nv', 'oregon', 'or', 'washington', 'wa', 'los angeles', 'san diego',
    'san francisco', 'las vegas', 'seattle', 'portland'], 'America/Los_Angeles'],
  [['alaska', 'ak'], 'America/Anchorage'],
  [['hawaii', 'hawái', 'hi', 'honolulu'], 'Pacific/Honolulu'],
  [['puerto rico', 'pr', 'san juan'], 'America/Puerto_Rico'],
  [['cancún', 'cancun', 'quintana roo', 'playa del carmen', 'tulum'], 'America/Cancun'],
  [['tijuana', 'baja california'], 'America/Tijuana'],
  [['méxico', 'mexico', 'cdmx', 'guadalajara', 'monterrey', 'querétaro', 'queretaro', 'puebla'], 'America/Mexico_City'],
  [['colombia', 'bogotá', 'bogota', 'medellín', 'medellin', 'cali', 'barranquilla', 'cartagena'], 'America/Bogota'],
  [['perú', 'peru', 'lima'], 'America/Lima'],
  [['chile', 'santiago'], 'America/Santiago'],
  [['argentina', 'buenos aires'], 'America/Argentina/Buenos_Aires'],
  [['brasil', 'brazil', 'são paulo', 'sao paulo', 'rio de janeiro'], 'America/Sao_Paulo'],
  [['españa', 'espana', 'spain', 'madrid', 'barcelona', 'valencia', 'málaga', 'malaga', 'sevilla'], 'Europe/Madrid'],
  [['portugal', 'lisboa', 'lisbon', 'porto'], 'Europe/Lisbon'],
  [['panamá', 'panama'], 'America/Panama'],
  [['costa rica'], 'America/Costa_Rica'],
  [['república dominicana', 'republica dominicana', 'santo domingo', 'punta cana'], 'America/Santo_Domingo'],
]

function normalize(s: string): string {
  return ` ${s.toLowerCase().replace(/[.,;/()]+/g, ' ').replace(/\s+/g, ' ').trim()} `
}

// Frases largas primero: "west virginia" antes que "virginia", "new mexico"
// antes que "mexico", "california" antes que "cali".
const NAMES = US_STATES
  .flatMap(([keys, tz]) => keys.filter(k => k.length > 2).map(k => [k, tz] as const))
  .sort((a, b) => b[0].length - a[0].length)
const ABBREVIATIONS = US_STATES
  .flatMap(([keys, tz]) => keys.filter(k => k.length === 2).map(k => [k.toUpperCase(), tz] as const))

/**
 * Zona horaria deducida de una lista de zonas de trabajo. Las siglas de estado
 * sólo cuentan escritas en MAYÚSCULAS y como palabra suelta ("Norfolk, VA"):
 * en minúscula chocarían con palabras del español ("playa de…" no es
 * Delaware). Devuelve null si ninguna zona da una pista clara.
 */
export function inferTimeZoneFromAreas(areas: readonly string[]): string | null {
  for (const area of areas) {
    const text = normalize(area)
    for (const [name, tz] of NAMES) {
      if (text.includes(` ${name} `) || text.includes(` ${name}`)) return tz
    }
    for (const [abbr, tz] of ABBREVIATIONS) {
      if (new RegExp(`(^|[^A-Za-z])${abbr}([^A-Za-z]|$)`).test(area)) return tz
    }
  }
  return null
}

/**
 * La zona horaria del negocio: la configurada en el perfil; si no hay, la
 * deducida de la zona principal; si tampoco, null (y quien llama decide).
 */
export function businessTimeZone(profile: { timezone: string | null; primaryAreas: readonly string[] }): string | null {
  return profile.timezone || inferTimeZoneFromAreas(profile.primaryAreas)
}
