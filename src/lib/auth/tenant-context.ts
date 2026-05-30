import 'server-only'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type TenantRole = 'super_admin' | 'agent_owner' | 'agent'

export interface TenantContext {
  user_id:   string
  role:      TenantRole
  // null for super_admin (sees all tenants); set for all other roles
  tenant_id: string | null
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

  return {
    user_id:   user.id,
    role:      profile.role as TenantRole,
    tenant_id: profile.tenant_id ?? null,
  }
}
