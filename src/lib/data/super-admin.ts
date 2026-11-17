import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { getTenantsWithOwners, type TenantWithOwner } from './tenants'

const BAND_COLUMNS = columns('tenant_quality_bands', ['computed_at'])

/**
 * Las bandas de calidad se recalculan una vez al día desde el cron
 * `/api/cron/score-decay`. Si el cron deja de correr (pasó entre agosto y
 * noviembre de 2026: la ruta respondía 405 a Vercel Cron) nadie lo nota: los
 * leads simplemente dejan de subir de banda. Con más de 36 h de antigüedad el
 * Centro de control lo avisa.
 */
export const SCORING_STALE_HOURS = 36

export function isScoringStale(oldestComputedAt: string | null, now = Date.now()): boolean {
  if (!oldestComputedAt) return false
  const t = Date.parse(oldestComputedAt)
  if (Number.isNaN(t)) return false
  return now - t > SCORING_STALE_HOURS * 3_600_000
}

// Agregados cross-tenant para el centro de control. Solo se consume desde la
// página del hub (super_admin) — usa el admin client (service_role).

export interface PlatformKpis {
  tenants: number
  totalLeads: number
  highQualityLeads: number
  newLeads30d: number
}

export interface TenantOverview extends TenantWithOwner {
  totalLeads: number
  highQualityLeads: number
  newLeads30d: number
  // max(created_at) de lead_events del tenant, o null si nunca hubo actividad
  lastActivityAt: string | null
}

// Fila que devuelve tenant_hub_stats por cada tenant con datos.
interface HubAgg {
  total:            number
  high_quality:     number
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
 * "Calidad alta" = la banda del modelo, el mismo criterio que el dashboard y
 * /analytics. Antes contaba status 'hot', una banda que ya no existe.
 */
export async function getHubData(): Promise<{
  kpis: PlatformKpis
  tenants: TenantOverview[]
  /** computed_at de las bandas más antiguas, si superan SCORING_STALE_HOURS. */
  scoringStaleSince: string | null
}> {
  const supabase = createAdminClient()

  const [tenantRows, { data: statsRaw }, { data: oldestBand }] = await Promise.all([
    getTenantsWithOwners(),
    supabase.rpc('tenant_hub_stats', { p_days: VENTANA_DIAS }),
    supabase
      .from('tenant_quality_bands')
      .select(BAND_COLUMNS)
      .order('computed_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  const oldestComputedAt = (oldestBand as { computed_at: string } | null)?.computed_at ?? null
  const scoringStaleSince = isScoringStale(oldestComputedAt) ? oldestComputedAt : null

  // La RPC solo devuelve tenants CON leads o CON actividad; los recién creados
  // no aparecen y caen al cero de abajo, igual que con el conteo en memoria.
  const byTenant = (statsRaw ?? {}) as Record<string, HubAgg | undefined>

  const tenants: TenantOverview[] = tenantRows.map(t => {
    const agg = byTenant[t.id]
    return {
      ...t,
      totalLeads:     agg?.total  ?? 0,
      highQualityLeads: agg?.high_quality ?? 0,
      newLeads30d:    agg?.new30d ?? 0,
      lastActivityAt: agg?.last_activity_at ?? null,
    }
  })

  const kpis: PlatformKpis = {
    tenants: tenants.length,
    totalLeads: tenants.reduce((s, t) => s + t.totalLeads, 0),
    highQualityLeads: tenants.reduce((s, t) => s + t.highQualityLeads, 0),
    newLeads30d: tenants.reduce((s, t) => s + t.newLeads30d, 0),
  }

  return { kpis, tenants, scoringStaleSince }
}
