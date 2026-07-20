import 'server-only'
import { resendForAccount } from '@/lib/resend'
import { resolveSenderIdentity } from '@/lib/services/sender-identity'
import type { createAdminClient } from '@/lib/supabase/admin'
import { generateUnsubscribeUrl } from '@/lib/services/unsubscribe-url'
import { parseEmailContent } from '@/lib/email-content'
import { renderEmail, type EmailLocale } from '@/lib/services/email-render'

export type PurchaseMilestone = 'start' | 'pre_close' | 'completed'

// Column name on purchase_processes for each milestone's idempotency flag.
const SENT_FLAG: Record<PurchaseMilestone, string> = {
  start:     'email_start_sent',
  pre_close: 'email_preclose_sent',
  completed: 'email_completed_sent',
}

// Label used in the lead_event description.
const MILESTONE_LABEL: Record<PurchaseMilestone, string> = {
  start:     'Inicio de proceso',
  pre_close: 'Pre-cierre',
  completed: 'Proceso completado',
}

// A resend_template_id is a placeholder if it starts with 'REPLACE_ME' or is empty.
function isPlaceholder(id: string): boolean {
  return !id || id.startsWith('REPLACE_ME')
}

// Determine if the pre_close email should be skipped because closing_date is
// tomorrow or sooner (not enough time for the reminder to be meaningful).
function shouldSkipPreClose(closingDate: string | null): boolean {
  if (!closingDate) return true
  const closing = new Date(closingDate + 'T00:00:00')
  const tomorrow = new Date(); tomorrow.setHours(0, 0, 0, 0); tomorrow.setDate(tomorrow.getDate() + 1)
  return closing <= tomorrow
}

/**
 * Send a purchase lifecycle email for a given milestone.
 *
 * - Resolves process → lead → language → template → tenant email_from
 * - If the idempotency flag is already set, skips silently.
 * - If the template is a placeholder, logs a warning and returns — does NOT crash.
 * - On success, sets the flag + inserts a lead_event for the activity feed.
 *
 * `closingDate` is forwarded from the caller so we can apply the skip-pre_close
 * edge-case without an extra DB round-trip when called from startPurchaseProcess.
 * Pass null from the cron — it will be read from the process row.
 */
