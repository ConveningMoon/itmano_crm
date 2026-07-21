import 'server-only'
import type { CarouselBrandProfile, ResearchResult, ResearchTrend } from './types'

// Cliente de Google AI (Gemini) para dos pasos del pipeline:
//   1. Investigación de tendencias con grounding (`google_search`).
//   2. Generación de fondos editoriales con Nano Banana (gemini image).
// API keys directas (GOOGLE_AI_API_KEY), REST v1beta — sin SDK.
//
// Robustez: los IDs de modelo de Google cambian/retiran seguido (p. ej.
// gemini-2.5-flash quedó "no longer available to new users"). Por eso cada paso
// prueba una LISTA de modelos candidatos y, ante un 404 / modelo retirado, pasa
// al siguiente — sin desperdiciar la request. Errores no-404 (key inválida,
// cuota, request inválida) se propagan de inmediato sin probar más modelos.
// Los defaults se pueden sobreescribir por env (GEMINI_RESEARCH_MODEL /
// GEMINI_IMAGE_MODEL) sin re-deploy.

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

// Alias `-latest` primero (Google lo mantiene apuntando al último flash), luego
// versiones concretas como respaldo.
const RESEARCH_MODELS = dedupe([
  process.env.GEMINI_RESEARCH_MODEL,
  'gemini-flash-latest',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
])
// Nano Banana: flash (barato) primero, pro (estable) y el original de respaldo.
const IMAGE_MODELS = dedupe([
  process.env.GEMINI_IMAGE_MODEL,
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image',
  'gemini-2.5-flash-image',
])

// Recordamos el modelo que funcionó para no volver a golpear los retirados.
let cachedResearchModel: string | null = null
let cachedImageModel: string | null = null

export class GeminiError extends Error {}

function dedupe(xs: (string | undefined | null)[]): string[] {
  return [...new Set(xs.filter((x): x is string => !!x && x.trim().length > 0))]
}

export function hasGoogleKey(): boolean {
  return !!process.env.GOOGLE_AI_API_KEY
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
  return status === 404 || /no longer available|not\s*found|is not supported|unknown name|does not exist/i.test(body)
}

// POST genérico con fallback de modelos. Devuelve el JSON + el modelo que sirvió.
async function callWithFallback(
  models: string[],
  cached: string | null,
  body: unknown,
): Promise<{ json: Record<string, unknown>; model: string }> {
  const order = cached ? dedupe([cached, ...models]) : models
  if (order.length === 0) throw new GeminiError('No hay modelos de Gemini configurados')

  let lastUnavailable: GeminiError | null = null
  for (const model of order) {
    let res: Response
    try {
      res = await fetch(`${BASE}/${model}:generateContent?key=${apiKey()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (e) {
      // Fallo de red — no seguimos probando modelos (no es problema del modelo).
      throw new GeminiError(`No se pudo contactar a Google AI: ${e instanceof Error ? e.message : 'error de red'}`)
    }
    if (res.ok) return { json: await res.json(), model }

    const bodyText = (await res.text()).slice(0, 300)
    if (isModelUnavailable(res.status, bodyText)) {
      lastUnavailable = new GeminiError(`Modelo ${model} no disponible (${res.status})`)
      continue // probar el siguiente candidato
    }
    // Error real (key/cuota/solicitud) — no malgastes probando más modelos.
    throw new GeminiError(friendlyError(res.status, bodyText))
  }
  throw new GeminiError(
    `Ningún modelo de Gemini está disponible para tu cuenta (${order.join(', ')}). ` +
    `Actualiza GEMINI_RESEARCH_MODEL / GEMINI_IMAGE_MODEL. Último detalle: ${lastUnavailable?.message ?? 'desconocido'}`,
  )
}

// ── Investigación de tendencias ──────────────────────────────────────────────
export async function researchTrends(brand: CarouselBrandProfile): Promise<ResearchResult> {
  const today = new Date().toISOString().slice(0, 10)
  const prompt = [
    `Hoy es ${today}. Eres estratega de contenido para ${brand.display_name}, agente de bienes raíces`,
    brand.market ? ` en ${brand.market}` : '',
    `, con foco en la comunidad hispana/latina.`,
    ` Usa búsqueda web para encontrar 3 a 5 temas o noticias EN TENDENCIA esta semana relevantes para esa audiencia,`,
    ` conectables a bienes raíces, finanzas personales o cultura pop.`,
    ` VARÍA los ángulos: no todos sobre precios/tasas. Prefiere tendencias populares NO financieras (un artista, una serie, un evento deportivo como el Mundial 2026, una noticia de celebridad) conectadas de forma creativa y NO forzada a bienes raíces, además de datos duros de mercado con moderación.`,
    ` Cada dato numérico debe tener fuente real citable.`,
    ` Luego ELIGE el mejor tema para un carrusel de Instagram viral y explica por qué es viral ahora.`,
    `\n\nResponde SOLO con un objeto JSON válido (sin markdown, sin texto extra) con esta forma:`,
    `\n{"trends":[{"title":"...","angle":"conexión a bienes raíces","audience":"audiencia específica","source":"fuente citable","url":"opcional"}],"chosen_index":0,"summary":"por qué se eligió y por qué es viral ahora"}`,
  ].join('')

  const { json, model } = await callWithFallback(RESEARCH_MODELS, cachedResearchModel, {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.95 },
  })
  cachedResearchModel = model

  const text: string = (((json?.candidates as unknown[])?.[0] as { content?: { parts?: { text?: string }[] } })?.content?.parts ?? [])
    .map((p) => p?.text ?? '')
    .join('')
  const parsed = extractJson(text)

  const trends: ResearchTrend[] = Array.isArray(parsed?.trends)
    ? (parsed.trends as unknown[])
        .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
        .map((t) => ({
          title:    String(t.title ?? '').trim(),
          angle:    String(t.angle ?? '').trim(),
          audience: String(t.audience ?? '').trim(),
          source:   String(t.source ?? '').trim(),
          url:      typeof t.url === 'string' ? t.url : undefined,
        }))
        .filter((t) => t.title)
    : []

  if (trends.length === 0) throw new GeminiError('La investigación no devolvió tendencias utilizables')

  const idx = Number.isInteger(parsed?.chosen_index) ? Number(parsed.chosen_index) : 0
  const chosen = trends[idx] ?? trends[0]
  return { trends, chosen, summary: String(parsed?.summary ?? '').trim() }
}

// ── Generación de imagen (Nano Banana) ───────────────────────────────────────
export async function generateImage(prompt: string): Promise<Buffer> {
  const { json, model } = await callWithFallback(IMAGE_MODELS, cachedImageModel, {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  })
  cachedImageModel = model

  const parts = (((json?.candidates as unknown[])?.[0] as { content?: { parts?: { inlineData?: { data?: string } }[] } })?.content?.parts ?? [])
  const inline = parts.find((p) => p?.inlineData?.data)?.inlineData?.data
  if (!inline) throw new GeminiError('La respuesta de imagen no contenía datos')
  return Buffer.from(inline, 'base64')
}

// Extrae el primer objeto JSON de un texto (tolera ```json fences o prosa).
function extractJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) throw new GeminiError('No se encontró JSON en la respuesta de investigación')
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    throw new GeminiError('El JSON de investigación no se pudo parsear')
  }
}
