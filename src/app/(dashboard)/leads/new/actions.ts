'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { requireWriteAccess, resolveTargetTenant } from '@/lib/auth/guards'
import { enrollLeadInSequence } from '@/lib/services/enroll-lead-in-sequence'
import type { Language } from '@/lib/types'

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

interface LeadInput {
  firstName:           string
  lastName:            string
  email:               string
  phone:               string | null
  language:            Language
  agentId:             string
  acquisitionChannelId: string
  channelType:         string
  lender:              string | null
  notes:               string | null
  // Only honored for super_admin (who has no tenant of their own); owner/agent
  // always use their context tenant.
  tenantId?:           string
  // Arrival source for direct-entry sources (Instagram/Facebook/WhatsApp set their
  // own; manual + channel-based use 'direct'). Whitelisted server-side.
  trafficSource?:      string
}

// Direct-entry arrival sources accepted from the manual form (must match the
// leads.traffic_source CHECK). Anything else falls back to 'direct'.
const MANUAL_TRAFFIC_SOURCES = new Set(['direct', 'instagram', 'facebook', 'whatsapp'])

export async function createLead(input: LeadInput): Promise<{ error?: string }> {
  const ctx           = await getCurrentTenantContext()
  const supabase      = createAdminClient()
  const leadId        = genId('lead')
  const trafficSource = MANUAL_TRAFFIC_SOURCES.has(input.trafficSource ?? '') ? input.trafficSource! : 'direct'

  const tenant = resolveTargetTenant(ctx, input.tenantId)
  if (typeof tenant === 'object') return { error: tenant.error }
  const tenantId = tenant
  // An agent is auto-attributed to their own leads (ignore any submitted agentId);
  // owner / super_admin pick the agent as before. ctx.agent_id is non-null for
  // role 'agent' (getCurrentTenantContext throws on an unlinked agent).
  const agentId = ctx.role === 'agent' ? ctx.agent_id! : input.agentId

  // Canonical scoring: the lead is born with score 0; recompute_lead_score (called
  // below) is the single source of truth. No baselines written directly.
  const { error } = await supabase.from('leads').insert({
    id:                    leadId,
    tenant_id:             tenantId,
    agent_id:              agentId,
    acquisition_channel_id: input.acquisitionChannelId || null,
    traffic_source:        trafficSource,
    first_name:            input.firstName,
    last_name:             input.lastName,
    email:                 input.email,
    phone:                 input.phone,
    language:              input.language,
    status:                'new',
    current_score:         0,
    peak_score:            0,
    lender:                input.lender,
    notes:                 input.notes,
  })

  if (error) return { error: error.message }

  // Apply the canonical model (fit + engagement + manual). For a fresh manual lead
  // with no events this resolves to 0 / status 'new'.
  await supabase.rpc('recompute_lead_score', { p_lead_id: leadId })

  // Enroll in email sequence if the channel has one.
  // Failure is logged but never rolls back the lead creation.
  await enrollLeadInSequence({
    db:                     supabase,
    lead_id:                leadId,
    tenant_id:              tenantId,
    acquisition_channel_id: input.acquisitionChannelId || null,
  })

  revalidatePath('/leads')
  revalidatePath('/dashboard')
  return {}
}

// ─── Bulk import (CSV/XLSX) ───────────────────────────────────────────────────

function normEmail(e: string): string {
  return e.trim().toLowerCase()
}

// Returns the subset of `emails` that already exist as leads in the target tenant
// (case-insensitive). Used by the import preview to flag "already exists" rows.
// Owner / super_admin only (same gate as the import itself).
export async function getExistingLeadEmails(
  emails: string[],
  chosenTenantId?: string,
): Promise<{ ok: true; existing: string[] } | { ok: false; error: string }> {
  const ctx    = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return { ok: false, error: denied.error }

  const tenant = resolveTargetTenant(ctx, chosenTenantId)
  if (typeof tenant === 'object') return { ok: false, error: tenant.error }
  if (emails.length === 0) return { ok: true, existing: [] }

  const supabase = createAdminClient()
  // leads.email is not guaranteed lowercased, so compare in-process.
  const { data } = await supabase.from('leads').select('email').eq('tenant_id', tenant)
  const taken    = new Set((data ?? []).map(r => normEmail((r as { email: string }).email)))
  const wanted   = new Set(emails.map(normEmail))
  const existing = [...wanted].filter(e => taken.has(e))
  return { ok: true, existing }
}

