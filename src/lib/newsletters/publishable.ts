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
  code:   'no_cover' | 'no_title' | 'stat_sin_fuente' | 'fuente_inexistente' | 'contenido_invalido'
  detail: string
}

export function publishBlockers(input: PublishableInput): PublishBlocker[] {
  const blockers: PublishBlocker[] = []

  if (!input.title.trim()) {
    blockers.push({ code: 'no_title', detail: 'La edición necesita un titular.' })
  }
  // La portada es obligatoria también en el esquema (NOT NULL). Aquí se
  // comprueba para dar el motivo antes de que la base lo rechace.
  if (!input.coverImageUrl) {
    blockers.push({ code: 'no_cover', detail: 'La edición necesita una imagen de portada.' })
  }
  if (!input.content) {
    blockers.push({ code: 'contenido_invalido', detail: 'El contenido no es válido o está vacío.' })
    return blockers
  }

  const known = new Set(input.sources.map(s => s.id))

  for (const block of input.content.blocks) {
    if (block.type === 'stat') {
      if (block.sourceIds.length === 0) {
        blockers.push({ code: 'stat_sin_fuente', detail: `El dato "${block.label}" no tiene fuente.` })
        continue
      }
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
