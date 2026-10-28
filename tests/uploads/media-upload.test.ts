import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_FILE_BYTES_PER_REQUEST, VERCEL_BODY_LIMIT_BYTES } from '@/lib/uploads/limits'
import { formatMb, mensajeArchivoGrande, postMedia, readUploadResponse } from '@/lib/uploads/media-upload'
import { PASS_THROUGH_BYTES, dimensionesDestino, prepareImageForUpload } from '@/lib/uploads/prepare-image'

const MB = 1024 * 1024

function archivo(bytes: number, nombre: string, tipo: string): File {
  return new File([new Uint8Array(bytes)], nombre, { type: tipo })
}

afterEach(() => vi.unstubAllGlobals())

describe('límites', () => {
  it('el máximo por archivo deja margen para el multipart bajo el techo de Vercel', () => {
    expect(MAX_FILE_BYTES_PER_REQUEST).toBeLessThanOrEqual(VERCEL_BODY_LIMIT_BYTES - 0.25 * MB)
  })

  it('lo que se deja pasar sin tocar cabe siempre en una petición', () => {
    expect(PASS_THROUGH_BYTES).toBeLessThan(MAX_FILE_BYTES_PER_REQUEST)
  })
})

describe('readUploadResponse', () => {
  // Es la respuesta real de Vercel a un cuerpo de más de 4.5 MB: texto plano.
  it('un 413 de Vercel dice que el archivo es grande, no que falle la conexión', async () => {
    const res = new Response('Request Entity Too Large\n\nFUNCTION_PAYLOAD_TOO_LARGE\n', {
      status: 413, headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
    const r = await readUploadResponse(res)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain('4 MB')
      expect(r.error.toLowerCase()).not.toContain('conexión')
    }
  })

  it('una respuesta que no es JSON informa del código HTTP', async () => {
    const r = await readUploadResponse(new Response('boom', { status: 500 }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('HTTP 500')
  })

  it('respeta el mensaje de error del handler', async () => {
    const r = await readUploadResponse(Response.json({ ok: false, error: 'El archivo debe ser un PDF' }, { status: 400 }))
    expect(r).toEqual({ ok: false, error: 'El archivo debe ser un PDF' })
  })

  it('devuelve la URL cuando la subida sale bien', async () => {
    const r = await readUploadResponse(Response.json({ ok: true, url: 'https://x/y.webp' }))
    expect(r).toEqual({ ok: true, url: 'https://x/y.webp' })
  })

  it('un JSON sin la forma esperada no se da por bueno', async () => {
    const r = await readUploadResponse(Response.json({ hola: 1 }))
    expect(r.ok).toBe(false)
  })
})

describe('postMedia', () => {
  it('sólo habla de conexión cuando el fetch no obtiene respuesta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const r = await postMedia('/api/properties/media', new FormData())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.toLowerCase()).toContain('conexión')
  })

  it('manda un POST al endpoint indicado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true, url: 'https://x/z.webp' }))
    vi.stubGlobal('fetch', fetchMock)
    const fd = new FormData()
    const r = await postMedia('/api/newsletters/media', fd)
    expect(r).toEqual({ ok: true, url: 'https://x/z.webp' })
    expect(fetchMock).toHaveBeenCalledWith('/api/newsletters/media', { method: 'POST', body: fd })
  })
})

describe('mensajes de tamaño', () => {
  it('formatMb', () => {
    expect(formatMb(4 * MB)).toBe('4 MB')
    expect(formatMb(6.24 * MB)).toBe('6.2 MB')
    expect(formatMb(12 * MB)).toBe('12 MB')
  })

  it('mensajeArchivoGrande incluye el tamaño real cuando se conoce', () => {
    expect(mensajeArchivoGrande(6 * MB)).toBe('El archivo pesa 6 MB y el límite por subida es 4 MB.')
  })
})

describe('dimensionesDestino', () => {
  it('reduce conservando la proporción', () => {
    expect(dimensionesDestino(4000, 3000, 2560)).toEqual({ ancho: 2560, alto: 1920 })
    expect(dimensionesDestino(3000, 4000, 2560)).toEqual({ ancho: 1920, alto: 2560 })
  })

  it('no agranda lo que ya es más chico', () => {
    expect(dimensionesDestino(800, 600, 2560)).toEqual({ ancho: 800, alto: 600 })
  })

  it('nunca devuelve una dimensión de 0 px', () => {
    expect(dimensionesDestino(10000, 1, 2560).alto).toBe(1)
  })
})

describe('prepareImageForUpload', () => {
  it('deja pasar intacta una imagen que ya cabe', async () => {
    const f = archivo(1 * MB, 'casa.jpg', 'image/jpeg')
    const r = await prepareImageForUpload(f)
    expect(r.ok && r.file).toBe(f)
  })

  it('no toca un GIF grande y dice que no cabe', async () => {
    const r = await prepareImageForUpload(archivo(6 * MB, 'tour.gif', 'image/gif'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('GIF')
  })

  // En Node no existe createImageBitmap: equivale a un navegador que no puede
  // decodificar el archivo (p. ej. un HEIC), y el mensaje tiene que decir qué hacer.
  it('si el navegador no puede leer una foto grande, pide convertirla', async () => {
    const r = await prepareImageForUpload(archivo(8 * MB, 'IMG_0001.heic', 'image/heic'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('JPG o PNG')
  })
})
