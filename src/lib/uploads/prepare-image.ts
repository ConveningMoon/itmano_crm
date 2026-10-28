// Reduce en el navegador las fotos que no caben en una petición a Vercel.
//
// El servidor ya deja cada foto en WebP de 2560 px como mucho (sharp,
// `convertImageToWebp`), pero para eso la foto original tiene que llegar, y una
// de móvil o de cámara pesa 5-12 MB contra un techo de 4.5 MB (ver limits.ts).
// Hacemos aquí, antes de enviar, el mismo recorte que haría el servidor: lo que
// llega pesa una fracción y el resultado final es el mismo.
//
// Las que ya caben (hasta PASS_THROUGH_BYTES) viajan intactas: el servidor las
// procesa como siempre y no se recomprimen dos veces.

import { MAX_FILE_BYTES_PER_REQUEST, MAX_IMAGE_DIMENSION } from './limits'
import { formatMb, mensajeArchivoGrande } from './media-upload'

/** Por debajo de esto no se toca la imagen: el servidor se encarga. */
export const PASS_THROUGH_BYTES = 3 * 1024 * 1024

// De más a menos calidad: se prueba cada paso hasta que el resultado cabe.
const INTENTOS: ReadonlyArray<{ lado: number; calidad: number }> = [
  { lado: MAX_IMAGE_DIMENSION, calidad: 0.88 },
  { lado: 2048, calidad: 0.82 },
  { lado: 1600, calidad: 0.78 },
  { lado: 1280, calidad: 0.72 },
]

export type PreparedImage = { ok: true; file: File } | { ok: false; error: string }

/** Tamaño destino conservando la proporción y sin agrandar. */
export function dimensionesDestino(ancho: number, alto: number, lado: number): { ancho: number; alto: number } {
  const escala = Math.min(1, lado / Math.max(ancho, alto))
  return { ancho: Math.max(1, Math.round(ancho * escala)), alto: Math.max(1, Math.round(alto * escala)) }
}

function aBlob(canvas: HTMLCanvasElement, tipo: string, calidad: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, tipo, calidad))
}

/** WebP si el navegador sabe codificarlo; si no (Safari antiguo devuelve PNG) JPEG. */
async function codificar(canvas: HTMLCanvasElement, calidad: number): Promise<Blob | null> {
  const webp = await aBlob(canvas, 'image/webp', calidad)
  if (webp && webp.type === 'image/webp') return webp
  const jpeg = await aBlob(canvas, 'image/jpeg', calidad)
  return jpeg && jpeg.type === 'image/jpeg' ? jpeg : null
}

function nombreConExtension(nombre: string, tipo: string): string {
  const base = nombre.replace(/\.[^./\\]+$/, '') || 'imagen'
  return `${base}.${tipo === 'image/jpeg' ? 'jpg' : 'webp'}`
}

// Una foto de 12 MP decodificada ocupa ~48 MB; la galería lanza varias subidas
// a la vez (`Promise.all`) y, en un móvil, decodificarlas todas juntas agota la
// memoria de la pestaña. Se reduce de una en una y sólo las subidas van en paralelo.
let cola: Promise<unknown> = Promise.resolve()

export function prepareImageForUpload(file: File): Promise<PreparedImage> {
  if (file.size <= PASS_THROUGH_BYTES) return Promise.resolve({ ok: true, file })
  const resultado = cola.then(() => reducir(file))
  cola = resultado.catch(() => undefined)
  return resultado
}

async function reducir(file: File): Promise<PreparedImage> {
  // Un GIF animado pierde la animación al pasar por un canvas: no se toca, y si
  // no cabe se dice, en vez de entregar algo distinto de lo que se eligió.
  if (file.type === 'image/gif') {
    return { ok: false, error: `${mensajeArchivoGrande(file.size)} Los GIF no se reducen solos: usa uno más ligero.` }
  }

  let bitmap: ImageBitmap
  try {
    if (typeof createImageBitmap === 'undefined') throw new Error('createImageBitmap no disponible')
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return {
      ok: false,
      error: `La imagen pesa ${formatMb(file.size)} y este navegador no pudo leerla para reducirla (¿HEIC u otro formato poco común?). Conviértela a JPG o PNG e inténtalo de nuevo.`,
    }
  }

  try {
    for (const { lado, calidad } of INTENTOS) {
      const { ancho, alto } = dimensionesDestino(bitmap.width, bitmap.height, lado)
      const canvas = document.createElement('canvas')
      canvas.width = ancho
      canvas.height = alto
      const ctx = canvas.getContext('2d')
      if (!ctx) break
      ctx.drawImage(bitmap, 0, 0, ancho, alto)
      const blob = await codificar(canvas, calidad)
      if (blob && blob.size <= MAX_FILE_BYTES_PER_REQUEST) {
        return { ok: true, file: new File([blob], nombreConExtension(file.name, blob.type), { type: blob.type }) }
      }
    }
  } finally {
    bitmap.close()
  }
  return { ok: false, error: `${mensajeArchivoGrande(file.size)} No se pudo reducir lo suficiente: usa una versión más ligera.` }
}
