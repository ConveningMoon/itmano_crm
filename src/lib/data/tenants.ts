import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'

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

/**
 * id → nombre de todos los tenants, deduplicado por request. Lo piden varias
 * vistas globales del super_admin (notificaciones, actividad, uso de IA) en
 * la misma página: antes cada una hacía su propia lectura de `tenants`.
 */
export const getTenantNames = cache(async function getTenantNames(): Promise<Map<string, string>> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('tenants').select('id, name')
  return new Map(((data ?? []) as { id: string; name: string }[]).map(t => [t.id, t.name]))
})

export interface TenantBranding {
  name:    string
  logoUrl: string | null
}

export interface TenantShellRow {
  name:                 string
  logo_url:             string | null
  ai_monthly_limit_usd: number | string | null
  ai_unlimited:         boolean | null
}

// La fila del tenant que el shell necesita en CADA página: el branding del
// sidebar y el límite de IA del topbar. Antes eran dos lecturas de la misma fila
// por request; una sola, deduplicada con cache(), sirve a ambos.
const TENANT_SHELL_COLUMNS = columns('tenants', ['name', 'logo_url', 'ai_monthly_limit_usd', 'ai_unlimited'])

export const getTenantShellRow = cache(async function getTenantShellRow(
  tenantId: string,
): Promise<TenantShellRow | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('tenants')
    .select(TENANT_SHELL_COLUMNS)
    .eq('id', tenantId)
    .maybeSingle()
  return (data as TenantShellRow | null) ?? null
})

// Branding del tenant activo para el shell (logo del sidebar).
export async function getTenantBranding(tenantId: string): Promise<TenantBranding | null> {
  const t = await getTenantShellRow(tenantId)
  if (!t) return null
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
  // Análisis de fit de leads con IA (fase de prueba, apagado por defecto).
  aiLeadScoringEnabled: boolean
  // ITMANO gestiona las páginas de este tenant (migración 091): sus fuentes y
  // propiedades se muestran como conectadas por ITMANO — también las nuevas — y
  // el dominio de envío deja de configurarse.
  pagesManagedByItmano: boolean
  // Envío de email (migración 065): cuenta Resend + estado del dominio propio.
  resendAccount:   string
  sendingDomain:   string | null
  resendDomainId:  string | null
  domainStatus:    string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  domainRecords:   any[] | null
  // Suscripción (null si el tenant no tiene fila — pre-054).
  subscriptionPlan:          string | null
  subscriptionStatus:        string | null
  subscriptionRequestedPlan: string | null
  subscriptionTrialEndsAt:   string | null
  // Campos de Paddle (migración 070) — billing_cycle/current_period_end/
  // degraded_at son de solo lectura (los escribe el webhook de Paddle);
  // paddle_price_id y billing_exempt los edita el super_admin desde el hub.
  subscriptionBillingCycle:     string | null
  subscriptionCurrentPeriodEnd: string | null
  subscriptionDegradedAt:       string | null
  subscriptionPaddlePriceId:    string | null
  subscriptionBillingExempt:    boolean
}

/**
 * Lists every tenant with its provisioned owner's email (super_admin view).
 *
 * The owner email lives on auth.users (not user_profiles): the RPC
 * tenant_owner_emails joins user_profiles (role = 'agent_owner') with
 * auth.users in one query. It is security definer and executable only by
 * service_role, so this admin-client path is the only one that can call it.
 */
export async function getTenantsWithOwners(): Promise<TenantWithOwner[]> {
  const supabase = createAdminClient()

  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString()

  // El email del owner sale de la RPC tenant_owner_emails (security definer,
  // sólo service_role): una consulta para todos los tenants, en la misma ola.
  // Antes era una llamada al Auth Admin API por tenant, en serie.
  const [{ data: tenantRows }, { data: ownerRows }, { data: usageRows }, { data: subRows }] = await Promise.all([
    supabase.from('tenants').select('id, name, slug, primary_color, logo_url, ai_monthly_limit_usd, ai_unlimited, ai_lead_scoring_enabled, pages_managed_by_itmano, resend_account, sending_domain, resend_domain_id, domain_status, domain_records').order('created_at'),
    supabase.rpc('tenant_owner_emails'),
    supabase.from('ai_usage_events').select('tenant_id, cost_usd').gte('created_at', monthStart),
    supabase.from('subscriptions').select('tenant_id, plan, status, requested_plan, trial_ends_at, billing_cycle, current_period_end, degraded_at, paddle_price_id, billing_exempt'),
  ])

  type SubRow = {
    tenant_id: string; plan: string; status: string; requested_plan: string | null; trial_ends_at: string | null
    billing_cycle: string | null; current_period_end: string | null; degraded_at: string | null
    paddle_price_id: string | null; billing_exempt: boolean | null
  }
  const subByTenant = new Map<string, SubRow>()
  for (const s of (subRows ?? []) as SubRow[]) {
    subByTenant.set(s.tenant_id, s)
  }

  // Gasto de IA del mes en curso por tenant.
  const usedByTenant = new Map<string, number>()
  for (const u of (usageRows ?? []) as { tenant_id: string | null; cost_usd: number | string }[]) {
    if (!u.tenant_id) continue
    usedByTenant.set(u.tenant_id, (usedByTenant.get(u.tenant_id) ?? 0) + Number(u.cost_usd))
  }

  // tenant_id → owner email (one owner per tenant by current rule)
  const ownerEmailByTenant = new Map<string, string>()
  for (const o of (ownerRows ?? []) as { tenant_id: string; email: string | null }[]) {
    if (o.tenant_id && o.email) ownerEmailByTenant.set(o.tenant_id, o.email)
  }

  const result: TenantWithOwner[] = []
  for (const t of (tenantRows ?? []) as {
    id: string; name: string; slug: string; primary_color: string | null; logo_url: string | null
    ai_monthly_limit_usd: number | string | null; ai_unlimited: boolean | null
    ai_lead_scoring_enabled: boolean | null
    pages_managed_by_itmano: boolean | null
    resend_account: string | null; sending_domain: string | null; resend_domain_id: string | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    domain_status: string | null; domain_records: any[] | null
  }[]) {
    const ownerEmail = ownerEmailByTenant.get(t.id) ?? null
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
      aiLeadScoringEnabled: t.ai_lead_scoring_enabled ?? false,
      pagesManagedByItmano: t.pages_managed_by_itmano ?? false,
      resendAccount:  t.resend_account ?? 'itmano',
      sendingDomain:  t.sending_domain ?? null,
      resendDomainId: t.resend_domain_id ?? null,
      domainStatus:   t.domain_status ?? 'not_configured',
      domainRecords:  t.domain_records ?? null,
      subscriptionPlan:          subByTenant.get(t.id)?.plan ?? null,
      subscriptionStatus:        subByTenant.get(t.id)?.status ?? null,
      subscriptionRequestedPlan: subByTenant.get(t.id)?.requested_plan ?? null,
      subscriptionTrialEndsAt:   subByTenant.get(t.id)?.trial_ends_at ?? null,
      subscriptionBillingCycle:     subByTenant.get(t.id)?.billing_cycle ?? null,
      subscriptionCurrentPeriodEnd: subByTenant.get(t.id)?.current_period_end ?? null,
      subscriptionDegradedAt:       subByTenant.get(t.id)?.degraded_at ?? null,
      subscriptionPaddlePriceId:    subByTenant.get(t.id)?.paddle_price_id ?? null,
      subscriptionBillingExempt:    subByTenant.get(t.id)?.billing_exempt ?? false,
    })
  }

  return result
}
