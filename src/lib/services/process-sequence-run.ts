import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendSequenceEmail, type PendingRun } from '@/lib/services/send-sequence-email'
import { parseEmailContent } from '@/lib/email-content'
import type { EmailLocale } from '@/lib/services/email-render'

// Resend template IDs are UUIDs; anything else is a placeholder.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ProcessRunResult {
  action:        'sent' | 'completed' | 'paused' | 'skipped'
  reason:        string
  emailSendId?:  string
  // Diagnostic context (used by the orchestrator dry-run response + logging)
  leadEmail?:    string
  sequenceName?: string
  stepOrder?:    number
  details?:      string
}

/**
 * Process a SINGLE sequence run by its ID: send the email for the run's
 * current step, then advance (or complete) the run.
 *
 * This is the shared unit of work between two callers:
 *  - The hourly orchestrator cron: queries eligible runs, then calls this
 *    per run.
 *  - enrollLeadInSequence: calls this directly, in-process, right after
 *    inserting the run, so the first email sends immediately.
 *
 * It does NOT filter by next_send_at — the caller decides eligibility.
 * It only verifies the run is still 'active'. Assembles all joined data
 * (lead, agent, tenant, step, channel) for the one run, then delegates the
 * actual send to sendSequenceEmail.
 */
export async function processSequenceRun(params: {
  db:      SupabaseClient
  runId:   string
  dryRun?: boolean
}): Promise<ProcessRunResult> {
  const { db, runId, dryRun = false } = params

  // ── Fetch the run ──────────────────────────────────────────────────────────
  const { data: run } = await db
    .from('lead_sequence_runs')
    .select('id, tenant_id, lead_id, sequence_id, current_step_order, status')
    .eq('id', runId)
    .maybeSingle()

  if (!run) return { action: 'skipped', reason: 'run_not_found' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = run as any
  if (r.status !== 'active') return { action: 'skipped', reason: `run_status_${r.status}` }

  const tenantId   = r.tenant_id as string
  const leadId     = r.lead_id as string
  const sequenceId = r.sequence_id as string
  const stepOrder  = r.current_step_order as number

  // ── Bulk-fetch related entities in parallel ────────────────────────────────
  const [leadRes, tenantRes, stepRes, channelRes, seqRes] = await Promise.all([
    db.from('leads')
      .select('id, first_name, email, agent_id, email_blocked, email_blocked_reason, agents(id, name, email)')
      .eq('id', leadId)
      .maybeSingle(),
    db.from('tenants')
      .select('id, email_from_address, name, primary_color')
      .eq('id', tenantId)
      .maybeSingle(),
    db.from('email_sequence_steps')
      .select('id, sequence_id, step_order, resend_template_id, delay_hours, subject, body_json')
      .eq('sequence_id', sequenceId)
      .eq('step_order', stepOrder)
      .eq('active', true)
      .maybeSingle(),
    db.from('acquisition_channels')
      .select('name, email_sequence_id')
      .eq('email_sequence_id', sequenceId)
      .limit(1)
      .maybeSingle(),
    db.from('email_sequences')
      .select('name, language')
      .eq('id', sequenceId)
      .maybeSingle(),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lead    = leadRes.data as any
  const agent   = lead ? (Array.isArray(lead.agents) ? lead.agents[0] : lead.agents) : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant  = tenantRes.data as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const step    = stepRes.data as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channel = channelRes.data as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seq     = seqRes.data as any
  const seqName = seq?.name as string | undefined
  const seqLang: EmailLocale = seq?.language === 'en' || seq?.language === 'pt' ? seq.language : 'es'

  // ── Guard: email channel blocked ──────────────────────────────────────────
  // Cancel the run so the cron never retries it. The block is permanent until
  // the lead's email_blocked flag is cleared by an operator.
  if (lead?.email_blocked) {
    const blockReason = (lead.email_blocked_reason as string | null) ?? 'email_blocked'
    if (!dryRun) {
      await db
        .from('lead_sequence_runs')
        .update({ status: 'cancelled', cancelled_reason: blockReason })
        .eq('id', runId)
    }
    return {
      action:       'paused',
      reason:       `email_blocked_${blockReason}`,
      leadEmail:    (lead?.email as string) ?? '',
      sequenceName: seqName ?? sequenceId,
      stepOrder,
    }
  }

  const pending: PendingRun = {
    run_id:             runId,
    lead_id:            leadId,
    sequence_id:        sequenceId,
    current_step_order: stepOrder,
    tenant_id:          tenantId,
    step_id:            step?.id ?? null,
    resend_template_id: step?.resend_template_id ?? null,
    next_delay_hours:   step?.delay_hours ?? null,
    step_subject:       (step?.subject as string | null) ?? null,
    step_body_json:     step?.body_json ?? null,
    first_name:            lead?.first_name ?? '',
    lead_email:            lead?.email ?? '',
    agent_id:              lead?.agent_id ?? '',
    email_blocked:         (lead?.email_blocked as boolean) ?? false,
    email_blocked_reason:  (lead?.email_blocked_reason as string | null) ?? null,
    email_from_address:   tenant?.email_from_address ?? null,
    tenant_name:          (tenant?.name as string) ?? '',
    tenant_primary_color: (tenant?.primary_color as string) ?? '#1E3A5F',
    agent_name:         agent?.name ?? '',
    agent_email:        agent?.email ?? '',
    channel_name:       channel?.name ?? null,
    sequence_language:  seqLang,
  }

  const diag = { leadEmail: pending.lead_email, sequenceName: seqName ?? sequenceId, stepOrder }

  // ── Dry-run: diagnose guards without side effects ──────────────────────────
  if (dryRun) {
    if (!pending.step_id) {
      return { action: 'paused', reason: 'no_step', details: `No active step at order ${stepOrder}`, ...diag }
    }
    // Un step es válido con contenido CRM (composer) O con un template de
    // Resend (legacy). El contenido CRM tiene precedencia en el envío.
    const hasCrmContent = !!(parseEmailContent(pending.step_body_json) && pending.step_subject?.trim())
    if (!hasCrmContent) {
      if (!pending.resend_template_id) {
        return { action: 'paused', reason: 'no_content', details: 'Step has neither CRM content (subject + body_json) nor a Resend template id', ...diag }
      }
      if (!UUID_RE.test(pending.resend_template_id)) {
        return { action: 'paused', reason: 'invalid_template_id', details: `'${pending.resend_template_id}' is not a UUID — verify/replace in Resend dashboard`, ...diag }
      }
    }
    if (!pending.email_from_address) {
      return { action: 'paused', reason: 'no_from_address', details: 'tenant.email_from_address is null', ...diag }
    }
    if (!pending.lead_email) {
      return { action: 'paused', reason: 'no_lead_email', details: 'lead.email is null', ...diag }
    }
    if (!pending.agent_email) {
      return { action: 'paused', reason: 'no_agent', details: 'agent.email is null', ...diag }
    }
    return { action: 'sent', reason: 'would_send', ...diag }
  }

  // ── Production: delegate the actual send to sendSequenceEmail ───────────────
  const result = await sendSequenceEmail(db, pending, false)

  if (result.ok) {
    return { action: result.outcome, reason: result.outcome, emailSendId: result.resendEmailId, ...diag }
  }
  return { action: 'paused', reason: result.reason, ...diag }
}
