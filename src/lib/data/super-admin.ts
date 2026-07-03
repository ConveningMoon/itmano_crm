import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantsWithOwners, type TenantWithOwner } from './tenants'

// Agregados cross-tenant para el centro de control. Solo se consume desde la
// página del hub (super_admin) — usa el admin client (service_role).

export interface PlatformKpis {
  tenants: number
  totalLeads: number
  hotLeads: number
  newLeads30d: number
}

export interface TenantOverview extends TenantWithOwner {
  totalLeads: number
  hotLeads: number
  newLeads30d: number
  // max(created_at) de lead_events del tenant, o null si nunca hubo actividad
  lastActivityAt: string | null
}

/**
 * Datos del centro de control: KPIs de plataforma + overview por tenant.
 *
 * Un solo fetch de leads agregado en memoria (mismo criterio de "caliente" que
 * el dashboard: status 'hot' o temperatura >= 70). Volumen actual ~cientos de
 * filas — trivial. TODO: migrar a una RPC agregada cuando leads > ~5k.
 */
export async function getHubData(): Promise<{ kpis: PlatformKpis; tenants: TenantOverview[] }> {
  const supabase = createAdminClient()
  const cutoff30d = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()

  const [tenantRows, { data: leadRows }] = await Promise.all([
    getTenantsWithOwners(),
    supabase.from('leads').select('tenant_id, status, temperature_score, created_at'),
  ])

  interface Agg { total: number; hot: number; new30d: number }
  const byTenant = new Map<string, Agg>()
  for (const l of (leadRows ?? []) as {
    tenant_id: string; status: string; temperature_score: number | null; created_at: string
  }[]) {
    const agg = byTenant.get(l.tenant_id) ?? { total: 0, hot: 0, new30d: 0 }
    agg.total += 1
    if (l.status === 'hot' || (l.temperature_score ?? 0) >= 70) agg.hot += 1
    if (l.created_at >= cutoff30d) agg.new30d += 1
    byTenant.set(l.tenant_id, agg)
  }

  // Última actividad por tenant — una query limit 1 por tenant, acotado por el
  // número de tenants (2-5 hoy), mismo trade-off que getTenantsWithOwners.
  const lastActivity = await Promise.all(
    tenantRows.map(async t => {
      const { data } = await supabase
        .from('lead_events')
        .select('created_at')
        .eq('tenant_id', t.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return (data?.created_at as string | undefined) ?? null
    }),
  )

  const tenants: TenantOverview[] = tenantRows.map((t, i) => {
    const agg = byTenant.get(t.id) ?? { total: 0, hot: 0, new30d: 0 }
    return {
      ...t,
      totalLeads: agg.total,
      hotLeads: agg.hot,
      newLeads30d: agg.new30d,
      lastActivityAt: lastActivity[i],
    }
  })

  const kpis: PlatformKpis = {
    tenants: tenants.length,
    totalLeads: tenants.reduce((s, t) => s + t.totalLeads, 0),
    hotLeads: tenants.reduce((s, t) => s + t.hotLeads, 0),
    newLeads30d: tenants.reduce((s, t) => s + t.newLeads30d, 0),
  }

  return { kpis, tenants }
}
