import 'server-only'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type TenantRole = 'super_admin' | 'agent_owner' | 'agent'

export interface TenantContext {
  user_id:   string
  role:      TenantRole
  // null for super_admin (sees all tenants); set for all other roles
  tenant_id: string | null
  // agents.id of the team-member record linked to this login (agents.user_id =
  // auth uid). Only set for role 'agent'; null for super_admin and agent_owner
  // (the owner manages the whole tenant and is not itself an agent record).
  agent_id:  string | null
}

/**
 * Returns the tenant context for the currently authenticated user.
 * Redirects to /login if no session exists.
 * Throws if the user has no user_profile row (misconfigured account).
 */
export async function getCurrentTenantContext(): Promise<TenantContext> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    throw new Error(
      `No user_profile found for auth user ${user.id}. ` +
      `Run: INSERT INTO user_profiles (id, role) VALUES ('${user.id}', 'agent_owner')`
    )
  }

  const role = profile.role as TenantRole

  // Resolve agent_id only for role 'agent' — the one extra query is scoped to that
  // case so super_admin / agent_owner pay no overhead. super_admin and agent_owner
  // are not agent records, so their agent_id is null.
  let agent_id: string | null = null
  if (role === 'agent') {
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id')
      .eq('user_id', user.id)
      .eq('tenant_id', profile.tenant_id ?? '')
      .single()

    if (agentError || !agent) {
      throw new Error(
        `User ${user.id} has role 'agent' but no linked agents row ` +
        `(agents.user_id = '${user.id}' in tenant '${profile.tenant_id}'). ` +
        `Invalid provisioning: link an agent record before granting the 'agent' role.`
      )
    }
    agent_id = agent.id as string
  }

  return {
    user_id:   user.id,
    role,
    tenant_id: profile.tenant_id ?? null,
    agent_id,
  }
}
