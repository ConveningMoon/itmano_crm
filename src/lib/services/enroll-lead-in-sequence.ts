import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { processSequenceRun } from '@/lib/services/process-sequence-run'

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
 *  - If the sequence has activation_type='manual' → enrolled: false (no-op)
 *  - On success → inserts lead_sequence_runs row, processes the first email
 *    in-process, returns enrolled: true
 *  - On DB error → logs the error, returns enrolled: false, error: message
 *    The caller MUST NOT rollback the lead creation on enrollment failure.
 *
 * First-email behavior:
 *  After inserting the run, processSequenceRun is called DIRECTLY (in-process,
 *  same DB connection) so the first email sends in seconds. The run is already
 *  committed by the Supabase insert, so there's no row-visibility race and no
 *  HTTP hop — the previous fetch()/after() self-call approach was unreliable
 *  on Vercel. Subsequent steps are still driven by the hourly cron.
 */
export async function enrollLeadInSequence(args: {
  db:                     SupabaseClient
  lead_id:                string
  tenant_id:              string
  acquisition_channel_id: string | null | undefined
}): Promise<EnrollResult> {
  const { db, lead_id, tenant_id, acquisition_channel_id } = args

  if (!acquisition_channel_id) return { enrolled: false }

  // Guard: do not enroll leads whose email channel is permanently blocked.
  // The flag is set by the unsubscribe page (unsubscribed), the Resend webhook
  // (hard_bounce, spam_complaint) and is independent of scoring.
  const { data: leadRow } = await db
    .from('leads')
    .select('email_blocked, email_blocked_reason')
    .eq('id', lead_id)
    .maybeSingle()

  if (leadRow?.email_blocked) {
    console.log(JSON.stringify({
      service:  'enroll-lead-in-sequence',
      lead_id,
      tenant_id,
      result:   'blocked_email',
      reason:   leadRow.email_blocked_reason,
    }))
    return { enrolled: false }
  }

  // 1. Check if the channel has an email sequence
  const { data: channel } = await db
    .from('acquisition_channels')
    .select('email_sequence_id')
    .eq('id', acquisition_channel_id)
    .maybeSingle()

  if (!channel?.email_sequence_id) return { enrolled: false }

  // 1b. Check activation_type — skip if 'manual' (manual sequences require explicit enrollment)
  const { data: seqMeta } = await db
    .from('email_sequences')
    .select('activation_type')
    .eq('id', channel.email_sequence_id)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((seqMeta as any)?.activation_type === 'manual') return { enrolled: false }

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
  const runId = (run as any).id as string

  // 5. Process the first email in-process. The run is already committed, so
  //    there's no row-visibility race. await blocks the response ~1-2s (the
  //    Resend call) which is acceptable for a form submit / manual add.
  //    A failure here never rolls back enrollment — the hourly cron retries.
  try {
    const result = await processSequenceRun({ db, runId })
    console.info(JSON.stringify({
      service: 'enroll-lead-in-sequence',
      result:  'first_email_processed',
      run_id:  runId,
      lead_id,
      action:  result.action,
      reason:  result.reason,
    }))
  } catch (err) {
    console.warn(JSON.stringify({
      service: 'enroll-lead-in-sequence',
      result:  'first_email_failed',
      run_id:  runId,
      lead_id,
      error:   err instanceof Error ? err.message : String(err),
    }))
  }

  return { enrolled: true, sequence_run_id: runId }
}
