import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAiUsage } from '@/lib/services/ai-usage'
import { getAiLimitStatus } from '@/lib/services/ai-limit'

// ── Análisis de fit de leads con IA (fase de prueba, apagado por tenant) ──────
//
// La IA INTERPRETA: lee las respuestas del formulario del lead + el contexto de
// la agencia y del agente + el mercado, y produce los buckets de fit adecuados
// PARA ESE mercado. Escribe leads.fit_profile y llama a recompute_lead_score,
// que valora los buckets con las reglas ajustables (Ajustes → Scoring). No
// duplica puntaje: la IA interpreta, las reglas valoran.
//
// Best-effort y gated: si el tenant tiene el toggle apagado, falta la API key,
// o el presupuesto de IA está agotado, no hace nada. NUNCA lanza al llamador
// (el intake ya entregó su respuesta al visitante).

const MODEL = 'claude-haiku-4-5'

// Buckets válidos por dimensión — deben coincidir con lead_score_rules
// (migración 029). La IA solo puede elegir de estos valores.
const BUCKETS = {
  timeline:        ['under_3_months', '3_6_months', '6_12_months', 'over_12_explorando'],
  financing:       ['cash', 'preapproved', 'in_process', 'not_started'],
  budget_tier:     ['premium', 'mid', 'entry', 'undefined'],
  agent_status:    ['sin_agente', 'con_agente'],
  sell_motivation: ['alta', 'media', 'baja'],
  listing_status:  ['no_listado_sin_agente', 'ya_listado_con_agente'],
} as const

type Dimension = keyof typeof BUCKETS

const BUY_DIMS:  Dimension[] = ['timeline', 'financing', 'budget_tier', 'agent_status']
const SELL_DIMS: Dimension[] = ['sell_motivation', 'timeline', 'listing_status']

const DIM_LABEL: Record<Dimension, string> = {
  timeline:        'Horizonte de compra/venta',
  financing:       'Situación de financiamiento',
  budget_tier:     'Nivel de presupuesto RELATIVO al mercado de la agencia',
  agent_status:    '¿Ya trabaja con otro agente?',
  sell_motivation: 'Motivación de venta',
  listing_status:  'Estado del listado',
}

function buildTool(dims: Dimension[]) {
  const properties: Record<string, unknown> = {
    reasoning: { type: 'string', description: 'Una o dos frases explicando la clasificación, en el idioma del lead. Concreto, sin relleno.' },
  }
  for (const d of dims) {
    properties[d] = {
      type: 'string',
      enum: [...BUCKETS[d], 'unknown'],
      description: `${DIM_LABEL[d]}. Usa 'unknown' si la información no permite decidir.`,
    }
  }
  return {
    name: 'assess_lead_fit',
    description: 'Clasifica al lead en los buckets de fit según sus respuestas y el contexto de mercado de la agencia.',
    input_schema: { type: 'object' as const, properties, required: ['reasoning', ...dims] },
  }
}

interface AnswerItem { key?: string; question?: string; value?: unknown; label?: unknown }

export interface FitAssessResult { ok: boolean; skipped?: string; error?: string; reasoning?: string }

function skip(reason: string, leadId: string): FitAssessResult {
  console.log(JSON.stringify({ service: 'ai-lead-fit', lead_id: leadId, skipped: reason }))
  return { ok: false, skipped: reason }
}

