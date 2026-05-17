import { createAdminClient } from '@/lib/supabase/admin'
import { mapAgent, mapLead, mapSource, type AgentRow, type LeadRow, type LeadSourceRow } from '@/lib/db'
import { LeadsClient } from './leads-client'

export default async function LeadsPage() {
  const supabase = createAdminClient()

  const [{ data: rawLeads }, { data: rawAgents }, { data: rawSources }] = await Promise.all([
    supabase.from('leads').select('*').order('created_at', { ascending: false }),
    supabase.from('agents').select('*').eq('active', true),
    supabase.from('lead_sources').select('*'),
  ])

  return (
    <LeadsClient
      leads={(rawLeads ?? []).map(r => mapLead(r as LeadRow))}
      agents={(rawAgents ?? []).map(r => mapAgent(r as AgentRow))}
      sources={(rawSources ?? []).map(r => mapSource(r as LeadSourceRow))}
    />
  )
}
