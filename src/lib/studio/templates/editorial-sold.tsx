import { EditorialPiece } from './editorial-shell'
import type { StudioTemplate } from './types'

// Editorial · vendida. Un cierre no publica ni cifra ni specs, así que el
// bloque de color es encabezado, titular y dirección — y la foto se queda con
// todo lo que eso deja libre, que en esta receta es mucho.

export const editorialSold: StudioTemplate = {
  key: 'editorial-sold',
  label: 'Editorial',
  hint: 'Pocas fotos, manda el texto',
  recipes: ['sold'],
  aspects: ['4:5'],
  idealPhotos: 1,
  slots: {
    required: ['text.headline'],
    optional: ['photo.hero', 'photo.agent', 'text.address', 'text.phone', 'logo.tenant'],
  },
  render: EditorialPiece,
}
