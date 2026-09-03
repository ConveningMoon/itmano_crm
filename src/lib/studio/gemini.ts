import 'server-only'

// Cliente de Google AI (Gemini) para generar las escenas del Estudio con Nano
// Banana (gemini image). API key directa (GOOGLE_AI_API_KEY), REST v1beta — sin
// SDK.
//
// Vivía en `lib/carousels/gemini.ts` y tenía además un paso de investigación de
// tendencias con grounding (`google_search`). Ese paso era exclusivo del motor
// de carruseles; al retirarse el motor, aquí queda sólo la mitad de imagen.
//
// Robustez: los IDs de modelo de Google cambian/retiran seguido (p. ej.
// gemini-2.5-flash quedó "no longer available to new users"). Por eso se prueba
// una LISTA de modelos candidatos y, ante un 404 / modelo retirado, se pasa al
// siguiente — sin desperdiciar la request. Los errores transitorios (429 y 5xx)
// se reintentan sobre el mismo modelo con backoff. Los definitivos (key
// inválida, cuota agotada, request inválida) se propagan de inmediato.
// El default se puede sobreescribir por env (GEMINI_IMAGE_MODEL) sin re-deploy.

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

// Nano Banana: flash (barato) primero, pro (estable) y el original de respaldo.
const IMAGE_MODELS = dedupe([
  process.env.GEMINI_IMAGE_MODEL,
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image',
  'gemini-2.5-flash-image',
])

// Recordamos el modelo que funcionó para no volver a golpear los retirados.
let cachedImageModel: string | null = null

export function lastImageModel(): string | null { return cachedImageModel }

export class GeminiError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function dedupe(xs: (string | undefined | null)[]): string[] {
  return [...new Set(xs.filter((x): x is string => !!x && x.trim().length > 0))]
}

function apiKey(): string {
  const k = process.env.GOOGLE_AI_API_KEY
  if (!k) throw new GeminiError('Falta GOOGLE_AI_API_KEY')
  return k
}

function friendlyError(status: number, body: string): string {
  if (status === 401 || status === 403) return 'La API key de Google no es válida o no tiene permisos (revisa GOOGLE_AI_API_KEY en Vercel).'
  if (status === 429) return 'Se alcanzó el límite/cuota de Google AI (429). Intenta más tarde.'
  if (status === 400) return `Google rechazó la solicitud (400): ${body}`
  return `Gemini falló (${status}): ${body}`
}

// ¿El error es "modelo no disponible" → conviene probar el siguiente candidato?
function isModelUnavailable(status: number, body: string): boolean {
  // Un modelo que EXISTE pero rechaza la imagen de entrada no es "no
  // disponible": saltar al siguiente candidato produciría una imagen que ignora
  // la referencia en silencio, que es peor que un error visible.
  if (/inline_data|inlineData|image input|multimodal input/i.test(body)) return false
  return status === 404 || /no longer available|not\s*found|is not supported|unknown name|does not exist/i.test(body)
}

// POST genérico con fallback de modelos. Devuelve el JSON + el modelo que sirvió.
// `retriesTransient`: reintentos con backoff ante un error transitorio (429 de
// throttle o 5xx de capacidad de Google) del MISMO modelo.
// `timeoutMs`: corta el fetch si Gemini se cuelga/tarda de más — CLAVE para que
// la función serverless no muera con 504 ("An unexpected response..."). Un
// timeout se trata como "modelo no disponible" → se prueba el siguiente
// candidato (normalmente uno más estable/rápido).
async function callWithFallback(
  models: string[],
  cached: string | null,
  body: unknown,
  opts: { retriesTransient?: number; timeoutMs?: number } = {},
): Promise<{ json: Record<string, unknown>; model: string }> {
  const { retriesTransient = 0, timeoutMs = 30000 } = opts
  const order = cached ? dedupe([cached, ...models]) : models
  if (order.length === 0) throw new GeminiError('No hay modelos de Gemini configurados')

  let lastUnavailable: GeminiError | null = null
  for (const model of order) {
    for (let attempt = 0; ; attempt++) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeoutMs)
      let res: Response
      try {
        res = await fetch(`${BASE}/${model}:generateContent?key=${apiKey()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        })
      } catch (e) {
        clearTimeout(timer)
        if (e instanceof Error && e.name === 'AbortError') {
          // Timeout: el modelo tardó demasiado → probar el siguiente candidato.
          lastUnavailable = new GeminiError(`Modelo ${model} excedió el tiempo límite (${Math.round(timeoutMs / 1000)}s)`)
          break
        }
        // Fallo de red real — no seguimos probando modelos.
        throw new GeminiError(`No se pudo contactar a Google AI: ${e instanceof Error ? e.message : 'error de red'}`)
      }
      clearTimeout(timer)
      if (res.ok) return { json: await res.json(), model }

      const bodyText = (await res.text()).slice(0, 300)
      // Transitorios: 429 (throttle nuestro) y 5xx (capacidad del lado de
      // Google). El mismo modelo suele responder bien un momento después, así
      // que se reintenta en vez de darlo por perdido. Un 503 "This model is
      // currently experiencing high demand" apareció pidiendo tres imágenes a
      // la vez, y antes ese caso se trataba como error fatal.
      if ((res.status === 429 || res.status >= 500) && attempt < retriesTransient) {
        await sleep(2500 * (attempt + 1)) // backoff: 2.5s, 5s…
        continue // reintentar el mismo modelo
      }
      if (isModelUnavailable(res.status, bodyText)) {
        lastUnavailable = new GeminiError(`Modelo ${model} no disponible (${res.status})`)
        break // probar el siguiente candidato
      }
      // Error real (key/cuota agotada/solicitud) — no malgastes probando más.
      throw new GeminiError(friendlyError(res.status, bodyText))
    }
  }
  throw new GeminiError(
    `Ningún modelo de Gemini sirvió (${order.join(', ')}). ` +
    `Último detalle: ${lastUnavailable?.message ?? 'desconocido'}`,
  )
}

// ── Generación de imagen (Nano Banana) ───────────────────────────────────────
// Devuelve el buffer + el modelo que sirvió (para el ledger de costos). Dos
// reintentos ante un transitorio (429 de throttle o 5xx de capacidad de Google).
// `references` adjunta imágenes de entrada, en orden. El Estudio manda hasta tres.
export async function generateImage(
  prompt: string,
  references: Array<{ data: Buffer; mimeType: string }> = [],
): Promise<{ data: Buffer; model: string }> {
  const inputParts: Array<Record<string, unknown>> = [
    ...references.map(r => ({ inline_data: { mime_type: r.mimeType, data: r.data.toString('base64') } })),
    { text: prompt },
  ]

  const { json, model } = await callWithFallback(
    IMAGE_MODELS, cachedImageModel,
    { contents: [{ role: 'user', parts: inputParts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } },
    // Cada referencia es una imagen completa de entrada: el modelo tarda más
    // por cada una, así que el timeout crece con ellas en vez de ser fijo.
    { retriesTransient: 2, timeoutMs: 35000 + references.length * 12000 },
  )
  cachedImageModel = model

  const parts = (((json?.candidates as unknown[])?.[0] as { content?: { parts?: { inlineData?: { data?: string } }[] } })?.content?.parts ?? [])
  const inline = parts.find((p) => p?.inlineData?.data)?.inlineData?.data
  if (!inline) throw new GeminiError('La respuesta de imagen no contenía datos (posible bloqueo de seguridad del prompt)')
  return { data: Buffer.from(inline, 'base64'), model }
}

