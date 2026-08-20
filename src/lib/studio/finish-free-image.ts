import 'server-only'
import sharp from 'sharp'

// Lo único que "Mi Imagen" usaba del compositor de bandas.
//
// Esa pestaña devuelve la imagen del modelo tal cual: `piecesFor` devolvía []
// para open_prompt y composeStudioImage salía por `return base.toBuffer()`. Al
// retirar el compositor, esas seis líneas son lo que hay que conservar — y
// aisladas se leen por lo que son, en vez de como el caso vacío de otra cosa.

// Copiado literal del `proceduralSvg` de compositor.ts (rect negro + degradado +
// textura "linen"): con solo el degradado, la parte semitransparente del stop
// final quedaría sin nada detrás y la imagen de respaldo saldría distinta a la
// de hoy.
function proceduralSvg(width: number, height: number, accent: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="p" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${accent}" stop-opacity="1"/>
        <stop offset="1" stop-color="${accent}" stop-opacity="0.72"/>
      </linearGradient>
      <pattern id="linen" width="18" height="18" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="0" y2="18" stroke="#FFFFFF" stroke-width="0.7" opacity="0.05"/>
      </pattern>
    </defs>
    <rect width="${width}" height="${height}" fill="#000000"/>
    <rect width="${width}" height="${height}" fill="url(#p)"/>
    <rect width="${width}" height="${height}" fill="url(#linen)"/>
  </svg>`
}

export async function finishFreeImage(params: {
  background: Buffer | null
  /** El color del tenant, para el respaldo cuando no hay imagen. */
  accent: string
  width:  number
  height: number
}): Promise<Buffer> {
  const { background, width, height } = params
  if (!background) {
    return sharp(Buffer.from(proceduralSvg(width, height, params.accent))).png().toBuffer()
  }
  // `position: attention` recorta buscando la zona con más detalle: en una foto
  // vertical de una casa, eso conserva la fachada en vez de cortarla.
  return sharp(background).resize(width, height, { fit: 'cover', position: 'attention' }).png().toBuffer()
}
