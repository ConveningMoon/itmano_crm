// Slugs de series y ediciones de newsletter. Puro y client-safe: vive fuera de
// actions.ts porque un archivo `'use server'` sólo puede exportar funciones
// asíncronas, y estas se prueban directamente.

/**
 * Longitud máxima del slug antes de uniquificar. Deja margen para el sufijo
 * `-<n>` que añade `uniqueSlug` sin pasarse del ancho razonable de una URL.
 */
const MAX_SLUG_LENGTH = 60

/**
 * Prefijo del slug de reserva. El esquema admite 19 idiomas y `slugify` sólo
 * conserva `[a-z0-9]`: "Рынок недвижимости", "市场报告" o un titular hecho sólo
 * de signos producen la cadena vacía, que no es un slug válido y dejaría la
 * página pública en una URL rota.
 */
const FALLBACK_PREFIX = 'nl'

/**
 * FNV-1a de 32 bits en base 36. No es criptográfico ni pretende serlo: sólo
 * garantiza que dos titulares distintos que no se pueden transliterar no
 * acaben compartiendo el mismo slug de reserva. Determinista — el mismo texto
 * da siempre el mismo token, que es lo que permite probarlo.
 */
function slugToken(raw: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

/**
 * Titular → slug. Nunca devuelve la cadena vacía: si tras quitar diacríticos y
 * todo lo que no sea `[a-z0-9]` no queda nada, cae a un identificador derivado
 * del propio texto (ver FALLBACK_PREFIX).
 */
export function slugify(raw: string): string {
  const base = raw
    // \u0300-\u036f = marcas diacriticas combinantes. Escritas con escape a
    // proposito: como caracteres literales son invisibles en el editor y no
    // sobreviven a un cambio de codificacion del archivo.
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '')

  if (base) return base

  const trimmed = raw.trim()
  return trimmed ? `${FALLBACK_PREFIX}-${slugToken(trimmed)}` : FALLBACK_PREFIX
}

/**
 * Primer slug libre a partir de `base`, dados los que ya están ocupados.
 *
 * Existe porque los dos índices únicos que gobiernan esto rechazan el
 * duplicado con un error crudo de Postgres, en inglés, en la cara del usuario:
 * `acquisition_channels_tenant_slug_unique` (global a TODOS los canales del
 * tenant, así que una serie "Contacto" choca con un formulario "Contacto") y
 * `newsletter_editions_channel_slug_idx` (por serie).
 *
 * Comprobar antes no elimina la carrera de dos inserciones simultáneas —para
 * eso está el índice y el mensaje traducido del llamador—, pero sí elimina el
 * caso corriente, que es el que un tenant se encuentra a diario.
 */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  if (!used.has(base)) return base

  for (let n = 2; n <= 200; n++) {
    const candidate = `${base}-${n}`
    if (!used.has(candidate)) return candidate
  }

  // 200 homónimos es un escenario que no existe; aun así no se devuelve un
  // slug que sabemos ocupado. El sufijo aleatorio cierra el caso sin bucle
  // infinito, y si aun así chocara, el índice lo rechaza y el llamador traduce.
  return `${base}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * ¿Este error de Postgres es una violación de unicidad? El cliente de Supabase
 * devuelve `code` sólo a veces (según el error venga de PostgREST o de la capa
 * de red), así que se mira también el mensaje.
 */
export function isUniqueViolation(error: { code?: string | null; message?: string | null }): boolean {
  if (error.code === '23505') return true
  const msg = error.message ?? ''
  return /duplicate key value|_unique|_slug_idx/i.test(msg)
}
