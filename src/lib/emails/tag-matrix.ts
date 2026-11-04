import { SUPPORTED_LANGUAGE_CODES } from '@/lib/config'
import type { TagSequenceCoverage } from '@/lib/data/tag-sequences'
import type { LeadTag } from '@/lib/leads/tags'

// Estado de una celda (etiqueta x idioma) de la matriz "Por etiqueta".
//   lista       secuencia activa con al menos un paso
//   incompleta  existe pero sin pasos: no envía nada (enroll-lead-by-tag: no_steps)
//   desactivada existe con pasos pero está apagada
//   falta       la etiqueta debe mandar correos y no hay versión en ese idioma
//   na          no aplica: la etiqueta ya no es obligatoria o no tiene ese idioma
export type TagCellState = 'lista' | 'incompleta' | 'desactivada' | 'falta' | 'na'

export interface TagMatrixRow {
  tag:   LeadTag
  cells: Record<string, TagCellState>
  /** Id de la secuencia por idioma, para enlazar a editar. */
  sequenceIds: Record<string, string>
}

export interface TagMatrix {
  languages: string[]
  rows:      TagMatrixRow[]
  /** Huecos reales: etiquetas obligatorias sin versión en un idioma. */
  missing:   number
}

export function tagMatrix(coverage: TagSequenceCoverage[]): TagMatrix {
  const order = SUPPORTED_LANGUAGE_CODES as readonly string[]
  const present = new Set<string>()
  for (const c of coverage) for (const s of c.slots) present.add(s.language)
  const languages = [...present].sort((a, b) => order.indexOf(a) - order.indexOf(b))

  let missing = 0
  const rows = coverage.map(({ tag, slots }): TagMatrixRow => {
    const cells: Record<string, TagCellState> = {}
    const sequenceIds: Record<string, string> = {}
    for (const language of languages) {
      const slot = slots.find(s => s.language === language)
      const seq = slot?.sequence ?? null
      if (!slot) cells[language] = 'na'
      else if (!seq) {
        if (tag.requiresSequence) { cells[language] = 'falta'; missing++ }
        else cells[language] = 'na'
      } else {
        sequenceIds[language] = seq.id
        cells[language] = seq.stepCount === 0 ? 'incompleta' : !seq.active ? 'desactivada' : 'lista'
      }
    }
    return { tag, cells, sequenceIds }
  })

  return { languages, rows, missing }
}
