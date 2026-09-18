import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { toPropertyEmbeds, type PropertyEmbed } from '@/lib/services/property-embeds'

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
  // Contenido multi-idioma (máx 3, migración 063). descriptions/featuresI18n
  // keyed por código de idioma; es/en arriba son el mirror para la web externa.
  contentLanguages:    string[]
  descriptions:        Record<string, string>
  featuresI18n:        Record<string, string[]>
  imageUrl:            string | null
  gallery:             string[]
  floorPlans:          string[]
  detailPdfUrl:        string | null
  // Embeds de terceros (migración 113). Se revalidan al leer: la lista blanca
  // vive en el código, así que una url guardada ayer puede dejar de valer hoy.
  webEmbeds:           PropertyEmbed[]
  publishedToWeb:      boolean
  createdAt:           string
  updatedAt:           string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any, tenantName: string | null, agentName: string | null): Property {
  return {
    id:                 r.id as string,
    tenantId:           r.tenant_id as string,
    tenantName,
    createdByAgentId:   r.created_by_agent_id ?? null,
    createdByAgentName: agentName,
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
    contentLanguages:   Array.isArray(r.content_languages) ? (r.content_languages as string[]) : [],
    descriptions:       (r.descriptions && typeof r.descriptions === 'object') ? (r.descriptions as Record<string, string>) : {},
    featuresI18n:       (r.features_i18n && typeof r.features_i18n === 'object') ? (r.features_i18n as Record<string, string[]>) : {},
    imageUrl:           r.image_url ?? null,
    gallery:            Array.isArray(r.gallery) ? (r.gallery as string[]) : [],
    floorPlans:         Array.isArray(r.floor_plans) ? (r.floor_plans as string[]) : [],
    detailPdfUrl:       r.detail_pdf_url ?? null,
    webEmbeds:          toPropertyEmbeds(r.web_embeds),
    publishedToWeb:     r.published_to_web === true,
    createdAt:          r.created_at as string,
    updatedAt:          r.updated_at as string,
  }
}

// El nombre del agente creador y el del tenant (super_admin) vienen embebidos
// por FK en el mismo viaje: antes eran una o dos consultas más, en serie,
// después de la lista, en cada carga de /properties y del detalle.
const PROPERTY_SELECT = '*, agents(name), tenants(name)'

function embeddedName(rel: unknown): string | null {
  const r = Array.isArray(rel) ? rel[0] : rel
  return (r as { name?: string } | null | undefined)?.name ?? null
}

export async function getProperties(
  tenantId: string | null,
  opts: { status?: PropertyStatus } = {},
): Promise<Property[]> {
  const db = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (db.from('properties') as any).select(PROPERTY_SELECT)
  if (tenantId) q = q.eq('tenant_id', tenantId)
  if (opts.status) q = q.eq('status', opts.status)

  const { data: rows, error } = await q.order('created_at', { ascending: false })
  if (error || !rows) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rows as any[]).map((r: any): Property => mapRow(
    r,
    tenantId ? null : embeddedName(r.tenants),
    r.created_by_agent_id ? embeddedName(r.agents) : null,
  ))
}

/** Una propiedad por id, tenant-scoped (tenantId null = super_admin, sin filtro). */
export async function getPropertyById(id: string, tenantId: string | null): Promise<Property | null> {
  const db = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (db.from('properties') as any).select(PROPERTY_SELECT).eq('id', id)
  if (tenantId) q = q.eq('tenant_id', tenantId)
  const { data: row } = await q.maybeSingle()
  if (!row) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = row as any
  return mapRow(r, null, r.created_by_agent_id ? embeddedName(r.agents) : null)
}
