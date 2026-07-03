import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export interface SwitcherTenant {
  id: string
  name: string
  color: string
}

// Lista liviana para el switcher del topbar (solo super_admin).
export async function getTenantsForSwitcher(): Promise<SwitcherTenant[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('tenants')
    .select('id, name, primary_color')
    .order('name')
  return ((data ?? []) as { id: string; name: string; primary_color: string | null }[]).map(t => ({
    id: t.id,
    name: t.name,
    color: t.primary_color ?? '#1E3A5F',
  }))
}

export interface TenantWithOwner {
  id:           string
  name:         string
  slug:         string
  primaryColor: string
  logoUrl:      string | null
  // The auth email of the tenant's agent_owner, or null if not provisioned yet.
  ownerEmail:   string | null
}

/**
 * Lists every tenant with its provisioned owner's email (super_admin view).
 *
 * The owner email lives on auth.users (not user_profiles), so we join through
 * user_profiles (role = 'agent_owner') and resolve each id via the admin API.
 * One owner per tenant today; getUserById per owner is bounded by tenant count.
 * Uses the admin client (service_role) — the only server-side path that can read
 * auth.users and bypass the SELECT-only user_profiles RLS.
 */
export async function getTenantsWithOwners(): Promise<TenantWithOwner[]> {
  const supabase = createAdminClient()

  const [{ data: tenantRows }, { data: ownerRows }] = await Promise.all([
    supabase.from('tenants').select('id, name, slug, primary_color, logo_url').order('created_at'),
    supabase.from('user_profiles').select('id, tenant_id').eq('role', 'agent_owner'),
  ])

  // tenant_id → owner auth user id (one owner per tenant by current rule)
  const ownerByTenant = new Map<string, string>()
  for (const o of (ownerRows ?? []) as { id: string; tenant_id: string | null }[]) {
    if (o.tenant_id) ownerByTenant.set(o.tenant_id, o.id)
  }

  const result: TenantWithOwner[] = []
  for (const t of (tenantRows ?? []) as {
    id: string; name: string; slug: string; primary_color: string | null; logo_url: string | null
  }[]) {
    let ownerEmail: string | null = null
    const ownerId = ownerByTenant.get(t.id)
    if (ownerId) {
      const { data } = await supabase.auth.admin.getUserById(ownerId)
      ownerEmail = data?.user?.email ?? null
    }
    result.push({
      id:           t.id,
      name:         t.name,
      slug:         t.slug,
      primaryColor: t.primary_color ?? '#1E3A5F',
      logoUrl:      t.logo_url ?? null,
      ownerEmail,
    })
  }

  return result
}
