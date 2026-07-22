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

// Momento sugerido para la próxima acción — NO es un score que compita con la
// temperatura (esa mide qué tan bueno es el lead). El `when` es la premura de la
// ACCIÓN, anclada al disparador: una respuesta o visita agendada exige 'hoy'
// aunque el score sea bajo; un lead valioso pero ya en proceso puede ser 'sin_apuro'.
const WHEN_VALUES = ['hoy', 'esta_semana', 'sin_apuro'] as const
export type NextActionWhen = typeof WHEN_VALUES[number]

function buildTool(dims: Dimension[]) {
  const properties: Record<string, unknown> = {
    // Briefing accionable para el agente (lo que un buen director de ventas diría
    // en 10 segundos antes de llamar). Todo en el idioma del lead.
    read:             { type: 'string', description: 'La LECTURA del lead en una frase: quién es, su motivación real, su urgencia u obstáculo principal. Interpretación, no resumen de datos.' },
    next_action:      { type: 'string', description: 'LA próxima mejor acción, UNA sola, concreta y con verbo (llamar / escribir / agendar / esperar). Incluye brevemente el porqué, anclado a lo que el lead acaba de hacer.' },
    next_action_when: { type: 'string', enum: [...WHEN_VALUES], description: "Premura de esa acción: 'hoy' si hay una ventana caliente (respuesta reciente, visita agendada, valuación, consulta concreta); 'esta_semana' para seguimiento activo; 'sin_apuro' si está en proceso estable o solo explorando. Ánclalo a señales reales, no lo infles." },
    talking_points:   { type: 'array', items: { type: 'string' }, description: '2 o 3 puntos concretos de qué decir/mencionar en ese contacto.' },
    watch_out:        { type: 'string', description: 'El riesgo u objeción principal a anticipar (ej.: ya trabaja con otro agente, presupuesto por debajo del inventario). Cadena vacía si no hay ninguno claro.' },
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
    description: 'Clasifica al lead en los buckets de fit Y prepara un briefing accionable para el agente, según las respuestas, el historial y el contexto de mercado de la agencia.',
    input_schema: { type: 'object' as const, properties, required: ['read', 'next_action', 'next_action_when', 'talking_points', ...dims] },
  }
}

interface AnswerItem { key?: string; question?: string; value?: unknown; label?: unknown }

// Briefing accionable derivado del análisis (se guarda en metadata.ai_fit y se
// muestra en la tarjeta del lead).
export interface LeadBriefing {
  read:          string
  nextAction:    string
  when:          NextActionWhen
  talkingPoints: string[]
  watchOut:      string
}

export interface FitAssessResult { ok: boolean; skipped?: string; error?: string; briefing?: LeadBriefing }

function skip(reason: string, leadId: string): FitAssessResult {
  console.log(JSON.stringify({ service: 'ai-lead-fit', lead_id: leadId, skipped: reason }))
  return { ok: false, skipped: reason }
}

// Frase humana del disparador — se le da a la IA para anclar la premura (`when`).
const TRIGGER_PHRASE: Record<string, string> = {
  form_submit:  'El lead acaba de enviar/actualizar un formulario.',
  contact_form: 'El lead acaba de escribir por un formulario de contacto.',
  email_reply:  'El lead acaba de RESPONDER un correo (ventana caliente).',
  manual:       'El agente pidió el análisis manualmente antes de contactarlo.',
  action:       'Se registró actividad del lead.',
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

    // Qué disparó este análisis (para anclar el `when` de la próxima acción).
    const triggerPhrase = TRIGGER_PHRASE[input.reason ?? 'action'] ?? 'Se pidió un análisis del lead.'

    const prompt = [
      'Eres el analista de ventas de una agencia inmobiliaria. Con TODA la información del lead haces DOS cosas con el tool:',
      '1) Clasificas al lead en los buckets de fit. 2) Preparas un BRIEFING accionable para que el agente sepa exactamente qué hacer ahora con este lead.',
      'Regla clave del fit: el nivel de presupuesto (budget_tier) es RELATIVO al mercado de la agencia — el mismo monto puede ser premium en un mercado y de entrada en otro. Usa el contexto de la agencia.',
      'Reglas del briefing: UNA sola próxima acción (no una lista). Concreta y ejecutable. Escribe TODO en el idioma del lead. No inventes datos ni programas que no aparezcan en el contexto; si una dimensión de fit no se puede determinar, usa "unknown".',
      'El `next_action_when` es la PREMURA de la acción, NO qué tan bueno es el lead (eso ya lo mide el score). Ánclalo a lo que el lead ACABA de hacer y a su historial: una respuesta, una visita agendada, una valuación o una consulta concreta = "hoy" aunque el score sea bajo; un lead ya en proceso estable o solo explorando puede ser "sin_apuro" aunque el score sea alto.',
      '',
      `Disparador de este análisis: ${triggerPhrase}`,
      '',
      `Agencia: ${tenant.name}.`,
      tenant.description ? `Contexto y mercado de la agencia:\n${tenant.description}` : 'Contexto de la agencia: no especificado.',
      agentName ? `Agente asignado: ${agentName}.${agentDesc ? ' ' + agentDesc : ''}` : null,
      '',
      `Lead: ${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim() + '.',
      `Estado actual: ${lead.status}${frozen ? ' (congelado / post-embudo)' : ''}. Idioma: ${lead.language ?? 'es'}.${lead.phone ? ' Tiene teléfono.' : ' Sin teléfono.'}`,
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
      max_tokens: 1000,
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
    // Briefing accionable (saneado).
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
    const when: NextActionWhen = (WHEN_VALUES as readonly string[]).includes(out.next_action_when as string)
      ? (out.next_action_when as NextActionWhen)
      : 'esta_semana'
    const briefing: LeadBriefing = {
      read:          str(out.read, 400),
      nextAction:    str(out.next_action, 400),
      when,
      talkingPoints: Array.isArray(out.talking_points)
        ? out.talking_points.filter((t): t is string => typeof t === 'string').map(t => t.trim().slice(0, 240)).filter(Boolean).slice(0, 3)
        : [],
      watchOut:      str(out.watch_out, 300),
    }
    const currentMeta = (lead.metadata && typeof lead.metadata === 'object') ? lead.metadata as Record<string, unknown> : {}

    const { error: updErr } = await db.from('leads').update({
      fit_profile: nextProfile,
      metadata: {
        ...currentMeta,
        ai_fit: {
          read: briefing.read, next_action: briefing.nextAction, next_action_when: briefing.when,
          talking_points: briefing.talkingPoints, watch_out: briefing.watchOut,
          at: new Date().toISOString(), reason: input.reason ?? 'action',
        },
      },
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
    console.log(JSON.stringify({ service: 'ai-lead-fit', lead_id: input.leadId, result: 'ok', reason: input.reason ?? 'action', when: briefing.when }))
    return { ok: true, briefing }
  } catch (e) {
    console.error(JSON.stringify({ service: 'ai-lead-fit', error: 'assess_threw', detail: e instanceof Error ? e.message : 'unknown' }))
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' }
  }
}
