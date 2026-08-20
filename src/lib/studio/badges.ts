import type { StudioRecipe } from './types'

// El encabezado de cada receta. Vive aparte de template-props porque ese módulo
// es `server-only` y esto lo necesita también el editor, que corre en el
// cliente. No hay nada de servidor en un mapa de cinco cadenas.

const BADGES: Record<StudioRecipe, string> = {
  open_house:  'CASA ABIERTA',
  new_listing: 'NUEVA DISPONIBLE',
  sold:        'VENDIDA',
  event:       'EVENTO',
  open_prompt: '',
}

/** El encabezado de la receta. Es el DEFAULT: `badgeOf` respeta el escrito. */
export function badgeFor(recipe: StudioRecipe): string {
  return BADGES[recipe]
}