export interface BulkLeadInput {
  firstName: string
  lastName:  string
  email:     string
  phone:     string | null
  language:  Language
  status:    'new' | 'closed'
  lender:    string | null
  notes:     string | null
}

export interface BulkImportResult {
  inserted:        number
  skippedExisting: number
}

// Imports leads attributed to a single agent. Canonical scoring: every lead is
// born current_score 0 and recompute_lead_score is applied (closed leads are
// frozen → no-op). traffic_source = 'direct' (manual registration; 'manual' is not
// a valid traffic_source value). No email-sequence enrollment, ever.
export async function createLeadsBulk(
  inputs:        BulkLeadInput[],
  agentId:       string,
  chosenTenantId?: string,
): Promise<{ ok: true; result: BulkImportResult } | { ok: false; error: string }> {
  const ctx    = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return { ok: false, error: denied.error }

  const tenant = resolveTargetTenant(ctx, chosenTenantId)
  if (typeof tenant === 'object') return { ok: false, error: tenant.error }
  const tenantId = tenant

  if (!agentId) return { ok: false, error: 'Selecciona el agente al que se atribuirán los leads' }

  const supabase = createAdminClient()

  // Validate the attribution agent belongs to the tenant.
  const { data: agent } = await supabase
    .from('agents').select('id').eq('id', agentId).eq('tenant_id', tenantId).maybeSingle()
  if (!agent) return { ok: false, error: 'El agente seleccionado no pertenece a este tenant' }

  // Dedup: drop rows without a valid email, intra-batch duplicates (first wins),
  // and emails already present in the tenant — a final server-side safety net on
  // top of the preview check.
  const { data: existingRows } = await supabase.from('leads').select('email').eq('tenant_id', tenantId)
  const taken = new Set((existingRows ?? []).map(r => normEmail((r as { email: string }).email)))
  const seen  = new Set<string>()
  let skippedExisting = 0

  const rows = inputs
    .filter(input => {
      const email = normEmail(input.email)
      if (!email) return false
      if (seen.has(email)) return false
      seen.add(email)
      if (taken.has(email)) { skippedExisting++; return false }
      return true
    })
    .map(input => ({
      id:                    genId('lead'),
      tenant_id:             tenantId,
      agent_id:              agentId,
      acquisition_channel_id: null,
      traffic_source:        'direct',
      first_name:            input.firstName,
      last_name:             input.lastName,
      email:                 input.email.trim(),
      phone:                 input.phone,
      language:              input.language,
      status:                input.status,
      current_score:         0,
      peak_score:            0,
      lender:                input.lender,
      notes:                 input.notes,
    }))

  if (rows.length === 0) {
    return { ok: true, result: { inserted: 0, skippedExisting } }
  }

  const { data: inserted, error } = await supabase.from('leads').insert(rows).select('id, status')
  if (error) return { ok: false, error: error.message }

  // Canonical scoring. 'closed' leads are frozen (recompute early-returns); only
  // 'new' leads need it, and with no events they resolve to 0 — applied for
  // correctness/consistency with the model. No enrollment is triggered.
  for (const r of (inserted ?? []) as { id: string; status: string }[]) {
    if (r.status === 'new') {
      await supabase.rpc('recompute_lead_score', { p_lead_id: r.id })
    }
  }

  revalidatePath('/leads')
  revalidatePath('/dashboard')
  return { ok: true, result: { inserted: rows.length, skippedExisting } }
}
