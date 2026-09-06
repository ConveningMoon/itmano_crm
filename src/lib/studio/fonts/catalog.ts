// Las fuentes que una plantilla puede pedir por nombre.
//
// Los archivos viven en `public/studio/fonts/` y se usan de dos maneras con los
// MISMOS bytes: por URL en el iframe del editor y en `data:` dentro del
// documento que renderiza Chrome, que no tiene salida a la red. Mismo nombre de
// familia y mismas métricas en los dos sitios.
//
// Para añadir una familia: deja el .ttf en esa carpeta y añade su fila aquí.
// Solo licencias OFL o equivalentes — el archivo se distribuye con la app.

export interface StudioFont {
  family: string
  weight: number
  style:  'normal' | 'italic'
  file:   string
}

export const FONT_CATALOG: StudioFont[] = [
  { family: 'Spectral',  weight: 400, style: 'normal', file: 'Spectral-Regular.ttf' },
  { family: 'Spectral',  weight: 500, style: 'normal', file: 'Spectral-Medium.ttf' },
  { family: 'Spectral',  weight: 800, style: 'normal', file: 'Spectral-ExtraBold.ttf' },
  { family: 'Marcellus', weight: 400, style: 'normal', file: 'Marcellus-Regular.ttf' },
  // Las ocho familias siguientes vienen de google/fonts (todas OFL). El repo ya
  // no guarda instancias estaticas para la mayoria: solo distribuye el variable
  // font. Se descargo ese archivo y se instancio localmente con fonttools
  // (varLib.instancer, fijando TODOS los ejes) para producir un .ttf estatico
  // de un solo peso por fila, igual que si Google lo hubiera publicado asi.
  { family: 'Inter',              weight: 400, style: 'normal', file: 'Inter-Regular.ttf' },
  { family: 'Inter',              weight: 600, style: 'normal', file: 'Inter-SemiBold.ttf' },
  { family: 'Archivo',            weight: 700, style: 'normal', file: 'Archivo-Bold.ttf' },
  { family: 'Archivo',            weight: 900, style: 'normal', file: 'Archivo-Black.ttf' },
  { family: 'Playfair Display',   weight: 400, style: 'normal', file: 'PlayfairDisplay-Regular.ttf' },
  { family: 'Playfair Display',   weight: 700, style: 'normal', file: 'PlayfairDisplay-Bold.ttf' },
  { family: 'Fraunces',           weight: 400, style: 'normal', file: 'Fraunces-Regular.ttf' },
  { family: 'Fraunces',           weight: 600, style: 'normal', file: 'Fraunces-SemiBold.ttf' },
  { family: 'Cormorant Garamond', weight: 300, style: 'normal', file: 'CormorantGaramond-Light.ttf' },
  { family: 'Cormorant Garamond', weight: 500, style: 'normal', file: 'CormorantGaramond-Medium.ttf' },
  { family: 'DM Sans',            weight: 400, style: 'normal', file: 'DMSans-Regular.ttf' },
  { family: 'DM Sans',            weight: 500, style: 'normal', file: 'DMSans-Medium.ttf' },
  { family: 'Bebas Neue',         weight: 400, style: 'normal', file: 'BebasNeue-Regular.ttf' },
  { family: 'Libre Baskerville',  weight: 400, style: 'normal', file: 'LibreBaskerville-Regular.ttf' },
]

export const FONT_FAMILIES: string[] = [...new Set(FONT_CATALOG.map(f => f.family))]

function face(font: StudioFont, src: string): string {
  return `@font-face{font-family:'${font.family}';font-weight:${font.weight};`
    + `font-style:${font.style};font-display:block;src:url(${src}) format('truetype')}`
}

/** Para el iframe del editor: el navegador sí puede pedir la URL. */
export function fontFaceCssFromUrls(): string {
  return FONT_CATALOG.map(f => face(f, `/studio/fonts/${f.file}`)).join('')
}

/**
 * Para el render: los bytes van dentro del documento.
 *
 * Recibe el lector en vez de leer aquí para que este módulo siga siendo puro y
 * el test no necesite tocar el disco.
 */
export function fontFaceCssFromData(read: (file: string) => Buffer): string {
  return FONT_CATALOG
    .map(f => face(f, `data:font/ttf;base64,${read(f.file).toString('base64')}`))
    .join('')
}
