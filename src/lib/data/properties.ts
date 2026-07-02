import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export type PropertyType =
  | 'residential'
  | 'condo'
  | 'townhouse'
  | 'land'
  | 'commercial'
  | 'multifamily'

export type PropertyStatus = 'available' | 'in_process' | 'sold'

export interface Property {
  id:                  string
  tenantId:            string
  tenantName:          string | null  // resolved for super_admin; null otherwise
  createdByAgentId:    string | null
  createdByAgentName:  string | null  // resolved from agents join
  createdByUserId:     string | null
  address:             string
  city:                string | null
  mlsNumber:           string | null
  propertyType:        PropertyType
  listPrice:           number | null
  bedrooms:            number | null
  bathrooms:           number | null
  sqft:                number | null
  yearBuilt:           number | null
  status:              PropertyStatus
  externalUrl:         string | null
  notes:               string | null
  createdAt:           string
  updatedAt:           string
}

export async function getProperties(
  tenantId: string | null,
  opts: { status?: PropertyStatus } = {},
): Promise<Property[]> {
  const db = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (db.from('properties') as any).select('*')
  if (tenantId) q = q.eq('tenant_id', tenantId)
  if (opts.status) q = q.eq('status', opts.status)

  const { data: rows, error } = await q.order('created_at', { ascending: false })
  if (error || !rows) return []

  // Batch-resolve agent names
  const agentIds = [...new Set<string>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (rows as any[]).map((r: any) => r.created_by_agent_id).filter(Boolean)
  )]
  const agentMap = new Map<string, string>()
  if (agentIds.length > 0) {
    const { data: agents } = await db
      .from('agents')
      .select('id, name')
      .in('id', agentIds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of (agents ?? []) as any[]) agentMap.set(a.id as string, a.name as string)
  }

  // Batch-resolve tenant names (super_admin only — tenantId is null)
  const tenantMap = new Map<string, string>()
  if (!tenantId && (rows as unknown[]).length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tids = [...new Set<string>((rows as any[]).map((r: any) => r.tenant_id as string))]
    const { data: tenants } = await db
      .from('tenants')
      .select('id, name')
      .in('id', tids)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of (tenants ?? []) as any[]) tenantMap.set(t.id as string, t.name as string)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rows as any[]).map((r: any): Property => ({
    id:                 r.id as string,
    tenantId:           r.tenant_id as string,
    tenantName:         tenantMap.get(r.tenant_id as string) ?? null,
    createdByAgentId:   r.created_by_agent_id ?? null,
    createdByAgentName: agentMap.get(r.created_by_agent_id as string) ?? null,
    createdByUserId:    r.created_by_user_id ?? null,
    address:            r.address as string,
    city:               r.city ?? null,
    mlsNumber:          r.mls_number ?? null,
    propertyType:       r.property_type as PropertyType,
    listPrice:          r.list_price !== null && r.list_price !== undefined ? Number(r.list_price) : null,
    bedrooms:           r.bedrooms !== null && r.bedrooms !== undefined ? Number(r.bedrooms) : null,
    bathrooms:          r.bathrooms !== null && r.bathrooms !== undefined ? Number(r.bathrooms) : null,
    sqft:               r.sqft !== null && r.sqft !== undefined ? Number(r.sqft) : null,
    yearBuilt:          r.year_built !== null && r.year_built !== undefined ? Number(r.year_built) : null,
    status:             r.status as PropertyStatus,
    externalUrl:        r.external_url ?? null,
    notes:              r.notes ?? null,
    createdAt:          r.created_at as string,
    updatedAt:          r.updated_at as string,
  }))
}
