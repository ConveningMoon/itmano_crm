import { EditorialPiece } from './editorial-shell'
import type { StudioTemplate } from './types'

// Editorial · evento. El bloque de color lleva la fecha, el lugar y cómo
// registrarse; la foto del evento ocupa el resto.

export const editorialEvent: StudioTemplate = {
  key: 'editorial-event',
  label: 'Editorial',
  hint: 'Manda el texto',
  recipes: ['event'],
  aspects: ['4:5'],
  idealPhotos: 1,
  slots: {
    required: ['text.headline', 'text.when'],
    optional: ['photo.hero', 'photo.agent', 'text.address', 'text.cta', 'text.phone', 'logo.tenant'],
  },
  render: EditorialPiece,
}
