'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { assertCanWriteLead } from '@/lib/auth/guards'
import type { LeadStatus } from '@/lib/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const FROZEN_STATUSES: LeadStatus[] = ['process_started', 'process_completed', 'closed', 'lost']

// Minimal lead shape needed to gate a write (tenant + assigned agent).
type LeadGuardRow = { tenant_id: string; agent_id: string }

// Loads a lead scoped to the caller's tenant (super_admin: ctx.tenant_id null →
// no filter) and gates it through assertCanWriteLead. Returns the row's
// tenant_id (for downstream inserts) on success, or an AuthDenial to return.
async function loadGuardedLead(
  supabase: ReturnType<typeof createAdminClient>,
  ctx: Awaited<ReturnType<typeof getCurrentTenantContext>>,
  leadId: string,
): Promise<{ tenant_id: string } | { ok: false; error: string }> {
  let leadQ = supabase.from('leads').select('tenant_id, agent_id').eq('id', leadId)
  if (ctx.tenant_id) leadQ = leadQ.eq('tenant_id', ctx.tenant_id)
  const { data: lead } = await leadQ.maybeSingle()
  if (!lead) return { ok: false, error: 'Lead no encontrado o sin acceso' }

  const row    = lead as LeadGuardRow
  const denied = assertCanWriteLead(ctx, row)
  if (denied) return denied
  return { tenant_id: row.tenant_id }
}

// ─── Update status (process_completed / closed / lost only) ──────────────────

export async function updateLeadStatus(
  leadId: string,
  status: 'process_completed' | 'closed' | 'lost'
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx      = await getCurrentTenantContext()
  const supabase = createAdminClient()

  const guard = await loadGuardedLead(supabase, ctx, leadId)
  if ('ok' in guard) return guard

  // Freezing happens via the status itself (recompute_lead_score early-returns on
  // frozen statuses). temperature_score is deprecated and no longer written.
  const { error } = await supabase.from('leads').update({ status }).eq('id', leadId)
  if (error) return { ok: false, error: error.message }

  if (status === 'process_completed') {
    await supabase.from('lead_events').insert({
      lead_id:       leadId,
      tenant_id:     guard.tenant_id,
      type:          'status_changed',
      description:   'Proceso de compra completado.',
      points:        0,
      actor_user_id: ctx.user_id,
    })

    // Fire the 'completed' lifecycle email. Load process id for this lead.
    const { data: proc } = await supabase
      .from('purchase_processes')
      .select('id, closing_date')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (proc) {
      const { sendPurchaseEmail } = await import('@/lib/services/send-purchase-email')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = proc as any
      await sendPurchaseEmail(supabase, p.id as string, 'completed', p.closing_date as string | null)
    }
  }

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  revalidatePath('/dashboard')
  return { ok: true }
}

// ─── Update all editable lead fields ─────────────────────────────────────────

