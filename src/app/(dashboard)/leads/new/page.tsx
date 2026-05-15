import { createClient } from '@/lib/supabase/server'
import { mapAgent, type AgentRow } from '@/lib/db'
import { NewLeadClient } from './new-lead-client'

export default async function NewLeadPage() {
  const supabase = await createClient()
  const { data: rawAgents } = await supabase.from('agents').select('*').eq('active', true)
  const agents = (rawAgents ?? []).map(r => mapAgent(r as AgentRow))

  return <NewLeadClient agents={agents} />
}
