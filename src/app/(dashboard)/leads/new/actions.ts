'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { enrollLeadInSequence } from '@/lib/services/enroll-lead-in-sequence'
import type { Language } from '@/lib/types'

const TENANT_ID = 'tenant-aj'

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
}

export async function createLead(input: LeadInput): Promise<{ error?: string }> {
  const supabase      = createAdminClient()
  const baselineScore = BASELINE_SCORES[input.channelType] ?? 10
  const leadId        = genId('lead')

  const { error } = await supabase.from('leads').insert({
    id:                    leadId,
    tenant_id:             TENANT_ID,
    agent_id:              input.agentId,
    acquisition_channel_id: input.acquisitionChannelId || null,
    traffic_source:        'direct',
    first_name:            input.firstName,
    last_name:             input.lastName,
    email:                 input.email,
    phone:                 input.phone,
    language:              input.language,
    status:                'new',
    temperature_score:     baselineScore,
    lender:                input.lender,
    notes:                 input.notes,
  })

  if (error) return { error: error.message }

  // Enroll in email sequence if the channel has one.
  // Failure is logged but never rolls back the lead creation.
  await enrollLeadInSequence({
    db:                     supabase,
    lead_id:                leadId,
    tenant_id:              TENANT_ID,
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

export async function createLeadsBulk(inputs: BulkLeadInput[]): Promise<{ error?: string }> {
  if (inputs.length === 0) return {}

  const supabase = createAdminClient()

  // Resolve default manual channel for bulk imports
  const { data: manualChannel } = await supabase
    .from('acquisition_channels')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('channel_type', 'manual')
    .limit(1)
    .single()
  const manualChannelId = (manualChannel?.id as string | undefined) ?? null

  const rows = inputs.map(input => {
    const channelType   = SOURCE_TYPE_TO_CHANNEL_TYPE[input.sourceType] ?? 'manual'
    const baselineScore = BASELINE_SCORES[channelType] ?? 10
    return {
      id:                    genId('lead'),
      tenant_id:             TENANT_ID,
      agent_id:              input.agentId,
      acquisition_channel_id: manualChannelId,
      traffic_source:        'direct',
      first_name:            input.firstName,
      last_name:             input.lastName,
      email:                 input.email,
      phone:                 input.phone,
      language:              input.language,
      status:                'new',
      temperature_score:     baselineScore,
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
