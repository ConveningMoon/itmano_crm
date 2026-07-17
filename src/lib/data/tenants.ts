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

export interface TenantBranding {
  name:    string
  logoUrl: string | null
}

// Branding del tenant activo para el shell (logo del sidebar). Una sola fila.
export async function getTenantBranding(tenantId: string): Promise<TenantBranding | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('tenants')
    .select('name, logo_url')
    .eq('id', tenantId)
    .maybeSingle()
  if (!data) return null
  const t = data as { name: string; logo_url: string | null }
  return { name: t.name, logoUrl: t.logo_url ?? null }
}

export interface TenantWithOwner {
  id:           string
  name:         string
  slug:         string
  primaryColor: string
  logoUrl:      string | null
  // The auth email of the tenant's agent_owner, or null if not provisioned yet.
  ownerEmail:   string | null
  // Límite mensual de IA (USD) + flag ilimitado + gasto del mes en curso.
  aiMonthlyLimitUsd: number
  aiUnlimited:       boolean
  aiUsedThisMonthUsd: number
  // Suscripción (null si el tenant no tiene fila — pre-054).
  subscriptionPlan:          string | null
  subscriptionStatus:        string | null
  subscriptionRequestedPlan: string | null
  subscriptionTrialEndsAt:   string | null
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

  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString()

  const [{ data: tenantRows }, { data: ownerRows }, { data: usageRows }, { data: subRows }] = await Promise.all([
    supabase.from('tenants').select('id, name, slug, primary_color, logo_url, ai_monthly_limit_usd, ai_unlimited').order('created_at'),
    supabase.from('user_profiles').select('id, tenant_id').eq('role', 'agent_owner'),
    supabase.from('ai_usage_events').select('tenant_id, cost_usd').gte('created_at', monthStart),
    supabase.from('subscriptions').select('tenant_id, plan, status, requested_plan, trial_ends_at'),
  ])

  const subByTenant = new Map<string, { plan: string; status: string; requested_plan: string | null; trial_ends_at: string | null }>()
  for (const s of (subRows ?? []) as { tenant_id: string; plan: string; status: string; requested_plan: string | null; trial_ends_at: string | null }[]) {
    subByTenant.set(s.tenant_id, s)
  }

  // Gasto de IA del mes en curso por tenant.
  const usedByTenant = new Map<string, number>()
  for (const u of (usageRows ?? []) as { tenant_id: string | null; cost_usd: number | string }[]) {
    if (!u.tenant_id) continue
    usedByTenant.set(u.tenant_id, (usedByTenant.get(u.tenant_id) ?? 0) + Number(u.cost_usd))
  }

  // tenant_id → owner auth user id (one owner per tenant by current rule)
  const ownerByTenant = new Map<string, string>()
  for (const o of (ownerRows ?? []) as { id: string; tenant_id: string | null }[]) {
    if (o.tenant_id) ownerByTenant.set(o.tenant_id, o.id)
  }

  const result: TenantWithOwner[] = []
  for (const t of (tenantRows ?? []) as {
    id: string; name: string; slug: string; primary_color: string | null; logo_url: string | null
    ai_monthly_limit_usd: number | string | null; ai_unlimited: boolean | null
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
      aiMonthlyLimitUsd:  Number(t.ai_monthly_limit_usd ?? 10),
      aiUnlimited:        t.ai_unlimited ?? false,
      aiUsedThisMonthUsd: Math.round((usedByTenant.get(t.id) ?? 0) * 1_000_000) / 1_000_000,
      subscriptionPlan:          subByTenant.get(t.id)?.plan ?? null,
      subscriptionStatus:        subByTenant.get(t.id)?.status ?? null,
      subscriptionRequestedPlan: subByTenant.get(t.id)?.requested_plan ?? null,
      subscriptionTrialEndsAt:   subByTenant.get(t.id)?.trial_ends_at ?? null,
    })
  }

  return result
}
