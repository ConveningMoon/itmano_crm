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

// Fila que devuelve tenant_hub_stats por cada tenant con datos.
interface HubAgg {
  total:            number
  hot:              number
  new30d:           number
  last_activity_at: string | null
}

const VENTANA_DIAS = 30

/**
 * Datos del centro de control: KPIs de plataforma + overview por tenant.
 *
 * Los agregados los calcula Postgres (`tenant_hub_stats`, migración 075). Antes
 * esta función traía la tabla `leads` ENTERA de todos los tenants para contarla
 * en memoria, más una query de última actividad por tenant: con veinte clientes
 * de a miles de leads, cada carga del hub habría arrastrado todo por la red.
 *
 * "Caliente" = status 'hot', el mismo criterio que el dashboard, /analytics y la
 * banda del pipeline.
 */
export async function getHubData(): Promise<{ kpis: PlatformKpis; tenants: TenantOverview[] }> {
  const supabase = createAdminClient()

  const [tenantRows, { data: statsRaw }] = await Promise.all([
    getTenantsWithOwners(),
    supabase.rpc('tenant_hub_stats', { p_days: VENTANA_DIAS }),
  ])

  // La RPC solo devuelve tenants CON leads o CON actividad; los recién creados
  // no aparecen y caen al cero de abajo, igual que con el conteo en memoria.
  const byTenant = (statsRaw ?? {}) as Record<string, HubAgg | undefined>

  const tenants: TenantOverview[] = tenantRows.map(t => {
    const agg = byTenant[t.id]
    return {
      ...t,
      totalLeads:     agg?.total  ?? 0,
      hotLeads:       agg?.hot    ?? 0,
      newLeads30d:    agg?.new30d ?? 0,
      lastActivityAt: agg?.last_activity_at ?? null,
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
