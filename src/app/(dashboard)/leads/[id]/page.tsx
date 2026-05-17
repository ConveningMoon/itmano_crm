import { createAdminClient } from '@/lib/supabase/admin'
import {
  mapAgent,
  mapLead,
  mapSource,
  mapLeadEvent,
  mapPurchaseProcess,
  type AgentRow,
  type LeadRow,
  type LeadSourceRow,
  type LeadEventRow,
  type PurchaseProcessRow,
} from '@/lib/db'
import { LeadDetailClient } from './lead-detail-client'
import { notFound } from 'next/navigation'
import type { PurchaseProcess } from '@/lib/types'

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const [{ data: rawLead }, { data: rawAgents }, { data: rawSources }, { data: rawEvents }, { data: rawProcess }] = await Promise.all([
    supabase.from('leads').select('*').eq('id', id).single(),
    supabase.from('agents').select('*'),
    supabase.from('lead_sources').select('*'),
    supabase.from('lead_events').select('*').eq('lead_id', id).order('created_at', { ascending: false }),
    supabase.from('purchase_processes').select('*').eq('lead_id', id).maybeSingle(),
  ])

  if (!rawLead) notFound()

  const lead           = mapLead(rawLead as LeadRow)
  const agents         = (rawAgents  ?? []).map(r => mapAgent(r as AgentRow))
  const sources        = (rawSources ?? []).map(r => mapSource(r as LeadSourceRow))
  const events         = (rawEvents  ?? []).map(r => mapLeadEvent(r as LeadEventRow))
  const purchaseProcess: PurchaseProcess | null = rawProcess ? mapPurchaseProcess(rawProcess as PurchaseProcessRow) : null

  return (
    // @ts-expect-error — agents, sources, purchaseProcess props added in next task
    <LeadDetailClient
      lead={lead}
      agent={agents.find(a => a.id === lead.agentId)}
      source={sources.find(s => s.id === lead.sourceId)}
      agents={agents}
      sources={sources}
      purchaseProcess={purchaseProcess}
      events={events}
    />
  )
}
