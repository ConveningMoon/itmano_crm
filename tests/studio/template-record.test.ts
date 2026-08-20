import { describe, it, expect } from 'vitest'
import { toTemplateMeta } from '@/lib/data/studio-templates'

describe('toTemplateMeta', () => {
  const row = {
    key: 'mosaico-listing', label: 'Mosaico', hint: 'Cuatro fotos o mas',
    recipes: ['new_listing'], aspects: ['4:5'],
    slots: { required: ['photo.hero'], optional: ['photo.thumbs'] },
    ideal_photos: 4, thumb_path: null,
  }

  it('mapea las columnas al contrato del cliente', () => {
    const meta = toTemplateMeta(row)
    expect(meta.key).toBe('mosaico-listing')
    expect(meta.idealPhotos).toBe(4)
    expect(meta.slots.required).toEqual(['photo.hero'])
  })

  it('tolera una fila sin slots todavia inferidos', () => {
    const meta = toTemplateMeta({ ...row, slots: null, ideal_photos: null })
    expect(meta.slots).toEqual({ required: [], optional: [] })
    expect(meta.idealPhotos).toBe(0)
  })

  it('deja thumbUrl en null cuando no hay miniatura', () => {
    expect(toTemplateMeta(row).thumbUrl).toBeNull()
  })
})
