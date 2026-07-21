import 'server-only'
import type { CarouselBrandProfile, ResearchResult, ResearchTrend } from './types'

// Cliente de Google AI (Gemini) para dos pasos del pipeline:
//   1. Investigación de tendencias con grounding (`google_search`).
//   2. Generación de fondos editoriales con Nano Banana (gemini image).
// API keys directas (GOOGLE_AI_API_KEY), REST v1beta — sin SDK, igual de simple
// que el resto de integraciones externas del CRM.
//
// Nota de costos: estas llamadas van al free tier de Google y NO se registran en
// ai_usage_events (esa tabla y su tabla de precios son solo para la Claude API;
// mezclar Gemini falsearía el costo en USD de los dashboards del super_admin).

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const RESEARCH_MODEL = 'gemini-2.5-flash'       // grounding con google_search
const IMAGE_MODEL = 'gemini-2.5-flash-image'    // "Nano Banana"

export class GeminiError extends Error {}

function apiKey(): string {
  const k = process.env.GOOGLE_AI_API_KEY
  if (!k) throw new GeminiError('Falta GOOGLE_AI_API_KEY')
  return k
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

  const res = await fetch(`${BASE}/${RESEARCH_MODEL}:generateContent?key=${apiKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.95 },
    }),
  })
  if (!res.ok) {
    throw new GeminiError(`Investigación falló (${res.status}): ${(await res.text()).slice(0, 300)}`)
  }
  const json = await res.json()
  const text: string = (json?.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p?.text ?? '')
    .join('')
  const parsed = extractJson(text)

  const trends: ResearchTrend[] = Array.isArray(parsed?.trends)
    ? parsed.trends
        .filter((t: unknown): t is Record<string, unknown> => !!t && typeof t === 'object')
        .map((t: Record<string, unknown>) => ({
          title:    String(t.title ?? '').trim(),
          angle:    String(t.angle ?? '').trim(),
          audience: String(t.audience ?? '').trim(),
          source:   String(t.source ?? '').trim(),
          url:      typeof t.url === 'string' ? t.url : undefined,
        }))
        .filter((t: ResearchTrend) => t.title)
    : []

  if (trends.length === 0) throw new GeminiError('La investigación no devolvió tendencias utilizables')

  const idx = Number.isInteger(parsed?.chosen_index) ? Number(parsed.chosen_index) : 0
  const chosen = trends[idx] ?? trends[0]
  return { trends, chosen, summary: String(parsed?.summary ?? '').trim() }
}

// ── Generación de imagen (Nano Banana) ───────────────────────────────────────
// Devuelve el PNG/JPEG crudo. El compositor lo recorta a 4:5 y lo funde en la
// textura crema. `prompt` debe venir ya validado (< 1000 chars, sin personas
// reales identificables) desde el paso de copy.
export async function generateImage(prompt: string): Promise<Buffer> {
  const res = await fetch(`${BASE}/${IMAGE_MODEL}:generateContent?key=${apiKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  })
  if (!res.ok) {
    throw new GeminiError(`Generación de imagen falló (${res.status}): ${(await res.text()).slice(0, 300)}`)
  }
  const json = await res.json()
  const parts: Array<{ inlineData?: { data?: string } }> = json?.candidates?.[0]?.content?.parts ?? []
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
