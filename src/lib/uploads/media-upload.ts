// Subida de archivos a los Route Handlers de media (/api/properties/media,
// /api/newsletters/media), compartida por todos los formularios que suben.
//
// Existe para que un fallo diga la verdad. Antes cada formulario hacía
// `fetch` + `res.json()` y, si la respuesta no era JSON, inventaba "Verifica tu
// conexión e intenta de nuevo". Pero las respuestas que no son JSON no son un
// problema de conexión: son Vercel diciendo 413 (cuerpo > 4.5 MB, ver
// limits.ts) o un 500 sin cuerpo. Quien lo veía —un cliente en EE. UU. igual
// que nosotros— no tenía ninguna pista de qué hacer.

import { MAX_FILE_BYTES_PER_REQUEST } from './limits'

export type UploadResult = { ok: true; url: string } | { ok: false; error: string }

export function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`
}

/** Mensaje cuando un archivo no cabe en una petición. Sirve antes de enviar y para el 413. */
export function mensajeArchivoGrande(tamano?: number): string {
  const limite = formatMb(MAX_FILE_BYTES_PER_REQUEST)
  return tamano === undefined
    ? `El archivo supera el límite de ${limite} por subida.`
    : `El archivo pesa ${formatMb(tamano)} y el límite por subida es ${limite}.`
}

/**
 * Lee la respuesta de un Route Handler de media y la convierte en un resultado
 * con un mensaje fiel a lo que pasó.
 */
export async function readUploadResponse(res: Response): Promise<UploadResult> {
  if (res.status === 413) return { ok: false, error: mensajeArchivoGrande() }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return {
      ok: false,
      error: `El servidor respondió con un error inesperado (HTTP ${res.status}). Intenta de nuevo en un momento.`,
    }
  }

  if (body && typeof body === 'object' && 'ok' in body) {
    const r = body as { ok: unknown; url?: unknown; error?: unknown }
    if (r.ok === true && typeof r.url === 'string') return { ok: true, url: r.url }
    if (r.ok === false) {
      return { ok: false, error: typeof r.error === 'string' && r.error ? r.error : `No se pudo subir el archivo (HTTP ${res.status}).` }
    }
  }
  return { ok: false, error: `Respuesta inesperada del servidor (HTTP ${res.status}).` }
}

/**
 * POST multipart a un Route Handler de media. "Verifica tu conexión" se reserva
 * para lo único que de verdad lo es: que el `fetch` no llegue a obtener respuesta.
 */
export async function postMedia(endpoint: string, body: FormData): Promise<UploadResult> {
  let res: Response
  try {
    res = await fetch(endpoint, { method: 'POST', body })
  } catch {
    return { ok: false, error: 'No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo.' }
  }
  return readUploadResponse(res)
}