export async function updateLead(
  leadId: string,
  fields: {
    firstName: string
    lastName: string
    email: string
    phone: string
    language: string
    agentId: string
    channelType: string
    acquisitionChannelId: string
    lender: string
    notes: string
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx      = await getCurrentTenantContext()
  const supabase = createAdminClient()

  // Load the lead tenant-scoped and gate by role/attribution.
  let leadQ = supabase.from('leads').select('tenant_id, agent_id').eq('id', leadId)
  if (ctx.tenant_id) leadQ = leadQ.eq('tenant_id', ctx.tenant_id)
  const { data: lead } = await leadQ.maybeSingle()
  if (!lead) return { ok: false, error: 'Lead no encontrado o sin acceso' }

  const row    = lead as LeadGuardRow
  const denied = assertCanWriteLead(ctx, row)
  if (denied) return denied

  // Reassignment (changing agent_id) is an owner/super_admin action only.
  if (ctx.role === 'agent' && fields.agentId !== row.agent_id) {
    return { ok: false, error: 'Reasignar leads es una acción del owner' }
  }

  const { error } = await supabase
    .from('leads')
    .update({
      first_name:              fields.firstName,
      last_name:               fields.lastName,
      email:                   fields.email,
      phone:                   fields.phone   || null,
      language:                fields.language,
      agent_id:                fields.agentId,
      acquisition_channel_id:  fields.acquisitionChannelId || null,
      lender:                  fields.lender  || null,
      notes:                   fields.notes   || null,
    })
    .eq('id', leadId)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  return { ok: true }
}

// ─── Update notes only (inline notes card) ───────────────────────────────────

export async function updateLeadNotes(
  leadId: string,
  notes: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx      = await getCurrentTenantContext()
  const supabase = createAdminClient()

  const guard = await loadGuardedLead(supabase, ctx, leadId)
  if ('ok' in guard) return guard

  const { error } = await supabase
    .from('leads')
    .update({ notes: notes || null })
    .eq('id', leadId)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  return { ok: true }
}

// ─── Apply a manual agent action (manual scoring panel) ───────────────────────
// Inserts a category=manual lead_event for the given dimension, then recomputes the
// score. The dimension must be an ACTIVE manual rule (lead_score_rules), so the
// available actions are driven by Settings → Scoring. Disqualify (side_effect =
// force_perdido) is handled inside recompute (→ score 0 / lost). Audited via metadata.

export async function applyManualAction(
  leadId: string,
  dimension: string
): Promise<{ ok: true; score: number; status: string } | { ok: false; error: string }> {
  if (typeof dimension !== 'string' || !dimension) {
    return { ok: false, error: 'Acción inválida' }
  }

  const ctx      = await getCurrentTenantContext()
  const supabase = createAdminClient()

  // Fetch the lead, scoped by tenant (super_admin: ctx.tenant_id null → any tenant).
  let leadQ = supabase
    .from('leads')
    .select('id, tenant_id, agent_id, status')
    .eq('id', leadId)
  if (ctx.tenant_id) leadQ = leadQ.eq('tenant_id', ctx.tenant_id)
  const { data: lead } = await leadQ.maybeSingle()
  if (!lead) return { ok: false, error: 'Lead no encontrado o sin acceso' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const l = lead as any
  // Per-agent attribution: an agent may only act on their own leads. The existing
  // actor audit (metadata.actor_user_id/actor_role) is preserved below.
  const denied = assertCanWriteLead(ctx, { tenant_id: l.tenant_id, agent_id: l.agent_id })
  if (denied) return denied

  if (FROZEN_STATUSES.includes(l.status as LeadStatus)) {
    return { ok: false, error: 'Las acciones manuales no aplican a un lead fuera del funnel activo.' }
  }

  // Validate the dimension is an active manual rule (tenant override or global).
  const { data: rule } = await supabase
    .from('lead_score_rules')
    .select('points, label')
    .eq('category', 'manual')
    .eq('dimension', dimension)
    .eq('is_active', true)
    .or(`tenant_id.is.null,tenant_id.eq.${l.tenant_id}`)
    .order('tenant_id', { ascending: false, nullsFirst: false }) // prefer a tenant override
    .limit(1)
    .maybeSingle()
  if (!rule) return { ok: false, error: 'Acción no disponible' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = rule as any

  // Insert the event with audit (who via metadata, when via created_at). points is
  // informational on the row; recompute_lead_score derives the score from the rules.
  const { error: insertErr } = await supabase.from('lead_events').insert({
    lead_id:       leadId,
    tenant_id:     l.tenant_id as string,
    type:          dimension,
    description:   (r.label as string | null) ?? dimension,
    points:        r.points as number,
    actor_user_id: ctx.user_id,
    metadata:      { source: 'manual_panel', actor_user_id: ctx.user_id, actor_role: ctx.role },
  })
  if (insertErr) return { ok: false, error: insertErr.message }

  // Recompute (the AFTER INSERT trigger already does, but call explicitly per spec).
  const { error: recomputeErr } = await supabase.rpc('recompute_lead_score', { p_lead_id: leadId })
  if (recomputeErr) return { ok: false, error: recomputeErr.message }

  const { data: after } = await supabase
    .from('leads')
    .select('current_score, status')
    .eq('id', leadId)
    .single()

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  revalidatePath('/dashboard')
  return {
    ok: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    score:  ((after as any)?.current_score as number | null) ?? 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    status: ((after as any)?.status as string) ?? l.status,
  }
}

// ─── Start purchase process ───────────────────────────────────────────────────

export async function startPurchaseProcess(
  leadId: string,
  data: { address: string; loanType: string; closingDate: string; notes: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  // closing_date is mandatory — the email system depends on it for pre_close scheduling.
  if (!data.closingDate) return { ok: false, error: 'La fecha estimada de cierre es obligatoria' }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const closing = new Date(data.closingDate + 'T00:00:00')
  if (isNaN(closing.getTime()) || closing < today) {
    return { ok: false, error: 'La fecha de cierre debe ser hoy o posterior' }
  }

  const ctx      = await getCurrentTenantContext()
  const supabase = createAdminClient()

  const guard = await loadGuardedLead(supabase, ctx, leadId)
  if ('ok' in guard) return guard

  const { data: process, error: insertErr } = await supabase
    .from('purchase_processes')
    .insert({
      lead_id:      leadId,
      tenant_id:    guard.tenant_id,
      address:      data.address,
      loan_type:    data.loanType,
      closing_date: data.closingDate,
      notes:        data.notes || null,
    })
    .select('id')
    .single()

  if (insertErr) return { ok: false, error: insertErr.message }

  const { error: updateErr } = await supabase
    .from('leads')
    .update({ status: 'process_started' })
    .eq('id', leadId)

  if (updateErr) return { ok: false, error: updateErr.message }

  await supabase.from('lead_events').insert({
    lead_id:       leadId,
    tenant_id:     guard.tenant_id,
    type:          'status_changed',
    description:   'Proceso de compra iniciado.',
    points:        0,
    actor_user_id: ctx.user_id,
  })

  // Fire the lifecycle email for this milestone. Runs after the process is committed
  // so the service can read the row. Errors are logged but do not fail the action.
  const { sendPurchaseEmail } = await import('@/lib/services/send-purchase-email')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await sendPurchaseEmail(supabase, (process as any).id as string, 'start', data.closingDate)

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  revalidatePath('/dashboard')
  return { ok: true }
}

// ─── Delete lead ──────────────────────────────────────────────────────────────

export async function deleteLead(
  leadId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx      = await getCurrentTenantContext()
  const supabase = createAdminClient()

  // Fetch lead details BEFORE deleting — needed for the notification message
  // and to derive tenant_id (super_admin has ctx.tenant_id = null).
  let leadQ = supabase
    .from('leads')
    .select('id, tenant_id, agent_id, first_name, last_name, email')
    .eq('id', leadId)
  if (ctx.tenant_id) leadQ = leadQ.eq('tenant_id', ctx.tenant_id)
  const { data: lead } = await leadQ.maybeSingle()
  if (!lead) return { ok: false, error: 'Lead no encontrado' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const l = lead as any
  // Per-agent attribution: an agent may only delete their own leads.
  const denied = assertCanWriteLead(ctx, { tenant_id: l.tenant_id, agent_id: l.agent_id })
  if (denied) return denied

  const fullName = `${l.first_name} ${l.last_name ?? ''}`.trim() || 'Lead'

  // Notify before deletion (the lead row — and the FK lead_id — disappear on
  // delete, so the message must be self-contained). triggers Telegram via webhook.
  const { error: notifError } = await supabase.from('notifications').insert({
    tenant_id: l.tenant_id as string,
    type:      'lead_deleted',
    lead_id:   leadId,
    message:   `${fullName} (${l.email}) fue eliminado`,
  })
  if (notifError) {
    console.error(JSON.stringify({ service: 'deleteLead', lead_id: leadId, error: 'notification_insert_failed', detail: notifError.message }))
  }

  const { error } = await supabase.from('leads').delete().eq('id', leadId)
  if (error) {
    console.error(JSON.stringify({ service: 'deleteLead', lead_id: leadId, error: error.message }))
    return { ok: false, error: error.message }
  }

  revalidatePath('/leads')
  revalidatePath('/dashboard')
  return { ok: true }
}
