import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { processSequenceRun } from '@/lib/services/process-sequence-run'
import { resolveLeadEmailLanguage } from '@/lib/services/lead-email-language'
import { ACTIVE_STAGES } from '@/lib/scoring/priority'

// Disparo de la secuencia de una etiqueta (117).
//
// Etiquetar un lead con "contactado sin respuesta" lo inscribe en la secuencia
// de ESA etiqueta EN SU IDIOMA. Es el mismo patrón que los correos de hitos del
// proceso de compra: el correo sale de un hecho del CRM, no de una campaña que
// alguien decide mandar.
//
// Las guardas son deliberadamente las mismas que las de enrollLeadInSequence
// (canal → secuencia) más dos propias de este disparador: el idioma y la etapa.

/* eslint-disable @typescript-eslint/no-explicit-any */

export type TagEnrollReason =
  // La etiqueta no tiene ninguna secuencia — el caso NORMAL de la mayoría
  // ("pre-aprobado" describe al lead y no manda nada). No es un fallo.
  | 'no_sequence'
  // La etiqueta tiene secuencias, pero no en el idioma que le toca a este lead.
  // Se etiqueta igual y no se manda nada: mandar en otro idioma sería peor.
  | 'no_sequence_for_language'
  | 'no_steps'
  | 'email_blocked'
  | 'already_active'
  // El lead ya salió del embudo vivo (en proceso, cerrado o perdido). Una
  // secuencia de nutrición ahí contradice lo que el agente está haciendo.
  | 'out_of_funnel'
  | 'error'

export type TagEnrollResult =
  | { enrolled: true;  sequenceId: string; sequenceName: string; language: string; runId: string }
  | { enrolled: false; reason: TagEnrollReason; language?: string }

