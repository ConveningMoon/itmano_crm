import { createClient } from '@/lib/supabase/server'
import { mapAgent, mapLead, mapSource, type AgentRow, type LeadRow, type LeadSourceRow } from '@/lib/db'
import { LeadDetailClient } from './lead-detail-client'
import { notFound } from 'next/navigation'

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: rawLead }, { data: rawAgents }, { data: rawSources }, { data: rawEvents }] = await Promise.all([
    supabase.from('leads').select('*').eq('id', id).single(),
    supabase.from('agents').select('*'),
    supabase.from('lead_sources').select('*'),
    supabase.from('lead_events').select('*').eq('lead_id', id).order('created_at', { ascending: false }),
  ])

  if (!rawLead) notFound()

  const lead    = mapLead(rawLead as LeadRow)
  const agents  = (rawAgents  ?? []).map(r => mapAgent(r as AgentRow))
  const sources = (rawSources ?? []).map(r => mapSource(r as LeadSourceRow))
  const events  = (rawEvents  ?? []).map(r => ({
    id:          r.id as string,
    tenantId:    r.tenant_id as string,
    leadId:      r.lead_id as string,
    type:        r.type as string,
    description: r.description as string,
    createdAt:   r.created_at as string,
  }))

  return (
    <LeadDetailClient
      lead={lead}
      agent={agents.find(a => a.id === lead.agentId)}
      source={sources.find(s => s.id === lead.sourceId)}
      events={events}
    />
  )
}
