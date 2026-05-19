import { createAdminClient } from '@/lib/supabase/admin'
import {
  mapAgent,
  mapLead,
  mapLeadEvent,
  mapPurchaseProcess,
  type AgentRow,
  type LeadRow,
  type LeadEventRow,
  type PurchaseProcessRow,
} from '@/lib/db'
import { LeadDetailClient } from './lead-detail-client'
import { notFound } from 'next/navigation'
import type { PurchaseProcess } from '@/lib/types'
import type { ChannelOption } from '../new/page'

const TENANT_ID = 'tenant-aj'

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const [
    { data: rawLead },
    { data: rawAgents },
    { data: rawEvents },
    { data: rawProcess },
    { data: rawChannels },
  ] = await Promise.all([
    supabase.from('leads').select('*').eq('id', id).single(),
    supabase.from('agents').select('*'),
    supabase.from('lead_events').select('*').eq('lead_id', id).order('created_at', { ascending: false }),
    supabase.from('purchase_processes').select('*').eq('lead_id', id).maybeSingle(),
    supabase.from('acquisition_channels').select('id, channel_type, name, slug').eq('tenant_id', TENANT_ID).eq('active', true).order('name'),
  ])

  if (!rawLead) notFound()

  const lead           = mapLead(rawLead as LeadRow)
  const agents         = (rawAgents  ?? []).map(r => mapAgent(r as AgentRow))
  const events         = (rawEvents  ?? []).map(r => mapLeadEvent(r as LeadEventRow))
  const purchaseProcess: PurchaseProcess | null = rawProcess ? mapPurchaseProcess(rawProcess as PurchaseProcessRow) : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channels: ChannelOption[] = (rawChannels ?? []).map((r: any) => ({
    id:          r.id as string,
    channelType: r.channel_type as string,
    name:        r.name as string,
    slug:        r.slug as string,
  }))

  return (
    <LeadDetailClient
      lead={lead}
      agent={agents.find(a => a.id === lead.agentId)}
      agents={agents}
      channels={channels}
      purchaseProcess={purchaseProcess}
      events={events}
    />
  )
}
