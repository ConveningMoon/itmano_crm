import 'server-only'
import { generateImage } from './gemini'
import type { SourceMode } from './types'

// ── De dónde sale el fondo ───────────────────────────────────────────────────
// Tres orígenes según el modo:
//   'photo'    → la foto real de la propiedad (sin IA, costo 0)
//   'generate' → Nano Banana
//   procedural → degradación: null, y el compositor pinta el fondo de marca
//
// NUNCA lanza: un fondo que falla degrada, no rompe. El texto es el dato que
// importa y se compone igual.

export interface BackgroundResult {
  buffer:  Buffer | null
  source:  'generated' | 'photo' | 'procedural'
  model:   string | null
  warning: string | null
}

const PHOTO_TIMEOUT_MS = 15000

async function downloadPhoto(url: string): Promise<Buffer> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PHOTO_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  } finally {
    clearTimeout(timer)
  }
}

export async function resolveBackground(params: {
  sourceMode:  SourceMode
  scenePrompt: string | null
  references:  Array<{ data: Buffer; mimeType: string }>
  photoUrl:    string | null
}): Promise<BackgroundResult> {
  if (params.sourceMode === 'photo') {
    if (!params.photoUrl) {
      return { buffer: null, source: 'procedural', model: null, warning: 'La propiedad no tiene foto disponible' }
    }
    try {
      return { buffer: await downloadPhoto(params.photoUrl), source: 'photo', model: null, warning: null }
    } catch (e) {
      return {
        buffer: null, source: 'procedural', model: null,
        warning: `No se pudo descargar la foto: ${e instanceof Error ? e.message : 'error'}`,
      }
    }
  }

  if (!params.scenePrompt) {
    return { buffer: null, source: 'procedural', model: null, warning: 'Sin prompt de escena' }
  }

  try {
    const img = await generateImage(params.scenePrompt, params.references)
    return { buffer: img.data, source: 'generated', model: img.model, warning: null }
  } catch (e) {
    return {
      buffer: null, source: 'procedural', model: null,
      warning: e instanceof Error ? e.message : 'No se pudo generar la escena',
    }
  }
}
