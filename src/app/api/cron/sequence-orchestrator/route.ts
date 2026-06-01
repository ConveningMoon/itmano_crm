import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processSequenceRun } from '@/lib/services/process-sequence-run'

interface DryRunDetail {
  run_id:        string
  lead_email:    string
  sequence_name: string
  step_order:    number
  action:        'would_send' | 'paused'
  reason:        string
  details?:      string
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const dryRun  = searchParams.get('dry_run')  === 'true'
  const leadId  = searchParams.get('lead_id')  ?? null   // optional: limit to one lead's runs

  const db = createAdminClient()

  // ── Stage 1: fetch eligible run IDs ────────────────────────────────────────
  // Eligibility lives here in the caller; processSequenceRun processes whatever
  // run it's handed. lead_sequence_runs has no FK constraints (schema drift) so
  // all per-run lookups happen explicitly inside processSequenceRun.
  let runsQ = db
    .from('lead_sequence_runs')
    .select('id')
    .lte('next_send_at', new Date().toISOString())
    .eq('status', 'active')
    .order('next_send_at', { ascending: true })
    .limit(100)

  if (leadId) runsQ = runsQ.eq('lead_id', leadId)

  const { data: runs, error: runsError } = await runsQ

  if (runsError) {
    console.error(JSON.stringify({ service: 'sequence-orchestrator', error: runsError.message }))
    return NextResponse.json({ ok: false, error: runsError.message }, { status: 500 })
  }

  if (!runs || runs.length === 0) {
    return NextResponse.json({
      ok: true, dry_run: dryRun,
      processed: 0, sent: 0, completed: 0, paused: 0,
      ts: new Date().toISOString(),
      ...(dryRun && { runs: [] }),
    })
  }

  // ── Stage 2: process each run independently ────────────────────────────────
  let sent = 0, completed = 0, paused = 0
  const dryRunDetails: DryRunDetail[] = []

  for (const row of runs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runId = (row as any).id as string
    try {
      const result = await processSequenceRun({ db, runId, dryRun })

      if (result.action === 'sent')           sent++
      else if (result.action === 'completed') { sent++; completed++ }
      else if (result.action === 'paused')    paused++
      // 'skipped' counts in processed but not in sent/paused/completed

      if (dryRun) {
        dryRunDetails.push({
          run_id:        runId,
          lead_email:    result.leadEmail ?? '',
          sequence_name: result.sequenceName ?? '',
          step_order:    result.stepOrder ?? 0,
          action:        result.reason === 'would_send' ? 'would_send' : 'paused',
          reason:        result.reason,
          ...(result.details && { details: result.details }),
        })
      } else {
        console.log(JSON.stringify({
          service:    'sequence-orchestrator',
          run_id:     runId,
          action:     result.action,
          reason:     result.reason,
          resend_email_id: result.emailSendId,
        }))
      }
    } catch (err) {
      paused++
      console.error(JSON.stringify({
        service: 'sequence-orchestrator',
        run_id:  runId,
        result:  'error',
        error:   err instanceof Error ? err.message : String(err),
      }))
    }
  }

  return NextResponse.json({
    ok:        true,
    dry_run:   dryRun,
    processed: runs.length,
    sent,
    completed,
    paused,
    ts:        new Date().toISOString(),
    ...(dryRun && { runs: dryRunDetails }),
  })
}
