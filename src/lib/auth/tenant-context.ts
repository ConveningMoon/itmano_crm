import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { columns } from '@/lib/supabase/columns'
import { getSelectedTenant } from './admin-tenant'

const PROFILE_COLUMNS    = columns('user_profiles', ['tenant_id', 'role'])
const AGENT_LINK_COLUMNS = columns('agents', ['id', 'tenant_id'])

interface ProfileRow   { tenant_id: string | null; role: string }
interface AgentLinkRow { id: string; tenant_id: string | null }

export type TenantRole = 'super_admin' | 'agent_owner' | 'agent'

export interface TenantContext {
  user_id:   string
  // Email de la sesión (claim del JWT). Va aquí para que el shell no tenga que
  // volver a pedir el usuario al servidor de auth solo para el pie del sidebar.
  email:     string
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

  // getClaims() verifica la firma del JWT en local contra el JWKS del proyecto
  // (claves asimétricas ES256), así que la identidad se resuelve sin ida y vuelta
  // al servidor de auth. Es igual de confiable que getUser() —la firma se valida,
  // no se confía en la cookie— y ahorra un round-trip en CADA página y action.
  // La cookie de tenant seleccionado (super_admin) se valida contra `tenants`.
  // Arranca YA, en paralelo con el perfil: sólo hace red si la cookie existe,
  // y esperar a conocer el rol para lanzarla era una ola entera más en cada
  // request del super_admin actuando como tenant. Si el rol resulta no ser
  // super_admin la respuesta se ignora, como siempre.
  const selectedPromise = getSelectedTenant()

  const { data: claims, error: authError } = await supabase.auth.getClaims()

  if (authError || !claims) {
    redirect('/login')
  }

  const userId = claims.claims.sub
  const email  = (claims.claims.email as string | undefined) ?? ''

  // Perfil y fila de agente en la MISMA ola. La fila de agente sólo importa si
  // el rol resulta ser 'agent', pero esperar al rol para pedirla era una ola
  // entera más en cada página y cada action de los agentes (dos de cada cinco
  // usuarios en producción). `agents.user_id` es único (`agents_user_id_key`),
  // así que se pide por el uid y el tenant se comprueba abajo, en memoria. Para
  // los demás roles la respuesta se ignora: una lectura más en paralelo, sin
  // coste de espera.
  const [
    { data: profileData, error: profileError },
    { data: agentData },
  ] = await Promise.all([
    supabase
      .from('user_profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', userId)
      .single(),
    supabase
      .from('agents')
      .select(AGENT_LINK_COLUMNS)
      .eq('user_id', userId)
      .maybeSingle(),
  ])
  // `columns()` devuelve un string, así que supabase-js no infiere la fila: se
  // tipa aquí, igual que en `getTenantRow`. Las listas sí están validadas
  // contra el esquema.
  const profile  = profileData as unknown as ProfileRow | null
  const agentRow = agentData as unknown as AgentLinkRow | null

  if (profileError || !profile) {
    // Valid session but no profile (e.g. a deprovisioned or never-provisioned
    // account). Sign out (best-effort) and bounce to login with a friendly
    // message instead of crashing the page with an unhandled error.
    await supabase.auth.signOut()
    redirect('/login?error=sin-acceso')
  }

  const role = profile.role as TenantRole

  // agent_id sólo para el rol 'agent'. super_admin y agent_owner no son filas
  // de agente: el suyo es null aunque exista una fila con su uid.
  let agent_id: string | null = null
  if (role === 'agent') {
    // La fila tiene que ser del MISMO tenant que el perfil, como exigía el
    // filtro `tenant_id` de la consulta que esperaba al rol.
    const agent = agentRow
    if (!agent || agent.tenant_id !== (profile.tenant_id ?? '')) {
      throw new Error(
        `User ${userId} has role 'agent' but no linked agents row ` +
        `(agents.user_id = '${userId}' in tenant '${profile.tenant_id}'). ` +
        `Invalid provisioning: link an agent record before granting the 'agent' role.`
      )
    }
    agent_id = agent.id
  }

  // Super admin: honrar la cookie de tenant seleccionado (validada contra la
  // tabla tenants). Para cualquier otro rol la cookie se ignora siempre — el
  // rol se revalida contra user_profiles en cada request.
  let tenant_id = profile.tenant_id ?? null
  let acting_as_tenant = false
  if (role === 'super_admin') {
    const selected = await selectedPromise
    if (selected) {
      tenant_id = selected.id
      acting_as_tenant = true
    }
  }

  return {
    user_id: userId,
    email,
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
