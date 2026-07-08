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
  // ── Web listing fields (migration 045) ──────────────────────────────────────
  name:                string | null
  slug:                string | null
  neighborhood:        string | null
  state:               string | null
  bathroomsFull:       number | null
  bathroomsHalf:       number | null
  garageSpaces:        number | null
  lotSqft:             number | null
  descriptionEn:       string | null
  descriptionEs:       string | null
  featuresEn:          string[]
  featuresEs:          string[]
  imageUrl:            string | null
  gallery:             string[]
  floorPlans:          string[]
  detailPdfUrl:        string | null
  publishedToWeb:      boolean
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
    name:               r.name ?? null,
    slug:               r.slug ?? null,
    neighborhood:       r.neighborhood ?? null,
    state:              r.state ?? null,
    bathroomsFull:      r.bathrooms_full !== null && r.bathrooms_full !== undefined ? Number(r.bathrooms_full) : null,
    bathroomsHalf:      r.bathrooms_half !== null && r.bathrooms_half !== undefined ? Number(r.bathrooms_half) : null,
    garageSpaces:       r.garage_spaces !== null && r.garage_spaces !== undefined ? Number(r.garage_spaces) : null,
    lotSqft:            r.lot_sqft !== null && r.lot_sqft !== undefined ? Number(r.lot_sqft) : null,
    descriptionEn:      r.description_en ?? null,
    descriptionEs:      r.description_es ?? null,
    featuresEn:         Array.isArray(r.features_en) ? (r.features_en as string[]) : [],
    featuresEs:         Array.isArray(r.features_es) ? (r.features_es as string[]) : [],
    imageUrl:           r.image_url ?? null,
    gallery:            Array.isArray(r.gallery) ? (r.gallery as string[]) : [],
    floorPlans:         Array.isArray(r.floor_plans) ? (r.floor_plans as string[]) : [],
    detailPdfUrl:       r.detail_pdf_url ?? null,
    publishedToWeb:     r.published_to_web === true,
    createdAt:          r.created_at as string,
    updatedAt:          r.updated_at as string,
  }))
}
