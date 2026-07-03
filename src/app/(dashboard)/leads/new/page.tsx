import { createAdminClient } from '@/lib/supabase/admin'
import { mapAgent, type AgentRow } from '@/lib/db'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { NewLeadClient } from './new-lead-client'

export interface ChannelOption {
  id:          string
  tenantId:    string
  channelType: string
  name:        string
  slug:        string
  agentId:     string | null
}

export interface TenantOption {
  id: string
  name: string
}

export default async function NewLeadPage() {
  const ctx      = await requireTenantContext()
  // El picker de tenant solo aplica a un super_admin SIN selección — estado hoy
  // inalcanzable aquí (requireTenantContext lo manda al hub), pero la expresión
  // se mantiene explícita por si la guarda cambia.
  const needsTenantPicker = ctx.role === 'super_admin' && !ctx.tenant_id
  const supabase = createAdminClient()

  // Scope agents/channels por tenant del contexto (incluye al super_admin
  // actuando como tenant — su ctx.tenant_id viene de la selección).
  let agentsQ   = supabase.from('agents').select('*').eq('active', true).order('name')
  let channelsQ = supabase
    .from('acquisition_channels')
    .select('id, tenant_id, channel_type, name, slug, agent_id')
    .eq('active', true)
    .order('name')
  if (ctx.tenant_id) {
    agentsQ   = agentsQ.eq('tenant_id', ctx.tenant_id)
    channelsQ = channelsQ.eq('tenant_id', ctx.tenant_id)
  }

  const [{ data: rawAgents }, { data: rawChannels }, { data: rawTenants }] = await Promise.all([
    agentsQ,
    channelsQ,
    needsTenantPicker
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
    agentId:     (r.agent_id ?? null) as string | null,
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
      isSuperAdmin={needsTenantPicker}
      tenants={tenants}
      myAgentId={myAgentId}
    />
  )
}
