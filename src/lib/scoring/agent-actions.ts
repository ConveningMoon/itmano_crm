// Qué cuenta como "el agente hizo algo con este lead".
//
// Existía una lista hardcodeada en la analítica de briefings con los nombres de
// la migración 009: `score_manual`, `phone_call`, `consultation_scheduled`,
// `consultation_attended`. Una migración posterior renombró el catálogo de
// acciones manuales a `visit_attended`, `proposal_sent`, `appointment_scheduled`,
// `no_show_no_answer` y `manual_disqualify`, y la lista se quedó atrás.
//
// El efecto era silencioso y del peor tipo: un agente que registraba una visita
// y cerraba el trato contaba como "no siguió la recomendación". La métrica que
// existe para responder "¿sirve hacerle caso a la IA?" estaba midiendo lo
// contrario de lo que creía.
//
// Por eso la lista ya NO se escribe a mano. Las acciones manuales se leen de
// `lead_score_rules`, que es donde viven de verdad: si mañana se agrega una
// regla manual nueva, cuenta sola.

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Acciones del agente que NO son reglas de scoring y por eso no salen de
 * `lead_score_rules`:
 *
 * - `manual_email_sent`  — correo one-off escrito por el agente.
 * - `status_changed`     — movió la etapa (inició proceso, cerró, dio por perdido).
 */
export const FIXED_AGENT_ACTION_TYPES = ['manual_email_sent', 'status_changed'] as const

/** Une las dimensiones manuales con las fijas, sin repetir y en orden estable. */
export function agentActionTypes(manualDimensions: readonly string[]): string[] {
  return [...new Set([...FIXED_AGENT_ACTION_TYPES, ...manualDimensions])].sort()
}

/**
 * Los tipos de evento que cuentan como acción del agente para este tenant.
 *
 * Ante un fallo de lectura devuelve sólo las fijas: es mejor subcontar que
 * romper el panel — pero nunca se devuelve vacío, porque una lista vacía haría
 * que TODO pareciera "no seguido", que es justo el error que esto viene a
 * corregir.
 */
export async function getAgentActionTypes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- el cliente no está tipado con el esquema
  db: SupabaseClient<any, any, any>,
  tenantId: string | null,
): Promise<string[]> {
  let q = db
    .from('lead_score_rules')
    .select('dimension')
    .eq('category', 'manual')
    .eq('is_active', true)
  // Reglas globales + el override del tenant, igual que recompute_lead_score.
  if (tenantId) q = q.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)

  const { data, error } = await q
  if (error || !data) {
    console.error(JSON.stringify({ service: 'agent-actions', error: error?.message ?? 'sin datos' }))
    return agentActionTypes([])
  }

  const dims = (data as { dimension: string }[])
    .map(r => r.dimension)
    .filter((d): d is string => typeof d === 'string' && d.length > 0)

  return agentActionTypes(dims)
}
