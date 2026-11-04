import { describe, it, expect } from 'vitest'
import { tagMatrix } from '@/lib/emails/tag-matrix'
import type { TagSequenceCoverage, TagSequenceRef } from '@/lib/data/tag-sequences'

function tag(id: string, requiresSequence = true) {
  return { id, name: id, slug: id, color: '#fff', description: null, position: 0, requiresSequence }
}
function seq(over: Partial<TagSequenceRef> = {}): TagSequenceRef {
  return { id: 's', name: 'S', active: true, stepCount: 2, activeRunCount: 0, ...over }
}

describe('tagMatrix', () => {
  it('columnas: unión de idiomas en orden estable', () => {
    const cov: TagSequenceCoverage[] = [
      { tag: tag('a'), slots: [{ language: 'pt', sequence: seq() }, { language: 'es', sequence: seq() }] },
      { tag: tag('b'), slots: [{ language: 'en', sequence: seq() }] },
    ]
    expect(tagMatrix(cov).languages).toEqual(['es', 'en', 'pt'])
  })

  it('cuenta sólo los huecos reales', () => {
    const cov: TagSequenceCoverage[] = [
      { tag: tag('a'), slots: [{ language: 'es', sequence: seq() }, { language: 'en', sequence: null }] },
      // etiqueta ya no obligatoria: su hueco no cuenta
      { tag: tag('b', false), slots: [{ language: 'es', sequence: null }, { language: 'en', sequence: null }] },
      // idioma que la etiqueta no tiene: no aplica, no es hueco
      { tag: tag('c'), slots: [{ language: 'es', sequence: seq() }] },
    ]
    const m = tagMatrix(cov)
    expect(m.missing).toBe(1)
    expect(m.rows[0].cells).toEqual({ es: 'lista', en: 'falta' })
    expect(m.rows[1].cells).toEqual({ es: 'na', en: 'na' })
    expect(m.rows[2].cells).toEqual({ es: 'lista', en: 'na' })
  })

  it('secuencia sin pasos es incompleta; inactiva es desactivada', () => {
    const cov: TagSequenceCoverage[] = [{
      tag: tag('a'),
      slots: [
        { language: 'es', sequence: seq({ stepCount: 0 }) },
        { language: 'en', sequence: seq({ active: false }) },
        { language: 'pt', sequence: seq({ stepCount: 0, active: false }) },
      ],
    }]
    expect(tagMatrix(cov).rows[0].cells).toEqual({ es: 'incompleta', en: 'desactivada', pt: 'incompleta' })
  })

  it('sin etiquetas: sin filas ni huecos', () => {
    expect(tagMatrix([])).toEqual({ languages: [], rows: [], missing: 0 })
  })
})
