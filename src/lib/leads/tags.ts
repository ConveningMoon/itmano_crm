// Contrato de las etiquetas de leads: tipos, paleta, slug y validación.
//
// Vive aparte de src/lib/data/lead-tags.ts porque esto es puro y lo comparten el
// servidor y el cliente; el módulo de datos importa Supabase y es server-only.
//
// Qué es una etiqueta y qué no: un hecho que una persona decide sobre el lead
// ("lo contacté y no contestó", "está pre-aprobado"). La etapa la mueve el
// embudo, la calidad y la urgencia las calcula el scoring, y la procedencia ya
// la modelan `traffic_source` / `acquisition_channel_id`. Ver la cabecera de la
// migración 116 para el razonamiento completo.

/** Fila del catálogo, tal como la usan la lista, la ficha y Configuración. */
export interface LeadTag {
  id:          string
  name:        string
  slug:        string
  color:       string
  description: string | null
  position:    number
}

/** Lo mínimo para resolver el filtro de la URL. */
export type TagRef = Pick<LeadTag, 'id' | 'slug'>

export const TAG_NAME_MAX        = 40
export const TAG_DESCRIPTION_MAX = 200

// Paleta de la app (globals.css). Se ofrece cerrada y no un color picker libre:
// un chip con un color arbitrario deja de ser legible sobre el fondo oscuro, y
// el valor de un chip es que se reconozca de un vistazo.
export const TAG_COLORS = [
  { value: '#C97B6B', label: 'Coral'    },
  { value: '#C9A96E', label: 'Dorado'   },
  { value: '#6BA368', label: 'Verde'    },
  { value: '#5AAFA0', label: 'Turquesa' },
  { value: '#5B8EC9', label: 'Azul'     },
  { value: '#9B72CF', label: 'Violeta'  },
  { value: '#B87BA3', label: 'Rosa'     },
  { value: '#8A8A8A', label: 'Gris'     },
] as const

export const DEFAULT_TAG_COLOR = '#8A8A8A'

export function isValidTagColor(color: string): boolean {
  return TAG_COLORS.some(c => c.value.toLowerCase() === color.toLowerCase())
}

// Slug a partir del nombre. Es el identificador estable: viaja en la URL de
// /leads y sobrevive a que se renombre la etiqueta, así que sólo se calcula al
// crearla — renombrar NO lo recalcula, o los enlaces guardados se romperían.
export function slugifyTag(name: string): string {
  return name
    .normalize('NFD')
    // Marcas diacríticas: "Pre-aprobación" → "pre-aprobacion".
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    // Un recorte a 60 puede dejar el guion al final.
    .replace(/-+$/, '')
}

export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

export interface TagNameCheck {
  ok:    boolean
  error?: string
}

// Mismas reglas que los CHECK de la 116, para dar el error antes del viaje a la
// base y con un mensaje que se pueda leer.
export function checkTagName(raw: string): TagNameCheck {
  const name = normalizeTagName(raw)
  if (name.length === 0)          return { ok: false, error: 'La etiqueta necesita un nombre.' }
  if (name.length > TAG_NAME_MAX) return { ok: false, error: `El nombre no puede pasar de ${TAG_NAME_MAX} caracteres.` }
  // Un nombre que sólo tiene símbolos produce un slug vacío, que la base
  // rechazaría con un error de constraint ilegible.
  if (slugifyTag(name).length === 0) {
    return { ok: false, error: 'El nombre necesita al menos una letra o un número.' }
  }
  return { ok: true }
}

// ─── Filtro de la lista ───────────────────────────────────────────────────────

export interface TagFilterPlan {
  tagId: string | null
  // true cuando el slug de la URL no existe en el catálogo del tenant → la lista
  // es vacía sin ir a la base (mismo criterio que planSourceFilter).
  impossible: boolean
}

export function planTagFilter(slug: string, tags: TagRef[]): TagFilterPlan {
  if (slug === 'all') return { tagId: null, impossible: false }
  const match = tags.find(t => t.slug === slug)
  return match ? { tagId: match.id, impossible: false } : { tagId: null, impossible: true }
}

// ─── Render ───────────────────────────────────────────────────────────────────

// Fondo y borde de un chip a partir de su color. color-mix en vez de un rgba()
// guardado aparte: así el fondo no puede quedar desfasado del texto (mismo
// criterio que STAGE_CONFIG en scoring/priority).
export function tagChipStyle(color: string): {
  color: string; background: string; border: string
} {
  return {
    color,
    background: `color-mix(in srgb, ${color} 12%, transparent)`,
    border:     `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
  }
}
