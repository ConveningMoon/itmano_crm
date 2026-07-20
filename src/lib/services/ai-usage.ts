import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Registro de uso de IA ─────────────────────────────────────────────────────
// Cada request a la Claude API desde el CRM inserta una fila en ai_usage_events
// con los tokens reales (del campo `usage` de la respuesta) y el costo en USD
// calculado con la tabla de precios por modelo. El registro es best-effort:
// NUNCA hace fallar la acción que generó el contenido.

export type AiFeature = 'property_intake' | 'email_draft' | 'sequence_bootstrap' | 'hosted_page_copy' | 'lead_fit'

export const AI_FEATURE_LABELS: Record<string, string> = {
  property_intake:    'Propiedades · Crear con IA',
  email_draft:        'Correos · Borrador con IA',
  sequence_bootstrap: 'Secuencias · 3 correos con IA',
  hosted_page_copy:   'Páginas · Copy con IA',
  lead_fit:           'Leads · Análisis de fit',
}

// Precios en USD por millón de tokens (fuente: docs de la Claude API).
// claude-sonnet-5: $3 in / $15 out (precio de lista; hay intro $2/$10 hasta
// 2026-08-31 — usamos el de lista para no subestimar después). Cache read 0.1×,
// cache write 1.25× del precio de entrada.
interface ModelPricing {
  inputPerMTok:      number
  outputPerMTok:     number
  cacheReadPerMTok:  number
  cacheWritePerMTok: number
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-5': { inputPerMTok: 3, outputPerMTok: 15, cacheReadPerMTok: 0.3, cacheWritePerMTok: 3.75 },
  'claude-opus-4-8': { inputPerMTok: 5, outputPerMTok: 25, cacheReadPerMTok: 0.5, cacheWritePerMTok: 6.25 },
  'claude-haiku-4-5': { inputPerMTok: 1, outputPerMTok: 5, cacheReadPerMTok: 0.1, cacheWritePerMTok: 1.25 },
}

// Modelo desconocido → tarifa de sonnet (el modelo por defecto del CRM), para
// nunca registrar costo 0 por un rename.
const DEFAULT_PRICING = MODEL_PRICING['claude-sonnet-5']

// Shape mínimo del `usage` de la respuesta de Anthropic (los campos de cache
// pueden faltar según el SDK/llamada).
export interface AiUsageTokens {
  input_tokens?:                number | null
  output_tokens?:               number | null
  cache_read_input_tokens?:     number | null
  cache_creation_input_tokens?: number | null
}

export function computeCostUsd(model: string, usage: AiUsageTokens): number {
  const p = MODEL_PRICING[model] ?? DEFAULT_PRICING
  const input      = usage.input_tokens ?? 0
  const output     = usage.output_tokens ?? 0
  const cacheRead  = usage.cache_read_input_tokens ?? 0
  const cacheWrite = usage.cache_creation_input_tokens ?? 0
  const cost =
    (input      * p.inputPerMTok +
     output     * p.outputPerMTok +
     cacheRead  * p.cacheReadPerMTok +
     cacheWrite * p.cacheWritePerMTok) / 1_000_000
  // 6 decimales — coincide con numeric(12,6) de la columna.
  return Math.round(cost * 1_000_000) / 1_000_000
}

/**
 * Inserta el registro de uso. Best-effort: cualquier error se loguea y se
 * traga — el contenido generado ya se entregó al usuario.
 */
export async function recordAiUsage(params: {
  tenantId:  string | null
  userId?:   string | null
  feature:   AiFeature
  model:     string
  usage:     AiUsageTokens
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    const supabase = createAdminClient()

    // Atribución por agente: el agente del equipo vinculado al login que generó
    // (agents.user_id). Sostiene el reparto del presupuesto en el plan Partner.
    let agentId: string | null = null
    if (params.userId && params.tenantId) {
      const { data: agent } = await supabase
        .from('agents')
        .select('id')
        .eq('user_id', params.userId)
        .eq('tenant_id', params.tenantId)
        .maybeSingle()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      agentId = ((agent as any)?.id as string | undefined) ?? null
    }

    const { error } = await supabase.from('ai_usage_events').insert({
      tenant_id:             params.tenantId,
      user_id:               params.userId ?? null,
      agent_id:              agentId,
      feature:               params.feature,
      model:                 params.model,
      input_tokens:          params.usage.input_tokens ?? 0,
      output_tokens:         params.usage.output_tokens ?? 0,
      cache_read_tokens:     params.usage.cache_read_input_tokens ?? 0,
      cache_creation_tokens: params.usage.cache_creation_input_tokens ?? 0,
      cost_usd:              computeCostUsd(params.model, params.usage),
      metadata:              params.metadata ?? null,
    })
    if (error) {
      console.error(JSON.stringify({ service: 'ai-usage', error: 'insert_failed', detail: error.message }))
    }
  } catch (e) {
    console.error(JSON.stringify({ service: 'ai-usage', error: 'record_threw', detail: e instanceof Error ? e.message : 'unknown' }))
  }
}
