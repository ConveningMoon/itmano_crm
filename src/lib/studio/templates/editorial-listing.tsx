import { EditorialPiece } from './editorial-shell'
import type { StudioTemplate } from './types'

// Editorial · nueva disponible. La estructura está en editorial-shell: las
// cuatro editoriales son el MISMO diseño, y lo que cambia entre ellas son los
// datos que su receta trae. Tener cuatro copias del layout fue lo que hizo que
// una corrección de espaciado se aplicara a una y se olvidara en las otras.

export const editorialListing: StudioTemplate = {
  key: 'editorial-listing',
  label: 'Editorial',
  hint: 'Pocas fotos, manda el texto',
  recipes: ['new_listing'],
  aspects: ['4:5'],
  idealPhotos: 1,
  slots: {
    required: ['text.headline', 'text.price'],
    optional: ['photo.hero', 'photo.agent', 'stats', 'text.address', 'text.phone', 'logo.tenant'],
  },
  render: EditorialPiece,
}
