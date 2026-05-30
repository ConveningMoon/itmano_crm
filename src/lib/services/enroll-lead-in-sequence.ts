import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface EnrollResult {
  enrolled:        boolean
  sequence_run_id?: string
  error?:          string
}

/**
 * Enroll a newly created lead into the email sequence associated with
 * its acquisition channel (if any).
 *
 * Called by both the intake submit route and the manual lead creation
 * action — keeps the two enrollment paths byte-identical.
 *
 * Behavior:
 *  - If acquisition_channel_id is null/undefined → enrolled: false (no-op)
 *  - If the channel has no email_sequence_id → enrolled: false (no-op)
 *  - If the sequence has no active steps → enrolled: false (no-op)
 *  - On success → inserts lead_sequence_runs row, returns enrolled: true
 *  - On DB error → logs the error, returns enrolled: false, error: message
 *    The caller MUST NOT rollback the lead creation on enrollment failure.
 */
export async function enrollLeadInSequence(args: {
  db:                     SupabaseClient
  lead_id:                string
  tenant_id:              string
  acquisition_channel_id: string | null | undefined
}): Promise<EnrollResult> {
  const { db, lead_id, tenant_id, acquisition_channel_id } = args

  if (!acquisition_channel_id) return { enrolled: false }

  // 1. Check if the channel has an email sequence
  const { data: channel } = await db
    .from('acquisition_channels')
    .select('email_sequence_id')
    .eq('id', acquisition_channel_id)
    .maybeSingle()

  if (!channel?.email_sequence_id) return { enrolled: false }

  // 2. Fetch the first active step (lowest step_order)
  const { data: firstStep } = await db
    .from('email_sequence_steps')
    .select('step_order, delay_hours')
    .eq('sequence_id', channel.email_sequence_id)
    .eq('active', true)
    .order('step_order', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!firstStep) return { enrolled: false }

  // 3. Calculate send time using the first step's delay
  const nextSendAt = new Date(
    Date.now() + (firstStep.delay_hours ?? 0) * 60 * 60 * 1000
  ).toISOString()

  // 4. Insert the run
  const { data: run, error } = await db
    .from('lead_sequence_runs')
    .insert({
      tenant_id,
      lead_id,
      sequence_id:         channel.email_sequence_id,
      current_step_order:  firstStep.step_order,
      status:              'active',
      next_send_at:        nextSendAt,
    })
    .select('id')
    .single()

  if (error) {
    console.error(JSON.stringify({
      service:   'enroll-lead-in-sequence',
      lead_id,
      tenant_id,
      error:     error.message,
    }))
    return { enrolled: false, error: error.message }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { enrolled: true, sequence_run_id: (run as any).id }
}
