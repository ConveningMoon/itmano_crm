import { createAdminClient } from '@/lib/supabase/admin'
import { mapAgent, mapLead, type AgentRow, type LeadRow } from '@/lib/db'
import { LeadsClient } from './leads-client'
import type { ChannelOption } from './new/page'

const TENANT_ID = 'tenant-aj'

export default async function LeadsPage() {
  const supabase = createAdminClient()

  const [{ data: rawLeads }, { data: rawAgents }, { data: rawChannels }] = await Promise.all([
    supabase.from('leads').select('*').order('created_at', { ascending: false }),
    supabase.from('agents').select('*').eq('active', true),
    supabase.from('acquisition_channels').select('id, channel_type, name, slug').eq('tenant_id', TENANT_ID).eq('active', true).order('name'),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channels: ChannelOption[] = (rawChannels ?? []).map((r: any) => ({
    id:          r.id as string,
    channelType: r.channel_type as string,
    name:        r.name as string,
    slug:        r.slug as string,
  }))

  return (
    <LeadsClient
      leads={(rawLeads ?? []).map(r => mapLead(r as LeadRow))}
      agents={(rawAgents ?? []).map(r => mapAgent(r as AgentRow))}
      channels={channels}
    />
  )
}
