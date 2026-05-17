'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import type { Language } from '@/lib/types'

const TENANT_ID = 'tenant-aj'

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

interface LeadInput {
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

async function getOrCreateSource(supabase: ReturnType<typeof createAdminClient>, type: string) {
  const { data: existing } = await supabase
    .from('lead_sources')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('type', type)
    .limit(1)
    .single()

  if (existing) return existing.id

  const sourceLabels: Record<string, string> = {
    lead_magnet: 'Lead Magnet', web_form: 'Formulario Web', open_house: 'Open House',
    manual: 'Registro Manual', ads: 'Meta Ads', referral: 'Referido',
  }

  const newId = genId('src')
  await supabase.from('lead_sources').insert({
    id: newId, tenant_id: TENANT_ID, name: sourceLabels[type] ?? type, type,
  })
  return newId
}

export async function createLead(input: LeadInput): Promise<{ error?: string }> {
  const supabase = createAdminClient()
  const sourceId = await getOrCreateSource(supabase, input.sourceType)

  const { error } = await supabase.from('leads').insert({
    id:                genId('lead'),
    tenant_id:         TENANT_ID,
    agent_id:          input.agentId,
    source_id:         sourceId,
    first_name:        input.firstName,
    last_name:         input.lastName,
    email:             input.email,
    phone:             input.phone,
    language:          input.language,
    status:            'new',
    temperature_score: 0,
    lender:            input.lender,
    notes:             input.notes,
  })

  if (error) return { error: error.message }
  return {}
}

export async function createLeadsBulk(inputs: LeadInput[]): Promise<{ error?: string }> {
  if (inputs.length === 0) return {}

  const supabase = createAdminClient()

  const sourceTypeIds: Record<string, string> = {}
  for (const type of [...new Set(inputs.map(i => i.sourceType))]) {
    sourceTypeIds[type] = await getOrCreateSource(supabase, type)
  }

  const rows = inputs.map(input => ({
    id:                genId('lead'),
    tenant_id:         TENANT_ID,
    agent_id:          input.agentId,
    source_id:         sourceTypeIds[input.sourceType],
    first_name:        input.firstName,
    last_name:         input.lastName,
    email:             input.email,
    phone:             input.phone,
    language:          input.language,
    status:            'new',
    temperature_score: 0,
    lender:            input.lender,
    notes:             input.notes,
  }))

  const { error } = await supabase.from('leads').insert(rows)
  if (error) return { error: error.message }
  return {}
}