// Analiza el fit del lead con IA tomando TODA su información: respuestas de
// formularios, historial de actividad, scoring actual, contacto, y el contexto
// de agencia/agente/mercado. Se dispara en cada acción del lead (formulario,
// respuesta de correo…) y también manualmente. `reason` etiqueta el disparador.
export async function assessLeadFit(input: { leadId: string; tenantId: string; reason?: string }): Promise<FitAssessResult> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return skip('no_api_key', input.leadId)
    const db = createAdminClient()

    // Tenant: gate por toggle + contexto de mercado.
    const { data: tenantRow } = await db
      .from('tenants')
      .select('name, description, ai_lead_scoring_enabled')
      .eq('id', input.tenantId)
      .maybeSingle()
    const tenant = tenantRow as { name: string; description: string | null; ai_lead_scoring_enabled: boolean } | null
    if (!tenant) return skip('tenant_not_found', input.leadId)
    if (!tenant.ai_lead_scoring_enabled) return skip('scoring_disabled', input.leadId)

    // Presupuesto de IA del mes.
    const limit = await getAiLimitStatus(input.tenantId)
    if (limit.blocked) return skip('budget_blocked', input.leadId)

    // Lead + intent + estado + scoring actual.
    const { data: leadRow } = await db
      .from('leads')
      .select('id, first_name, last_name, email, phone, language, status, agent_id, fit_profile, metadata, fit_score, engagement_score, manual_score, current_score')
      .eq('id', input.leadId)
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lead = leadRow as any
    if (!lead) return skip('lead_not_found', input.leadId)
    // Los estados post-funnel están congelados: recompute no cambia su score,
    // pero igual analizamos y guardamos el razonamiento (el usuario pidió que
    // TODA acción del lead se analice).
    const frozen = ['process_started', 'process_completed', 'closed', 'lost'].includes(lead.status as string)

    const intent = (lead.metadata?.intent as string | undefined) ?? null
    const dims: Dimension[] = intent === 'sell' ? SELL_DIMS : BUY_DIMS

    // Agente asignado (contexto para personalizar).
    let agentName = ''
    let agentDesc = ''
    if (lead.agent_id) {
      const { data: agentRow } = await db.from('agents').select('name, description').eq('id', lead.agent_id).maybeSingle()
      const a = agentRow as { name: string; description: string | null } | null
      agentName = a?.name ?? ''
      agentDesc = a?.description ?? ''
    }

    // Respuestas del lead (todas sus fuentes, más recientes primero).
    const { data: subsRows } = await db
      .from('form_submissions')
      .select('answers, submitted_at')
      .eq('lead_id', input.leadId)
      .order('submitted_at', { ascending: false })
      .limit(5)
    const answers: AnswerItem[] = []
    for (const s of (subsRows ?? []) as { answers: unknown }[]) {
      if (Array.isArray(s.answers)) answers.push(...(s.answers as AnswerItem[]))
    }
    const answerLines = answers
      .map(a => `- ${a.question ?? a.key ?? '¿?'}: ${a.label ?? a.value ?? ''}`)
      .filter(l => l.trim().length > 3)
      .slice(0, 40)

    // Historial de actividad (lead_events): da comportamiento + señales al análisis.
    const { data: eventRows } = await db
      .from('lead_events')
      .select('type, description, points, created_at')
      .eq('lead_id', input.leadId)
      .order('created_at', { ascending: false })
      .limit(25)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activityLines = ((eventRows ?? []) as any[])
      .map(e => `- ${new Date(e.created_at).toISOString().slice(0, 10)} · ${e.type}${e.description ? `: ${String(e.description).slice(0, 120)}` : ''}${e.points ? ` (${e.points > 0 ? '+' : ''}${e.points} pts)` : ''}`)

    const prompt = [
      'Eres analista de leads inmobiliarios. Con TODA la información del lead, clasifícalo en los buckets de fit usando el tool.',
      'Regla clave: el nivel de presupuesto (budget_tier) es RELATIVO al mercado de la agencia — el mismo monto puede ser premium en un mercado y de entrada en otro. Usa el contexto de la agencia para decidir.',
      'Toma en cuenta el historial de actividad y el scoring actual como señales de intención. No inventes datos: si una dimensión no se puede determinar, usa "unknown".',
      '',
      `Agencia: ${tenant.name}.`,
      tenant.description ? `Contexto y mercado de la agencia:\n${tenant.description}` : 'Contexto de la agencia: no especificado.',
      agentName ? `Agente asignado: ${agentName}.${agentDesc ? ' ' + agentDesc : ''}` : null,
      '',
      `Lead: ${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim() + '.',
      `Estado actual: ${lead.status}${frozen ? ' (congelado / post-embudo)' : ''}. Idioma: ${lead.language ?? 'es'}.${lead.phone ? ' Tiene teléfono.' : ''}`,
      intent ? `Intención declarada: ${intent}.` : null,
      `Scoring actual — total ${lead.current_score ?? 0}/100 (fit ${lead.fit_score ?? 0}, engagement ${lead.engagement_score ?? 0}, manual ${lead.manual_score ?? 0}).`,
      '',
      'Respuestas de formularios:',
      answerLines.length ? answerLines.join('\n') : '(sin respuestas de formulario)',
      '',
      'Historial de actividad (más reciente primero):',
      activityLines.length ? activityLines.join('\n') : '(sin actividad registrada)',
    ].filter((l): l is string => l !== null).join('\n')

    const anthropic = new Anthropic()
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 700,
      tools: [buildTool(dims)],
      tool_choice: { type: 'tool', name: 'assess_lead_fit' },
      messages: [{ role: 'user', content: prompt }],
    })

    // Registro de uso (con lead_id para el costo por lead en el hub).
    const leadName = `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim() || 'Lead'
    await recordAiUsage({
      tenantId: input.tenantId,
      userId:   null,
      feature:  'lead_fit',
      model:    MODEL,
      usage:    message.usage,
      metadata: { lead_id: input.leadId, lead_name: leadName, reason: input.reason ?? 'action' },
    })

    const block = message.content.find(b => b.type === 'tool_use')
    if (!block || block.type !== 'tool_use') return { ok: false, error: 'La IA no devolvió el análisis.' }
    const out = block.input as Record<string, unknown>

    // Merge de buckets válidos en fit_profile (latest-wins). 'unknown' no escribe.
    const currentProfile = (lead.fit_profile && typeof lead.fit_profile === 'object') ? lead.fit_profile as Record<string, unknown> : {}
    const nextProfile: Record<string, unknown> = { ...currentProfile }
    for (const d of dims) {
      const v = out[d]
      if (typeof v === 'string' && v !== 'unknown' && (BUCKETS[d] as readonly string[]).includes(v)) {
        nextProfile[d] = v
      }
    }
    const reasoning = typeof out.reasoning === 'string' ? out.reasoning.trim().slice(0, 600) : ''
    const currentMeta = (lead.metadata && typeof lead.metadata === 'object') ? lead.metadata as Record<string, unknown> : {}

    const { error: updErr } = await db.from('leads').update({
      fit_profile: nextProfile,
      metadata: { ...currentMeta, ai_fit: { reasoning, at: new Date().toISOString(), model: MODEL } },
    }).eq('id', input.leadId)
    if (updErr) {
      console.error(JSON.stringify({ service: 'ai-lead-fit', lead_id: input.leadId, error: 'fit_update_failed', detail: updErr.message }))
      return { ok: false, error: 'No se pudo guardar el análisis.' }
    }

    // Revalora con las reglas ajustables (no-op si el lead está congelado).
    const { error: recErr } = await db.rpc('recompute_lead_score', { p_lead_id: input.leadId })
    if (recErr) {
      console.error(JSON.stringify({ service: 'ai-lead-fit', lead_id: input.leadId, error: 'recompute_failed', detail: recErr.message }))
    }
    console.log(JSON.stringify({ service: 'ai-lead-fit', lead_id: input.leadId, result: 'ok', reason: input.reason ?? 'action' }))
    return { ok: true, reasoning }
  } catch (e) {
    console.error(JSON.stringify({ service: 'ai-lead-fit', error: 'assess_threw', detail: e instanceof Error ? e.message : 'unknown' }))
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' }
  }
}
