import 'server-only'
import { resend } from '@/lib/resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateUnsubscribeUrl } from '@/lib/services/unsubscribe-url'
import { parseEmailContent } from '@/lib/email-content'
import { renderEmail, type EmailLocale } from '@/lib/services/email-render'

export type PendingRun = {
  run_id:             string
  lead_id:            string
  sequence_id:        string
  current_step_order: number
  tenant_id:          string
  // Step (NULL when missing or inactive)
  step_id:            string | null
  resend_template_id: string | null
  next_delay_hours:   number | null
  // Contenido CRM del step (modo composer; tiene precedencia sobre el template)
  step_subject:       string | null
  step_body_json:     unknown
  // Lead
  first_name:            string
  lead_email:            string
  agent_id:              string
  email_blocked:         boolean
  email_blocked_reason:  string | null
  // Tenant
  email_from_address:   string | null
  // Agent
  agent_name:         string
  agent_email:        string
  agent_signature:    string | null
  // Channel (optional)
  channel_name:       string | null
  // Sequence
  sequence_language:  EmailLocale
}

export type SendResult =
  | { ok: true;  outcome: 'sent' | 'completed'; resendEmailId: string }
  | { ok: false; reason: string;                action: 'paused' }

export async function sendSequenceEmail(
  db: ReturnType<typeof createAdminClient>,
  run: PendingRun,
  dryRun: boolean,
): Promise<SendResult> {
  const { run_id, lead_id, sequence_id, current_step_order, tenant_id } = run

  // ── Guard: email channel blocked (defensive — processSequenceRun checks first) ──
  // Cancels the run rather than pausing so it doesn't linger in the active queue.
  if (run.email_blocked) {
    const blockReason = run.email_blocked_reason ?? 'email_blocked'
    if (!dryRun) {
      await db
        .from('lead_sequence_runs')
        .update({ status: 'cancelled', cancelled_reason: blockReason })
        .eq('id', run_id)
    }
    return { ok: false, reason: 'email_blocked', action: 'paused' }
  }

  // ── Guard: step must exist and be configured ──────────────────────────────
  if (!run.step_id) {
    if (!dryRun) await pauseRun(db, run_id, 'no_step')
    return { ok: false, reason: 'no_step', action: 'paused' }
  }

  // Contenido CRM (composer) tiene precedencia; el template de Resend es el
  // modo legacy/avanzado. Sin ninguno de los dos → no hay qué enviar.
  const crmContent   = parseEmailContent(run.step_body_json)
  const crmSubject   = run.step_subject?.trim() || null
  const hasCrmEmail  = !!(crmContent && crmSubject)

  if (!hasCrmEmail && !run.resend_template_id) {
    if (!dryRun) await pauseRun(db, run_id, 'no_content')
    return { ok: false, reason: 'no_content', action: 'paused' }
  }

  if (!run.email_from_address) {
    if (!dryRun) await pauseRun(db, run_id, 'no_from_address')
    return { ok: false, reason: 'no_from_address', action: 'paused' }
  }

  // ── Build template variables ──────────────────────────────────────────────
  const unsubscribeUrl = generateUnsubscribeUrl(lead_id)

  const variables: Record<string, string> = {
    customer_name:    run.first_name,
    agent_name:       run.agent_name,
    agent_email:      run.agent_email,
    lead_magnet_name: run.channel_name ?? '',
    unsubscribe_url:  unsubscribeUrl,
  }

  // ── Dry-run: return what would be sent without side effects ───────────────
  if (dryRun) {
    return {
      ok:            true,
      outcome:       'sent',
      resendEmailId: 'dry-run-no-id',
    }
  }

  // ── Send via Resend ───────────────────────────────────────────────────────
  // RFC 8058 one-click unsubscribe: email clients surface a native
  // "Unsubscribe" button that POSTs to the List-Unsubscribe URL without any
  // HTML in the email template needing a link. Gmail requires both headers.
  const listUnsubscribeHeaders = {
    'List-Unsubscribe':      `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }

  // Compilar el HTML si el step tiene contenido CRM (merge tags resueltos aquí;
  // Resend ya no interpola nada en este modo).
  let compiledSubject: string | null = null
  let compiledHtml:    string | null = null
  if (hasCrmEmail && crmContent && crmSubject) {
    const rendered = renderEmail({
      subject:  crmSubject,
      content:  crmContent,
      vars: {
        customer_name: run.first_name,
        agent_name:    run.agent_name,
        agent_email:   run.agent_email,
      },
      signature:      run.agent_signature,
      unsubscribeUrl,
      locale:         run.sequence_language,
    })
    compiledSubject = rendered.subject
    compiledHtml    = rendered.html
  }

  let resendEmailId: string
  try {
    const { data, error } = await resend.emails.send(
      compiledHtml && compiledSubject
        ? {
            from:    run.email_from_address,
            to:      run.lead_email,
            headers: listUnsubscribeHeaders,
            subject: compiledSubject,
            html:    compiledHtml,
          }
        : {
            from:    run.email_from_address,
            to:      run.lead_email,
            headers: listUnsubscribeHeaders,
            template: {
              id:        run.resend_template_id as string,
              variables,
            },
          },
    )

    if (error || !data?.id) {
      const msg = error?.message ?? 'Resend returned no id'
      await pauseRun(db, run_id, 'resend_error', msg)
      return { ok: false, reason: msg, action: 'paused' }
    }

    resendEmailId = data.id
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await pauseRun(db, run_id, 'resend_error', msg)
    return { ok: false, reason: msg, action: 'paused' }
  }

  // ── Persist email_sends record ────────────────────────────────────────────
  const { error: insertError } = await db.from('email_sends').insert({
    tenant_id:          tenant_id,
    lead_id:            lead_id,
    sequence_run_id:    run_id,
    step_order:         current_step_order,
    resend_email_id:    resendEmailId,
    resend_template_id: hasCrmEmail ? null : run.resend_template_id,
    send_type:          'sequence',
    subject:            compiledSubject,
    sent_at:            new Date().toISOString(),
  })

  if (insertError) throw insertError

  // ── Advance or complete the run ───────────────────────────────────────────
  const nextStepOrder = current_step_order + 1

  const { data: nextStep } = await db
    .from('email_sequence_steps')
    .select('step_order, delay_hours')
    .eq('sequence_id', sequence_id)
    .eq('step_order', nextStepOrder)
    .eq('active', true)
    .maybeSingle()

  if (nextStep) {
    const nextSendAt = new Date(
      Date.now() + nextStep.delay_hours * 60 * 60 * 1000
    ).toISOString()

    const { error } = await db
      .from('lead_sequence_runs')
      .update({
        current_step_order: nextStepOrder,
        last_sent_at:       new Date().toISOString(),
        next_send_at:       nextSendAt,
      })
      .eq('id', run_id)

    if (error) throw error
    return { ok: true, outcome: 'sent', resendEmailId }
  } else {
    // Last step — mark complete
    const { error } = await db
      .from('lead_sequence_runs')
      .update({
        status:       'completed',
        last_sent_at: new Date().toISOString(),
        next_send_at: null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', run_id)

    if (error) throw error
    return { ok: true, outcome: 'completed', resendEmailId }
  }
}

// ─── Helper ──────────────────────────────────────────────────────────────────

// Razones permitidas por el CHECK de lead_sequence_runs.cancelled_reason (050).
// El detalle libre (p. ej. el mensaje de error de Resend) va al log, nunca a la
// columna — escribir texto libre violaba el CHECK y la pausa fallaba en silencio.
type PauseReason = 'no_step' | 'no_template' | 'no_content' | 'no_from_address' | 'resend_error'

async function pauseRun(
  db: ReturnType<typeof createAdminClient>,
  runId: string,
  reason: PauseReason,
  detail?: string,
) {
  if (detail) {
    console.error(JSON.stringify({ service: 'send-sequence-email', run_id: runId, reason, detail }))
  }
  const { error } = await db
    .from('lead_sequence_runs')
    .update({
      status:           'paused',
      cancelled_reason: reason,
    })
    .eq('id', runId)
  if (error) {
    console.error(JSON.stringify({ service: 'send-sequence-email', run_id: runId, reason: 'pause_failed', detail: error.message }))
  }
}
