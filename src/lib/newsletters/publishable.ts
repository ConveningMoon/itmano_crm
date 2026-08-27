import type { NewsletterContent, NewsletterSource } from './content'

// Qué impide publicar una edición. Puro y client-safe: el editor pinta estos
// bloqueos mientras se escribe y la server action los vuelve a evaluar antes de
// escribir en la base. Las dos puertas usan ESTA función — un check de UI que el
// servidor no repite no es un check.

export interface PublishableInput {
  title:         string
  coverImageUrl: string | null
  content:       NewsletterContent | null
  sources:       NewsletterSource[]
}

export interface PublishBlocker {
  code:   'no_cover' | 'portada_placeholder' | 'no_title' | 'stat_sin_fuente'
        | 'fuente_inexistente' | 'contenido_invalido'
  detail: string
}

/**
 * La portada con la que nace toda edición generada con IA, porque
 * `cover_image_url` es NOT NULL y la portada propia se genera después.
 *
 * Vive aquí y no en la server action porque quien la pone y quien la bloquea
 * tienen que estar mirando exactamente el mismo literal: es el banner de
 * ITMANO, y el producto es white-label. Publicar con él pone el logo de ITMANO
 * en el escaparate público del cliente, bajo su propio dominio y su marca. No
 * es un descuido estético, es una fuga de marca — por eso es un bloqueo de
 * publicación y no un aviso.
 *
 * RUTA RELATIVA a propósito: las páginas públicas la pintan con `next/image`,
 * que valida cualquier `src` que no empiece por `/` contra
 * `images.remotePatterns`.
 */
export const PLACEHOLDER_COVER_URL = '/itmano_banner.webp'

export function publishBlockers(input: PublishableInput): PublishBlocker[] {
  const blockers: PublishBlocker[] = []

  if (!input.title.trim()) {
    blockers.push({ code: 'no_title', detail: 'La edición necesita un titular.' })
  }
  // La portada es obligatoria también en el esquema (NOT NULL). Aquí se
  // comprueba para dar el motivo antes de que la base lo rechace.
  if (!input.coverImageUrl) {
    blockers.push({ code: 'no_cover', detail: 'La edición necesita una imagen de portada.' })
  } else if (input.coverImageUrl.trim() === PLACEHOLDER_COVER_URL) {
    blockers.push({
      code:   'portada_placeholder',
      detail: 'La portada todavía es el marcador de ITMANO. Genera o sube una portada propia antes de publicar.',
    })
  }
  if (!input.content) {
    blockers.push({ code: 'contenido_invalido', detail: 'El contenido no es válido o está vacío.' })
    return blockers
  }

  const known = new Set(input.sources.map(s => s.id))

  for (const block of input.content.blocks) {
    // Un dato SIN fuente ya no bloquea (ver content.ts). Lo que sigue
    // bloqueando es citar una que no existe: eso no es una edición sin
    // respaldo, es una edición que promete un respaldo que no está.
    if (block.type === 'stat' && block.sourceIds) {
      for (const id of block.sourceIds) {
        if (!known.has(id)) {
          blockers.push({
            code: 'fuente_inexistente',
            detail: `El dato "${block.label}" cita una fuente que ya no existe.`,
          })
        }
      }
    }
    if (block.type === 'paragraph' && block.sourceIds) {
      for (const id of block.sourceIds) {
        if (!known.has(id)) {
          blockers.push({
            code: 'fuente_inexistente',
            detail: 'Un párrafo cita una fuente que ya no existe.',
          })
        }
      }
    }
  }

  return blockers
}
