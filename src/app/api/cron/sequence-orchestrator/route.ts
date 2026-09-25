import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processSequenceRun } from '@/lib/services/process-sequence-run'
import { sendPurchaseEmail } from '@/lib/services/send-purchase-email'
import { dispatchDueOpenHouseEmails } from '@/lib/services/open-house-dispatch'

// Presupuesto de la etapa de open houses (~30 lotes de 100 correos).
const OPEN_HOUSE_BUDGET_MS = 45_000

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

  // ── Stage 0: correos de open house vencidos ────────────────────────────────
  // Va primero y no después de las secuencias porque Stage 1 retorna temprano
  // cuando no hay corridas: al final, un anuncio programado podría no salir
  // nunca. El tope de tiempo deja margen a las secuencias dentro del límite de
  // la función; lo que no alcance, lo retoma la siguiente ejecución. Ni
  // dry_run (sería un envío real) ni una corrida acotada a un lead despachan.
  const openHouses = dryRun || leadId
    ? { processed: 0, sent: 0 }
    : await dispatchDueOpenHouseEmails(db, { deadline: Date.now() + OPEN_HOUSE_BUDGET_MS })

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
      open_houses: openHouses,
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

  // ── Stage 3: purchase process pre_close emails ────────────────────────────
  // Runs independently of Stage 2. Finds processes whose closing_date is
  // tomorrow and whose pre_close email has not been sent yet.
  let preCloseSent = 0
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().slice(0, 10) // 'YYYY-MM-DD'

  const { data: preCloseProcs } = await db
    .from('purchase_processes')
    .select('id, closing_date')
    .eq('closing_date', tomorrowStr)
    .eq('email_preclose_sent', false)

  for (const proc of preCloseProcs ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = proc as any
    try {
      if (!dryRun) {
        await sendPurchaseEmail(db, p.id as string, 'pre_close', p.closing_date as string)
        preCloseSent++
      } else {
        console.log(JSON.stringify({ service: 'sequence-orchestrator', stage: 'pre_close', dry_run: true, process_id: p.id }))
        preCloseSent++
      }
    } catch (err) {
      console.error(JSON.stringify({ service: 'sequence-orchestrator', stage: 'pre_close', process_id: p.id, error: err instanceof Error ? err.message : String(err) }))
    }
  }

  return NextResponse.json({
    ok:             true,
    dry_run:        dryRun,
    processed:      runs.length,
    sent,
    completed,
    paused,
    pre_close_sent: preCloseSent,
    open_houses:    openHouses,
    ts:             new Date().toISOString(),
    ...(dryRun && { runs: dryRunDetails }),
  })
}
