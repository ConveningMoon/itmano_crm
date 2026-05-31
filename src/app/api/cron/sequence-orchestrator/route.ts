import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  sendSequenceEmail,
  type PendingRun,
} from '@/lib/services/send-sequence-email'

// Resend template IDs are UUIDs; anything else is likely a placeholder
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

  // ── Stage 1: fetch due runs ───────────────────────────────────────────────
  // lead_sequence_runs was created in production without a migration file
  // (schema drift) so it has no FK constraints — PostgREST can't resolve
  // any implicit relationships from it. All lookups are done explicitly.
  let runsQ = db
    .from('lead_sequence_runs')
    .select('id, tenant_id, lead_id, sequence_id, current_step_order')
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

  // ── Stage 2: bulk-fetch all related entities ──────────────────────────────
  const leadIds     = [...new Set(runs.map(r => r.lead_id))]
  const tenantIds   = [...new Set(runs.map(r => r.tenant_id))]
  const sequenceIds = [...new Set(runs.map(r => r.sequence_id))]

  const [leadsRes, tenantsRes, stepsRes, seqNamesRes] = await Promise.all([
    // leads + their assigned agent in one join (leads → agents IS a proper FK)
    db.from('leads')
      .select('id, first_name, email, agent_id, agents(id, name, email)')
      .in('id', leadIds),

    db.from('tenants')
      .select('id, email_from_address')
      .in('id', tenantIds),

    // All active steps for relevant sequences
    db.from('email_sequence_steps')
      .select('id, sequence_id, step_order, resend_template_id, delay_hours')
      .in('sequence_id', sequenceIds)
      .eq('active', true),

    // Sequence names for dry_run diagnostics (cheap, always fetch)
    db.from('email_sequences')
      .select('id, name')
      .in('id', sequenceIds),
  ])

  // Surface any bulk-fetch errors
  for (const [label, res] of [
    ['leads', leadsRes], ['tenants', tenantsRes],
    ['steps', stepsRes], ['sequences', seqNamesRes],
  ] as const) {
    if (res.error) {
      console.error(JSON.stringify({ service: 'sequence-orchestrator', error: res.error.message, query: label }))
      return NextResponse.json({ ok: false, error: res.error.message }, { status: 500 })
    }
  }

  // ── Stage 3: fetch channel names via the forward FK ───────────────────────
  // acquisition_channels.email_sequence_id → email_sequences.id
  // (email_sequences.acquisition_channel_id was dropped in migration 023)
  const channelsRes = sequenceIds.length > 0
    ? await db
        .from('acquisition_channels')
        .select('id, name, email_sequence_id')
        .in('email_sequence_id', sequenceIds)
    : { data: [], error: null }

  if (channelsRes.error) {
    console.error(JSON.stringify({ service: 'sequence-orchestrator', error: channelsRes.error.message, query: 'channels' }))
    return NextResponse.json({ ok: false, error: channelsRes.error.message }, { status: 500 })
  }

  // ── Build lookup maps ─────────────────────────────────────────────────────
  const leadsMap   = new Map((leadsRes.data   ?? []).map(l => [l.id, l]))
  const tenantsMap = new Map((tenantsRes.data ?? []).map(t => [t.id, t]))
  const stepsMap   = new Map(
    (stepsRes.data ?? []).map(s => [`${s.sequence_id}:${s.step_order}`, s])
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seqNameMap = new Map((seqNamesRes.data ?? []).map((s: any) => [s.id as string, s.name as string]))
  // seq_id → channel name (first channel wins when multiple channels share a sequence)
  const channelBySeqMap = new Map<string, string>()
  for (const ch of channelsRes.data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seqId = (ch as any).email_sequence_id as string
    if (seqId && !channelBySeqMap.has(seqId)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      channelBySeqMap.set(seqId, (ch as any).name as string)
    }
  }

  // ── Assemble PendingRun objects ───────────────────────────────────────────
  const pending: PendingRun[] = runs.map((r) => {
    const lead   = leadsMap.get(r.lead_id)
    const agent  = lead
      ? (Array.isArray(lead.agents) ? lead.agents[0] : lead.agents)
      : null
    const tenant = tenantsMap.get(r.tenant_id)
    const step   = stepsMap.get(`${r.sequence_id}:${r.current_step_order}`) ?? null

    return {
      run_id:             r.id,
      lead_id:            r.lead_id,
      sequence_id:        r.sequence_id,
      current_step_order: r.current_step_order,
      tenant_id:          r.tenant_id,
      step_id:            step?.id ?? null,
      resend_template_id: step?.resend_template_id ?? null,
      next_delay_hours:   step?.delay_hours ?? null,
      first_name:         lead?.first_name ?? '',
      lead_email:         lead?.email ?? '',
      agent_id:           lead?.agent_id ?? '',
      email_from_address: tenant?.email_from_address ?? null,
      agent_name:         agent?.name ?? '',
      agent_email:        agent?.email ?? '',
      channel_name:       channelBySeqMap.get(r.sequence_id) ?? null,
    }
  })

  // ── Process each run independently ───────────────────────────────────────
  let sent = 0, completed = 0, paused = 0
  const dryRunDetails: DryRunDetail[] = []

  for (const run of pending) {
    if (dryRun) {
      // ── Dry-run: diagnose guards without side effects ─────────────────────
      let reason: string
      let details: string | undefined

      if (!run.step_id) {
        reason  = 'no_step'
        details = `No active step at order ${run.current_step_order}`
      } else if (!run.resend_template_id) {
        reason  = 'no_template'
        details = 'resend_template_id is null on this step'
      } else if (!UUID_RE.test(run.resend_template_id)) {
        reason  = 'invalid_template_id'
        details = `'${run.resend_template_id}' is not a UUID — verify/replace in Resend dashboard`
      } else if (!run.email_from_address) {
        reason  = 'no_from_address'
        details = 'tenant.email_from_address is null'
      } else if (!run.lead_email) {
        reason  = 'no_lead_email'
        details = 'lead.email is null'
      } else if (!run.agent_email) {
        reason  = 'no_agent'
        details = 'agent.email is null'
      } else {
        reason = 'would_send'
      }

      const action: DryRunDetail['action'] = reason === 'would_send' ? 'would_send' : 'paused'
      if (action === 'would_send') { sent++ } else { paused++ }

      const detail: DryRunDetail = {
        run_id:        run.run_id,
        lead_email:    run.lead_email,
        sequence_name: seqNameMap.get(run.sequence_id) ?? run.sequence_id,
        step_order:    run.current_step_order,
        action,
        reason,
      }
      if (details) detail.details = details
      dryRunDetails.push(detail)

    } else {
      // ── Production mode: send and log ─────────────────────────────────────
      try {
        const result = await sendSequenceEmail(db, run, false)

        if (result.ok) {
          sent++
          if (result.outcome === 'completed') completed++
          console.log(JSON.stringify({
            service:         'sequence-orchestrator',
            run_id:          run.run_id,
            lead_id:         run.lead_id,
            step_order:      run.current_step_order,
            result:          result.outcome,
            resend_email_id: result.resendEmailId,
          }))
        } else {
          paused++
          console.log(JSON.stringify({
            service:    'sequence-orchestrator',
            run_id:     run.run_id,
            lead_id:    run.lead_id,
            step_order: run.current_step_order,
            result:     'paused',
            reason:     result.reason,
          }))
        }
      } catch (err) {
        paused++
        console.error(JSON.stringify({
          service:    'sequence-orchestrator',
          run_id:     run.run_id,
          lead_id:    run.lead_id,
          step_order: run.current_step_order,
          result:     'error',
          error:      err instanceof Error ? err.message : String(err),
        }))
      }
    }
  }

  return NextResponse.json({
    ok:        true,
    dry_run:   dryRun,
    processed: pending.length,
    sent,
    completed,
    paused,
    ts:        new Date().toISOString(),
    ...(dryRun && { runs: dryRunDetails }),
  })
}
