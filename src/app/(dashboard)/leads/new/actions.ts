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

// Baseline scores per channel_type, per CLAUDE.md Lead Scoring Model
const BASELINE_SCORES: Record<string, number> = {
  lead_magnet:   15,
  event:         40,
  contact_form:  20,
  manychat_flow: 20,
  manual:        10,
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
  const baselineScore = BASELINE_SCORES[input.channelType] ?? 10
  const leadId        = genId('lead')
  const trafficSource = MANUAL_TRAFFIC_SOURCES.has(input.trafficSource ?? '') ? input.trafficSource! : 'direct'

  const tenant = resolveTargetTenant(ctx, input.tenantId)
  if (typeof tenant === 'object') return { error: tenant.error }
  const tenantId = tenant
  // An agent is auto-attributed to their own leads (ignore any submitted agentId);
  // owner / super_admin pick the agent as before. ctx.agent_id is non-null for
  // role 'agent' (getCurrentTenantContext throws on an unlinked agent).
  const agentId = ctx.role === 'agent' ? ctx.agent_id! : input.agentId

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
    current_score:         baselineScore,
    peak_score:            baselineScore,
    lender:                input.lender,
    notes:                 input.notes,
  })

  if (error) return { error: error.message }

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

// Bulk import — maps old sourceType strings to channel types
const SOURCE_TYPE_TO_CHANNEL_TYPE: Record<string, string> = {
  lead_magnet:  'lead_magnet',
  web_form:     'contact_form',
  open_house:   'event',
  manual:       'manual',
  ads:          'manual',
  referral:     'manual',
}

interface BulkLeadInput {
  firstName:  string
  lastName:   string
  email:      string
  phone:      string | null
  language:   Language
  agentId:    string
  sourceType: string
  lender:     string | null
  notes:      string | null
}

export async function createLeadsBulk(
  inputs: BulkLeadInput[],
  chosenTenantId?: string,
): Promise<{ error?: string }> {
  if (inputs.length === 0) return {}

  const ctx = await getCurrentTenantContext()
  // Bulk import is an administrative operation — owner / super_admin only.
  const denied = requireWriteAccess(ctx)
  if (denied) return { error: denied.error }

  const tenant = resolveTargetTenant(ctx, chosenTenantId)
  if (typeof tenant === 'object') return { error: tenant.error }
  const tenantId = tenant

  const supabase = createAdminClient()

  // Resolve default manual channel for bulk imports
  const { data: manualChannel } = await supabase
    .from('acquisition_channels')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('channel_type', 'manual')
    .limit(1)
    .single()
  const manualChannelId = (manualChannel?.id as string | undefined) ?? null

  const rows = inputs.map(input => {
    const channelType   = SOURCE_TYPE_TO_CHANNEL_TYPE[input.sourceType] ?? 'manual'
    const baselineScore = BASELINE_SCORES[channelType] ?? 10
    return {
      id:                    genId('lead'),
      tenant_id:             tenantId,
      agent_id:              input.agentId,
      acquisition_channel_id: manualChannelId,
      traffic_source:        'direct',
      first_name:            input.firstName,
      last_name:             input.lastName,
      email:                 input.email,
      phone:                 input.phone,
      language:              input.language,
      status:                'new',
      current_score:         baselineScore,
      peak_score:            baselineScore,
      lender:                input.lender,
      notes:                 input.notes,
    }
  })

  const { error } = await supabase.from('leads').insert(rows)
  if (error) return { error: error.message }

  // Bulk imports go to the manual channel which typically has no sequence.
  // Enrollment is intentionally skipped for bulk — it would create hundreds
  // of simultaneous runs which is not the expected behavior for HubSpot imports.

  revalidatePath('/leads')
  revalidatePath('/dashboard')
  return {}
}
