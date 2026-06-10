import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { mapAgent, mapLead, type AgentRow, type LeadRow } from '@/lib/db'
import { LeadsClient } from './leads-client'
import type { ChannelOption } from './new/page'

export default async function LeadsPage() {
  // getCurrentTenantContext reads cookies → forces dynamic (non-cached) rendering
  const { tenant_id } = await getCurrentTenantContext()
  const supabase = createAdminClient()

  const leadsQ    = supabase.from('leads').select('*').order('created_at', { ascending: false })
  const agentsQ   = supabase.from('agents').select('*').eq('active', true)
  const channelsQ = supabase.from('acquisition_channels').select('id, tenant_id, channel_type, name, slug').eq('active', true).order('name')

  const [{ data: rawLeads }, { data: rawAgents }, { data: rawChannels }] = await Promise.all([
    tenant_id ? leadsQ.eq('tenant_id',    tenant_id) : leadsQ,
    tenant_id ? agentsQ.eq('tenant_id',   tenant_id) : agentsQ,
    tenant_id ? channelsQ.eq('tenant_id', tenant_id) : channelsQ,
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channels: ChannelOption[] = (rawChannels ?? []).map((r: any) => ({
    id:          r.id as string,
    tenantId:    r.tenant_id as string,
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
