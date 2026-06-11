import { createAdminClient } from '@/lib/supabase/admin'
import { mapAgent, type AgentRow } from '@/lib/db'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { NewLeadClient } from './new-lead-client'

export interface ChannelOption {
  id: string
  tenantId: string
  channelType: string
  name: string
  slug: string
}

export interface TenantOption {
  id: string
  name: string
}

export default async function NewLeadPage() {
  const ctx      = await getCurrentTenantContext()
  const isSuper  = ctx.role === 'super_admin'
  const supabase = createAdminClient()

  // Scope agents/channels by tenant. super_admin sees every tenant's (the client
  // filters by the selected tenant); owner/agent are scoped to their own tenant.
  let agentsQ   = supabase.from('agents').select('*').eq('active', true).order('name')
  let channelsQ = supabase
    .from('acquisition_channels')
    .select('id, tenant_id, channel_type, name, slug')
    .eq('active', true)
    .order('name')
  if (!isSuper && ctx.tenant_id) {
    agentsQ   = agentsQ.eq('tenant_id', ctx.tenant_id)
    channelsQ = channelsQ.eq('tenant_id', ctx.tenant_id)
  }

  const [{ data: rawAgents }, { data: rawChannels }, { data: rawTenants }] = await Promise.all([
    agentsQ,
    channelsQ,
    isSuper
      ? supabase.from('tenants').select('id, name').order('name')
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ])

  const agents   = (rawAgents ?? []).map(r => mapAgent(r as AgentRow))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channels = (rawChannels ?? []).map((r: any) => ({
    id:          r.id as string,
    tenantId:    r.tenant_id as string,
    channelType: r.channel_type as string,
    name:        r.name as string,
    slug:        r.slug as string,
  })) as ChannelOption[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenants = (rawTenants ?? []).map((r: any) => ({ id: r.id as string, name: r.name as string })) as TenantOption[]

  // The agent record linked to this login (if any) — used to auto-attribute imports.
  const { data: myAgentRow } = await supabase
    .from('agents').select('id').eq('user_id', ctx.user_id).maybeSingle()
  const myAgentId = (myAgentRow as { id: string } | null)?.id ?? null

  return (
    <NewLeadClient
      agents={agents}
      channels={channels}
      isSuperAdmin={isSuper}
      tenants={tenants}
      myAgentId={myAgentId}
    />
  )
}
