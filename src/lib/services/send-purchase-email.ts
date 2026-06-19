import 'server-only'
import { resend } from '@/lib/resend'
import type { createAdminClient } from '@/lib/supabase/admin'
import { generateUnsubscribeUrl } from '@/lib/services/unsubscribe-url'

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
        email_blocked_reason
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
  const language   = (['es', 'en', 'pt'].includes(lead.language as string) ? lead.language : 'es') as string
  const firstName  = lead.first_name as string
  const leadEmail  = lead.email as string
  const leadId     = lead.id as string

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

  // Look up the template for this (tenant, milestone, language).
  const { data: tmpl } = await db
    .from('purchase_email_templates')
    .select('resend_template_id')
    .eq('tenant_id', tenantId)
    .eq('milestone', milestone)
    .eq('language', language)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const templateId = (tmpl as any)?.resend_template_id as string | undefined

  if (!templateId || isPlaceholder(templateId)) {
    console.warn(JSON.stringify({
      service: 'sendPurchaseEmail', processId, milestone, language,
      warning: 'template_placeholder_skipped', template_id: templateId ?? '(none)',
    }))
    return
  }

  // Load the tenant's from address.
  const { data: tenant } = await db
    .from('tenants')
    .select('email_from_address')
    .eq('id', tenantId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromAddress = (tenant as any)?.email_from_address as string | null
  if (!fromAddress) {
    console.warn(JSON.stringify({ service: 'sendPurchaseEmail', processId, milestone, warning: 'no_from_address' }))
    return
  }

  // Send via Resend.
  // unsubscribe_url is provided but the purchase email templates may not use
  // it — wire {{unsubscribe_url}} into each template footer when templates are
  // created in Resend. See CLAUDE.md "Email Analytics" for variable conventions.
  const unsubscribeUrl = generateUnsubscribeUrl(leadId)
  try {
    const { error: sendErr } = await resend.emails.send({
      from:     fromAddress,
      to:       leadEmail,
      template: { id: templateId, variables: { customer_name: firstName, unsubscribe_url: unsubscribeUrl } },
    })

    if (sendErr) {
      console.error(JSON.stringify({ service: 'sendPurchaseEmail', processId, milestone, error: sendErr.message }))
      return
    }
  } catch (err) {
    console.error(JSON.stringify({ service: 'sendPurchaseEmail', processId, milestone, error: err instanceof Error ? err.message : String(err) }))
    return
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
