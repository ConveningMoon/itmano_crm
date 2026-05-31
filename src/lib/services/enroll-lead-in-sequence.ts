import 'server-only'
import { after } from 'next/server'
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
 *  - If the sequence has activation_type='manual' → enrolled: false (no-op)
 *  - On success → inserts lead_sequence_runs row, fires orchestrator for
 *    immediate first send, returns enrolled: true
 *  - On DB error → logs the error, returns enrolled: false, error: message
 *    The caller MUST NOT rollback the lead creation on enrollment failure.
 *
 * First-email behavior:
 *  After inserting the run, uses next/server `after()` to trigger the
 *  orchestrator after the response has been sent. `after()` keeps the
 *  Vercel function alive until the promise settles — unlike a bare
 *  fire-and-forget fetch which gets cancelled when the function terminates.
 *  If the trigger fails, the hourly cron will still pick it up.
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

  // 5. Trigger orchestrator after the response is sent.
  //    `after()` keeps the Vercel function alive until the promise settles,
  //    unlike a bare fetch() which gets killed when the function terminates.
  //    Scoped to this lead via ?lead_id= to avoid processing unrelated runs.
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const orchestratorUrl = `${baseUrl}/api/cron/sequence-orchestrator?lead_id=${encodeURIComponent(lead_id)}`

    after(
      fetch(orchestratorUrl, {
        method:  'POST',
        headers: { authorization: `Bearer ${cronSecret}` },
      })
        .then(async res => {
          if (res.ok) {
            console.info(JSON.stringify({
              service: 'enroll-lead-in-sequence',
              result:  'orchestrator_triggered_ok',
              run_id:  runId,
              lead_id,
            }))
          } else {
            console.warn(JSON.stringify({
              service:     'enroll-lead-in-sequence',
              result:      'orchestrator_trigger_failed',
              run_id:      runId,
              lead_id,
              http_status: res.status,
              body:        await res.text(),
            }))
          }
        })
        .catch(err => {
          console.warn(JSON.stringify({
            service: 'enroll-lead-in-sequence',
            result:  'orchestrator_trigger_failed',
            run_id:  runId,
            lead_id,
            error:   err instanceof Error ? err.message : String(err),
          }))
        })
    )
  }

  return { enrolled: true, sequence_run_id: runId }
}
