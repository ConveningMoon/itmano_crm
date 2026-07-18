import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// Datos públicos del catálogo de propiedades alojado
// (properties.itmano.com/<tenant-slug> → rewrite a /web/...). Se seleccionan
// SOLO las columnas públicas (mismo contrato que la política anon de 045/047)
// aunque el server use el admin client — nunca notes/mls/created_by.

export type PublicTenant = {
  id: string; name: string; slug: string; logo_url: string | null; primary_color: string | null
}

export type PublicProperty = {
  id: string
  name: string | null
  slug: string | null
  address: string
  city: string | null
  neighborhood: string | null
  state: string | null
  property_type: string
  list_price: number | null
  bedrooms: number | null
  bathrooms_full: number | null
  bathrooms_half: number | null
  garage_spaces: number | null
  sqft: number | null
  lot_sqft: number | null
  year_built: number | null
  status: string
  description_es: string | null
  description_en: string | null
  features_es: string[] | null
  features_en: string[] | null
  image_url: string | null
  gallery: string[] | null
  floor_plans: string[] | null
  detail_pdf_url: string | null
}

export const PUBLIC_PROPERTY_COLS = [
  'id', 'name', 'slug', 'address', 'city', 'neighborhood', 'state', 'property_type',
  'list_price', 'bedrooms', 'bathrooms_full', 'bathrooms_half', 'garage_spaces',
  'sqft', 'lot_sqft', 'year_built', 'status', 'description_es', 'description_en',
  'features_es', 'features_en', 'image_url', 'gallery', 'floor_plans', 'detail_pdf_url',
].join(', ')

export async function getPublicTenant(tenantSlug: string): Promise<PublicTenant | null> {
  const db = createAdminClient()
  const { data } = await db
    .from('tenants')
    .select('id, name, slug, logo_url, primary_color')
    .eq('slug', tenantSlug)
    .maybeSingle()
  return (data as PublicTenant | null) ?? null
}

export async function getPublishedProperties(tenantId: string): Promise<PublicProperty[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('properties')
    .select(PUBLIC_PROPERTY_COLS)
    .eq('tenant_id', tenantId)
    .eq('published_to_web', true)
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as PublicProperty[]
}

export async function getPublishedProperty(tenantId: string, slug: string): Promise<PublicProperty | null> {
  const db = createAdminClient()
  const { data } = await db
    .from('properties')
    .select(PUBLIC_PROPERTY_COLS)
    .eq('tenant_id', tenantId)
    .eq('published_to_web', true)
    .eq('slug', slug)
    .maybeSingle()
  return (data as unknown as PublicProperty | null) ?? null
}

export function formatPrice(price: number | null): string {
  if (price === null || price === undefined) return 'Consultar'
  return `$${Number(price).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export function bathroomsLabel(full: number | null, half: number | null): string {
  const f = full ?? 0
  const h = half ?? 0
  return h > 0 ? `${f} + ${h} medio${h === 1 ? '' : 's'}` : String(f)
}