export async function enrollLeadByTag(args: {
  db:        SupabaseClient
  lead_id:   string
  tag_id:    string
  tenant_id: string
}): Promise<TagEnrollResult> {
  const { db, lead_id, tag_id, tenant_id } = args

  // 1. Lead + su agente en un join: el idioma efectivo depende de los idiomas
  //    que el agente atiende, no sólo del lead.
  const { data: leadRow } = await db
    .from('leads')
    .select('id, stage, language, email_blocked, email_blocked_reason, agents (id, language, languages)')
    .eq('id', lead_id)
    .maybeSingle()

  if (!leadRow) return { enrolled: false, reason: 'error' }

  const lead  = leadRow as any
  const agent = Array.isArray(lead.agents) ? lead.agents[0] : lead.agents

  if (!(ACTIVE_STAGES as string[]).includes(lead.stage as string)) {
    return { enrolled: false, reason: 'out_of_funnel' }
  }

  // Canal de email bloqueado (baja, hard bounce, queja de spam). Igual que en
  // enrollLeadInSequence: la etiqueta se pone, el correo no sale.
  if (lead.email_blocked) {
    return { enrolled: false, reason: 'email_blocked' }
  }

  const language = resolveLeadEmailLanguage(
    agent?.languages as string[] | null,
    (agent?.language as string | undefined) ?? 'es',
    lead.language as string | null,
  )

  // 2. Secuencias activas de esta etiqueta. Se traen todas las del tenant (son
  //    una por idioma) para poder distinguir "esta etiqueta no manda correos" de
  //    "manda, pero no en este idioma" — dos cosas que se le dicen distinto a
  //    quien etiquetó.
  const { data: seqRows } = await db
    .from('email_sequences')
    .select('id, name, language')
    .eq('tenant_id', tenant_id)
    .eq('trigger_tag_id', tag_id)
    .eq('active', true)

  const sequences = (seqRows ?? []) as any[]
  if (sequences.length === 0) return { enrolled: false, reason: 'no_sequence' }

  const sequence = sequences.find(s => s.language === language)
  if (!sequence) return { enrolled: false, reason: 'no_sequence_for_language', language }

  // 3. Primer paso activo.
  const { data: firstStep } = await db
    .from('email_sequence_steps')
    .select('step_order, delay_hours')
    .eq('sequence_id', sequence.id)
    .eq('active', true)
    .order('step_order', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!firstStep) return { enrolled: false, reason: 'no_steps', language }

  // 4. Una corrida activa por (lead, secuencia). El índice parcial de la 006 ya
  //    lo garantiza; comprobarlo antes permite decir "ya estaba" en vez de
  //    devolver un error de constraint.
  const { data: existing } = await db
    .from('lead_sequence_runs')
    .select('id')
    .eq('lead_id', lead_id)
    .eq('sequence_id', sequence.id)
    .eq('status', 'active')
    .maybeSingle()

  if (existing) return { enrolled: false, reason: 'already_active', language }

  const nextSendAt = new Date(
    Date.now() + ((firstStep as any).delay_hours ?? 0) * 60 * 60 * 1000
  ).toISOString()

  const { data: run, error } = await db
    .from('lead_sequence_runs')
    .insert({
      tenant_id,
      lead_id,
      sequence_id:        sequence.id,
      current_step_order: (firstStep as any).step_order,
      status:             'active',
      next_send_at:       nextSendAt,
    })
    .select('id')
    .single()

  if (error) {
    console.error(JSON.stringify({
      service: 'enroll-lead-by-tag', lead_id, tag_id, tenant_id, error: error.message,
    }))
    return { enrolled: false, reason: 'error', language }
  }

  const runId = (run as any).id as string

  // 5. El primer correo se procesa en proceso (misma decisión que
  //    enrollLeadInSequence): la corrida ya está commiteada, así que no hay
  //    carrera de visibilidad y quien etiquetó ve el resultado al instante. Un
  //    fallo aquí NO deshace la inscripción — el cron horario reintenta.
  try {
    const result = await processSequenceRun({ db, runId })
    console.info(JSON.stringify({
      service: 'enroll-lead-by-tag', result: 'first_email_processed',
      run_id: runId, lead_id, tag_id, action: result.action, reason: result.reason,
    }))
  } catch (err) {
    console.warn(JSON.stringify({
      service: 'enroll-lead-by-tag', result: 'first_email_failed',
      run_id: runId, lead_id, tag_id,
      error: err instanceof Error ? err.message : String(err),
    }))
  }

  return {
    enrolled:     true,
    sequenceId:   sequence.id as string,
    sequenceName: sequence.name as string,
    language,
    runId,
  }
}

/**
 * Cancela las corridas activas de las secuencias de una etiqueta para un lead.
 *
 * Se llama al QUITAR la etiqueta. Sin esto el lead seguiría recibiendo los pasos
 * siguientes de una etiqueta que ya no tiene, que es el fallo más obvio de este
 * disparador y el más difícil de explicar a quien lo ve.
 *
 * @returns cuántas corridas se cancelaron.
 */
export async function cancelTagSequenceRuns(args: {
  db:        SupabaseClient
  lead_id:   string
  tag_id:    string
  tenant_id: string
}): Promise<number> {
  const { db, lead_id, tag_id, tenant_id } = args

  const { data: seqRows } = await db
    .from('email_sequences')
    .select('id')
    .eq('tenant_id', tenant_id)
    .eq('trigger_tag_id', tag_id)

  const ids = ((seqRows ?? []) as any[]).map(s => s.id as string)
  if (ids.length === 0) return 0

  const { data, error } = await db
    .from('lead_sequence_runs')
    .update({
      status:           'cancelled',
      cancelled_reason: 'tag_removed',
      completed_at:     new Date().toISOString(),
    })
    .eq('lead_id', lead_id)
    .eq('status',  'active')
    .in('sequence_id', ids)
    .select('id')

  if (error) {
    console.error(JSON.stringify({
      service: 'cancel-tag-sequence-runs', lead_id, tag_id, error: error.message,
    }))
    return 0
  }

  return (data ?? []).length
}
