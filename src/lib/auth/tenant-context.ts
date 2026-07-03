import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSelectedTenant } from './admin-tenant'

export type TenantRole = 'super_admin' | 'agent_owner' | 'agent'

export interface TenantContext {
  user_id:   string
  role:      TenantRole
  // null for super_admin WITHOUT a selected tenant (hub mode); the selected
  // tenant id when acting as a tenant; always set for all other roles
  tenant_id: string | null
  // agents.id of the team-member record linked to this login (agents.user_id =
  // auth uid). Only set for role 'agent'; null for super_admin and agent_owner
  // (the owner manages the whole tenant and is not itself an agent record).
  agent_id:  string | null
  // true only for super_admin with a valid tenant-selection cookie
  acting_as_tenant: boolean
}

/**
 * Returns the tenant context for the currently authenticated user.
 * Redirects to /login if no session exists.
 * Throws if the user has no user_profile row (misconfigured account).
 *
 * Wrapped in React cache(): dedups the profile queries across layout, page and
 * actions within the same request, and makes the cookie validation free.
 */
export const getCurrentTenantContext = cache(async (): Promise<TenantContext> => {
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
    // Valid session but no profile (e.g. a deprovisioned or never-provisioned
    // account). Sign out (best-effort) and bounce to login with a friendly
    // message instead of crashing the page with an unhandled error.
    await supabase.auth.signOut()
    redirect('/login?error=sin-acceso')
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

  // Super admin: honrar la cookie de tenant seleccionado (validada contra la
  // tabla tenants). Para cualquier otro rol la cookie se ignora siempre — el
  // rol se revalida contra user_profiles en cada request.
  let tenant_id = profile.tenant_id ?? null
  let acting_as_tenant = false
  if (role === 'super_admin') {
    const selected = await getSelectedTenant()
    if (selected) {
      tenant_id = selected.id
      acting_as_tenant = true
    }
  }

  return {
    user_id: user.id,
    role,
    tenant_id,
    agent_id,
    acting_as_tenant,
  }
})

/**
 * Guarda para páginas que solo tienen sentido dentro de un tenant. Un
 * super_admin sin tenant seleccionado va al centro de control (elimina la
 * mega-vista sin filtro). No-op para roles con tenant propio.
 */
export async function requireTenantContext(): Promise<TenantContext> {
  const ctx = await getCurrentTenantContext()
  if (ctx.role === 'super_admin' && !ctx.tenant_id) {
    redirect('/admin')
  }
  return ctx
}