export async function sendPurchaseEmail(
  db: ReturnType<typeof createAdminClient>,
  processId: string,
  milestone: PurchaseMilestone,
  closingDateHint: string | null = null,
): Promise<void> {
  // Load process + lead + tenant in one join.
  const { data: proc, error: procErr } = await db
    .from('purchase_processes')
    .select(`
      id,
      tenant_id,
      closing_date,
      email_start_sent,
      email_preclose_sent,
      email_completed_sent,
      leads (
        id,
        first_name,
        email,
        language,
        email_blocked,
        email_blocked_reason,
        agents (id, name, email, email_signature, language, languages)
      )
    `)
    .eq('id', processId)
    .single()

  if (procErr || !proc) {
    console.error(JSON.stringify({ service: 'sendPurchaseEmail', processId, milestone, error: 'process_not_found' }))
    return
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = proc as any

  // Idempotency: skip if already sent.
  const flagKey = SENT_FLAG[milestone]
  if (p[flagKey] === true) return

  // Edge case: skip pre_close when closing_date is tomorrow or sooner.
  if (milestone === 'pre_close') {
    const cd = closingDateHint ?? (p.closing_date as string | null)
    if (shouldSkipPreClose(cd)) {
      // Mark as sent so the cron never picks it up either.
      await db.from('purchase_processes').update({ [flagKey]: true }).eq('id', processId)
      return
    }
  }

  // Resolve lead fields.
  const lead = Array.isArray(p.leads) ? p.leads[0] : p.leads
  if (!lead) {
    console.error(JSON.stringify({ service: 'sendPurchaseEmail', processId, milestone, error: 'lead_not_found' }))
    return
  }

  const tenantId   = p.tenant_id as string
  const firstName  = lead.first_name as string
  const leadEmail  = lead.email as string
  const leadId     = lead.id as string
  const agent      = Array.isArray(lead.agents) ? lead.agents[0] : lead.agents
  const agentId    = (agent?.id as string | undefined) ?? null
  const agentName  = (agent?.name as string | undefined) ?? ''
  const agentEmail = (agent?.email as string | undefined) ?? ''
  const agentSignature = (agent?.email_signature as string | null | undefined) ?? null

  if (!agentId) {
    console.error(JSON.stringify({ service: 'sendPurchaseEmail', processId, milestone, error: 'agent_not_found' }))
    return
  }

  // Idioma efectivo: el del lead si el agente lo tiene registrado; si no, el
  // principal del agente (migración 058 — emails de cierre por agente).
  const { resolveClosingLanguage } = await import('@/lib/services/closing-emails-status')
  const language = resolveClosingLanguage(
    agent?.languages as string[] | null,
    (agent?.language as string | undefined) ?? 'es',
    lead.language as string | null,
  ) as EmailLocale

  // Block purchase emails only for hard_bounce (the address doesn't exist).
  // unsubscribed: these are transactional confirmations for a process the lead
  //   explicitly started — we still send them (same logic as a bank statement).
  // spam_complaint: the lead is already 'lost' and runs are cancelled upstream
  //   via the force_perdido scoring side-effect; this path is rarely reached.
  if (lead.email_blocked && lead.email_blocked_reason === 'hard_bounce') {
    console.warn(JSON.stringify({
      service:   'sendPurchaseEmail',
      processId,
      milestone,
      lead_id:   leadId,
      warning:   'skipped_email_blocked_hard_bounce',
    }))
    return
  }

  // Look up the template for this (tenant, agent, milestone, language).
  // Contenido CRM (subject + body_json del composer) tiene precedencia; el
  // template de Resend queda como modo legacy/avanzado.
  const { data: tmpl } = await db
    .from('purchase_email_templates')
    .select('resend_template_id, subject, body_json')
    .eq('tenant_id', tenantId)
    .eq('agent_id', agentId)
    .eq('milestone', milestone)
    .eq('language', language)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = tmpl as any
  const templateId  = t?.resend_template_id as string | undefined
  const crmContent  = parseEmailContent(t?.body_json)
  const crmSubject  = (t?.subject as string | null)?.trim() || null
  const hasCrmEmail = !!(crmContent && crmSubject)

  if (!hasCrmEmail && (!templateId || isPlaceholder(templateId))) {
    console.warn(JSON.stringify({
      service: 'sendPurchaseEmail', processId, milestone, language,
      warning: 'no_content_skipped', template_id: templateId ?? '(none)',
    }))
    return
  }

  // Identidad de envío del tenant (cuenta Resend + from) según plan/dominio (065).
  const { data: tenant } = await db
    .from('tenants')
    .select('name, slug, email_from_address, resend_account, domain_status')
    .eq('id', tenantId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const identity = resolveSenderIdentity(tenant as any)
  if (!identity) {
    console.warn(JSON.stringify({ service: 'sendPurchaseEmail', processId, milestone, warning: 'no_from_address' }))
    return
  }

  // Send via Resend.
  // RFC 8058 one-click: same two headers as sequence emails. Purchase process
  // emails are commercial follow-ups, not purely transactional (OTP / receipt),
  // so the unsubscribe header is appropriate and improves deliverability.
  // unsubscribe_url is also passed as a template variable so authors can wire
  // a visible link into the template footer (optional — header alone is enough).
  const unsubscribeUrl = generateUnsubscribeUrl(leadId)
  const listUnsubscribeHeaders = {
    'List-Unsubscribe':      `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
  let resendEmailId: string | null = null
  let sentSubject:   string | null = null
  try {
    let payload
    if (hasCrmEmail && crmContent && crmSubject) {
      const rendered = renderEmail({
        subject:  crmSubject,
        content:  crmContent,
        vars: {
          customer_name: firstName,
          agent_name:    agentName,
          agent_email:   agentEmail,
        },
        signature:      agentSignature,
        unsubscribeUrl,
        locale:         language,
      })
      sentSubject = rendered.subject
      payload = {
        from:    identity.from,
        to:      leadEmail,
        headers: listUnsubscribeHeaders,
        subject: rendered.subject,
        html:    rendered.html,
      }
    } else {
      payload = {
        from:     identity.from,
        to:       leadEmail,
        headers:  listUnsubscribeHeaders,
        template: { id: templateId as string, variables: { customer_name: firstName, unsubscribe_url: unsubscribeUrl } },
      }
    }

    const { data: sendData, error: sendErr } = await resendForAccount(identity.account).emails.send(payload)

    if (sendErr) {
      console.error(JSON.stringify({ service: 'sendPurchaseEmail', processId, milestone, error: sendErr.message }))
      return
    }
    resendEmailId = sendData?.id ?? null
  } catch (err) {
    console.error(JSON.stringify({ service: 'sendPurchaseEmail', processId, milestone, error: err instanceof Error ? err.message : String(err) }))
    return
  }

  // email_sends row → el webhook de Resend puede atribuir clicks/replies de
  // correos de compra al lead (antes eran inatribuibles). Best-effort.
  if (resendEmailId) {
    const { error: sendRowErr } = await db.from('email_sends').insert({
      tenant_id:          tenantId,
      lead_id:            leadId,
      sequence_run_id:    null,
      step_order:         null,
      resend_email_id:    resendEmailId,
      resend_template_id: hasCrmEmail ? null : templateId,
      send_type:          'purchase',
      subject:            sentSubject,
      sent_at:            new Date().toISOString(),
    })
    if (sendRowErr) {
      console.error(JSON.stringify({ service: 'sendPurchaseEmail', processId, milestone, error: 'email_sends_insert_failed', detail: sendRowErr.message }))
    }
  }

  // Mark idempotency flag + insert activity event — both best-effort after a
  // successful send (the email is gone; if these fail we log and move on).
  const flagResult = await db
    .from('purchase_processes')
    .update({ [flagKey]: true })
    .eq('id', processId)
  if (flagResult.error) {
    console.error(JSON.stringify({ service: 'sendPurchaseEmail', processId, milestone, error: 'flag_update_failed', detail: flagResult.error.message }))
  }

  await db.from('lead_events').insert({
    lead_id:       leadId,
    tenant_id:     tenantId,
    type:          'purchase_email_sent',
    description:   `Email de cierre: ${MILESTONE_LABEL[milestone]}`,
    points:        0,
    actor_user_id: null,
  })

  console.log(JSON.stringify({ service: 'sendPurchaseEmail', processId, milestone, lead_id: leadId, status: 'sent' }))
}
