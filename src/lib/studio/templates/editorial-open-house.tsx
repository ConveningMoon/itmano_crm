import { EditorialPiece } from './editorial-shell'
import type { StudioTemplate } from './types'

// Editorial · casa abierta. Sin cifra, el bloque de color lo cierra la fecha y
// el horario — el shell elige uno u otro, nunca los dos.

export const editorialOpenHouse: StudioTemplate = {
  key: 'editorial-open-house',
  label: 'Editorial',
  hint: 'Pocas fotos, manda el texto',
  recipes: ['open_house'],
  aspects: ['4:5'],
  idealPhotos: 1,
  slots: {
    required: ['text.headline', 'text.when'],
    optional: ['photo.hero', 'photo.agent', 'text.address', 'text.phone', 'logo.tenant'],
  },
  render: EditorialPiece,
}
