import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { scopeFor, applyVisibilityScope } from '@/lib/auth/visibility'
import { mapAgent, mapLead, type AgentRow, type LeadRow } from '@/lib/db'
import { LeadsClient } from './leads-client'
import type { ChannelOption } from './new/page'

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; channelId?: string }>
}) {
  const params = await searchParams
  const initialSource    = params.source    ?? 'all'
  const initialChannelId = params.channelId ?? 'all'

  // getCurrentTenantContext reads cookies → forces dynamic (non-cached) rendering
  const ctx = await getCurrentTenantContext()
  const scope = scopeFor(ctx)
  const { tenant_id, role } = ctx
  const supabase = createAdminClient()

  // Leads: scoped by tenant (owner/super) and additionally by agent_id (role 'agent').
  const leadsQ    = applyVisibilityScope(
    supabase.from('leads').select('*').order('created_at', { ascending: false }),
    scope,
  )
  // Agents + channels are reference data for rendering/filters → tenant-scoped only.
  const agentsQ   = supabase.from('agents').select('*').eq('active', true)
  const channelsQ = supabase.from('acquisition_channels').select('id, tenant_id, channel_type, name, slug, agent_id').eq('active', true).order('name')

  const [{ data: rawLeads }, { data: rawAgents }, { data: rawChannels }] = await Promise.all([
    leadsQ,
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
    agentId:     (r.agent_id ?? null) as string | null,
  }))

  return (
    <LeadsClient
      leads={(rawLeads ?? []).map(r => mapLead(r as LeadRow))}
      agents={(rawAgents ?? []).map(r => mapAgent(r as AgentRow))}
      channels={channels}
      viewerRole={role}
      viewerAgentId={scope.agentId}
      initialSource={initialSource}
      initialChannelId={initialChannelId}
    />
  )
}
