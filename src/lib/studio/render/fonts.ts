import 'server-only'
import { readFontBuffer } from '@/lib/carousels/fonts'

// Las fuentes que satori inyecta. Los templates las referencian por
// `fontFamily` con estos nombres exactos — un nombre que no esté aquí cae a la
// primera de la lista y el diseño sale con la tipografía equivocada sin avisar.

export interface SatoriFont {
  name:   string
  data:   Buffer
  weight: 400 | 500 | 800
  style:  'normal'
}

export function studioFonts(): SatoriFont[] {
  return [
    { name: 'Spectral',  data: readFontBuffer('body'),     weight: 400, style: 'normal' },
    { name: 'Spectral',  data: readFontBuffer('subtitle'), weight: 500, style: 'normal' },
    { name: 'Spectral',  data: readFontBuffer('title'),    weight: 800, style: 'normal' },
    { name: 'Marcellus', data: readFontBuffer('label'),    weight: 400, style: 'normal' },
  ]
}
