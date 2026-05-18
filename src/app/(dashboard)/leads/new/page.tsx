import { createAdminClient } from '@/lib/supabase/admin'
import { mapAgent, type AgentRow } from '@/lib/db'
import { NewLeadClient } from './new-lead-client'

const TENANT_ID = 'tenant-aj'

export interface ChannelOption {
  id: string
  channelType: string
  name: string
  slug: string
}

export default async function NewLeadPage() {
  const supabase = createAdminClient()

  const [{ data: rawAgents }, { data: rawChannels }] = await Promise.all([
    supabase.from('agents').select('*').eq('tenant_id', TENANT_ID).eq('active', true).order('name'),
    supabase
      .from('acquisition_channels')
      .select('id, channel_type, name, slug')
      .eq('tenant_id', TENANT_ID)
      .eq('active', true)
      .order('name'),
  ])

  const agents   = (rawAgents   ?? []).map(r => mapAgent(r as AgentRow))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channels = (rawChannels ?? []).map((r: any) => ({
    id:          r.id as string,
    channelType: r.channel_type as string,
    name:        r.name as string,
    slug:        r.slug as string,
  })) as ChannelOption[]

  return <NewLeadClient agents={agents} channels={channels} />
}
