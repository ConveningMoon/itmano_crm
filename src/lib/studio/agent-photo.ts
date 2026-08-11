import 'server-only'
import sharp from 'sharp'

// La portada del agente puede venir ya recortada (PNG con transparencia) o ser
// una foto normal. No se le pregunta al agente ni se le pide que lo declare:
// sharp lo sabe.
//
// NO se recorta con IA. Nano Banana no recorta, REGENERA: devolvería una persona
// redibujada que se le parece. Para la cara de una agente real, con su nombre al
// lado, en material que publica con su marca, eso no es un recorte sino un
// retrato falso. La decisión es de producto, no de coste.

/**
 * ¿Tiene transparencia REAL? Un canal alfa presente pero totalmente opaco no
 * cuenta — es el caso que haría fallar una comprobación ingenua de `hasAlpha`.
 */
export async function detectCutout(buffer: Buffer): Promise<boolean> {
  try {
    const { isOpaque } = await sharp(buffer).stats()
    return isOpaque === false
  } catch {
    // Imagen ilegible: se trata como foto normal. Nunca lanza aquí — un archivo
    // raro no debe tumbar la subida, y el fallo real saldrá al renderizar.
    return false
  }
}

/**
 * Recorte circular del tamaño pedido, encuadrado por entropía — que en un
 * retrato suele caer en la cara. Devuelve PNG con las esquinas transparentes.
 */
export async function circleCrop(buffer: Buffer, size: number): Promise<Buffer> {
  const square = await sharp(buffer)
    .resize(size, size, { fit: 'cover', position: 'attention' })
    .png()
    .toBuffer()

  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
       <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/>
     </svg>`,
  )
  return sharp(square).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
}
