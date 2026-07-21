import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// Log/ledger del proceso de creación (tabla carousel_logs, migración 068).
// Best-effort: nunca lanza — un fallo al loguear no debe romper la generación.
// También hace console.error de los niveles error/warn para verlos en Vercel.

// Costos estimados de Google (no dan billing exacto; el free tier no factura,
// pero se muestra una referencia). El copy (Claude) se loguea con costo real.
export const CAROUSEL_PRICING = {
  imageEstUsd: 0.039,    // Nano Banana (gemini image), aprox por imagen generada
  researchEstUsd: 0.003, // Gemini flash con grounding, aprox por investigación
} as const

export type CarouselLogStep =
  | 'start' | 'research' | 'copy' | 'image' | 'compose' | 'upload' | 'render' | 'delete'

export interface CarouselLogEntry {
  jobId:         string
  slideNumber?:  number | null
  level?:        'info' | 'warn' | 'error'
  step:          CarouselLogStep
  message:       string
  provider?:     string
  model?:        string
  billing?:      'real' | 'estimado'
  costUsd?:      number
  inputTokens?:  number
  outputTokens?: number
  detail?:       Record<string, unknown>
}

export async function logCarousel(e: CarouselLogEntry): Promise<void> {
  const level = e.level ?? 'info'
  if (level !== 'info') {
    // Espejo a los logs de Vercel para diagnóstico inmediato.
    console.error(JSON.stringify({ service: 'carousel', level, step: e.step, job_id: e.jobId, slide: e.slideNumber ?? null, message: e.message, detail: e.detail ?? null }))
  }
  try {
    const db = createAdminClient()
    await db.from('carousel_logs').insert({
      job_id:        e.jobId,
      slide_number:  e.slideNumber ?? null,
      level,
      step:          e.step,
      message:       e.message,
      provider:      e.provider ?? null,
      model:         e.model ?? null,
      billing:       e.billing ?? null,
      cost_usd:      e.costUsd ?? null,
      input_tokens:  e.inputTokens ?? null,
      output_tokens: e.outputTokens ?? null,
      detail:        e.detail ?? null,
    })
  } catch (err) {
    console.error(JSON.stringify({ service: 'carousel-log', error: err instanceof Error ? err.message : 'unknown' }))
  }
}
