import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import type { StudioBrand, StudioImage } from '@/lib/studio/types'

// Lecturas del Estudio. Las páginas llaman a estas funciones, nunca a Supabase
// directo. Todas las listas de columnas pasan por columns(): un nombre que no
// exista es error de tsc señalando el literal, no un 500 en producción.

export const STUDIO_BUCKET = 'studio-images'

const IMAGE_COLUMNS = columns('studio_images', [
  'id', 'tenant_id', 'agent_id', 'recipe', 'property_id', 'form_json', 'source_mode',
  'style', 'palette', 'aspect', 'reference_path', 'reference_paths', 'reference_role', 'scene_prompt',
  'text_zone', 'background_path', 'rendered_path', 'status', 'error_message',
  'cost_usd', 'created_at', 'template_snapshot',
])

const PROPERTY_COLUMNS = columns('properties', [
  'id', 'address', 'city', 'state', 'list_price', 'bedrooms', 'bathrooms', 'sqft',
  'image_url', 'gallery', 'status', 'created_at',
])

const AGENT_COLUMNS = columns('agents', ['id', 'name', 'phone', 'active', 'cover_photo_url', 'cover_photo_cutout'])

export interface PropertyOption {
  id:         string
  address:    string
  city:       string | null
  state:      string | null
  list_price: number | null
  bedrooms:   number | null
  bathrooms:  number | null
  sqft:       number | null
  photos:     string[]
}

export interface AgentOption {
  id:    string
  name:  string
  phone: string | null
  // La portada la usan los templates que tienen slot para ella. `cutout` dice si
  // el archivo traía transparencia real: con ella se usa recortada, sin ella el
  // compositor la mete en un círculo.
  cover_photo_url:    string | null
  cover_photo_cutout: boolean
}

/** Resuelve la URL pública de un path del bucket del Estudio. Compartida con studio-templates.ts. */
export function publicUrl(path: string | null): string | null {
  if (!path) return null
  return createAdminClient().storage.from(STUDIO_BUCKET).getPublicUrl(path).data.publicUrl
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- reason: el cliente de Supabase no está tipado en este repo; la lista de columnas ya se valida con columns()
function toImage(r: any): StudioImage {
  return {
    id: r.id, tenant_id: r.tenant_id, agent_id: r.agent_id ?? null, recipe: r.recipe,
    property_id: r.property_id ?? null, form_json: r.form_json ?? {}, source_mode: r.source_mode,
    style: r.style, palette: r.palette ?? null, aspect: r.aspect,
    reference_path: r.reference_path ?? null,
    // Las filas viejas no tienen el array: su única referencia es la columna
    // singular, y así el resto del código no necesita saber cuál de las dos usar.
    reference_paths: r.reference_paths ?? (r.reference_path ? [r.reference_path] : []),
    reference_role: r.reference_role ?? null,
    scene_prompt: r.scene_prompt ?? null, text_zone: r.text_zone ?? null,
    background_path: r.background_path ?? null, rendered_path: r.rendered_path ?? null,
    rendered_url: publicUrl(r.rendered_path ?? null),
    status: r.status, error_message: r.error_message ?? null,
    cost_usd: Number(r.cost_usd ?? 0), created_at: r.created_at,
    template_snapshot: r.template_snapshot ?? null,
  }
}

export async function getStudioImages(tenantId: string, limit = 40): Promise<StudioImage[]> {
  const { data } = await createAdminClient()
    .from('studio_images').select(IMAGE_COLUMNS)
    .eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(limit)
  return (data ?? []).map(toImage)
}

export async function getStudioImage(id: string): Promise<StudioImage | null> {
  const { data } = await createAdminClient()
    .from('studio_images').select(IMAGE_COLUMNS).eq('id', id).maybeSingle()
  return data ? toImage(data) : null
}

/** Propiedades del tenant para el selector, con sus fotos ya normalizadas. */
export async function getPropertyOptions(tenantId: string): Promise<PropertyOption[]> {
  const { data } = await createAdminClient()
    .from('properties').select(PROPERTY_COLUMNS)
    .eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(200)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reason: ídem toImage
  return ((data ?? []) as any[]).map((p) => ({
    id: p.id,
    address: p.address,
    city: p.city ?? null,
    state: p.state ?? null,
    list_price: p.list_price === null || p.list_price === undefined ? null : Number(p.list_price),
    bedrooms: p.bedrooms ?? null,
    bathrooms: p.bathrooms === null || p.bathrooms === undefined ? null : Number(p.bathrooms),
    sqft: p.sqft ?? null,
    photos: [p.image_url, ...(p.gallery ?? [])].filter((u: unknown): u is string => typeof u === 'string' && u.length > 0),
  }))
}

export async function getAgentOptions(tenantId: string): Promise<AgentOption[]> {
  const { data } = await createAdminClient()
    .from('agents').select(AGENT_COLUMNS)
    .eq('tenant_id', tenantId).eq('active', true).order('name')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reason: ídem toImage
  return ((data ?? []) as any[]).map((a) => ({
    id: a.id,
    name: a.name,
    phone: a.phone ?? null,
    cover_photo_url: a.cover_photo_url ?? null,
    cover_photo_cutout: a.cover_photo_cutout === true,
  }))
}

/** La marca con la que se compone. Sale de la base, nunca del código. */
export async function getStudioBrand(tenantId: string, agentId: string | null): Promise<StudioBrand> {
  const db = createAdminClient()
  const [{ data: tenant }, { data: agent }] = await Promise.all([
    db.from('tenants').select(columns('tenants', ['name', 'logo_url', 'primary_color'])).eq('id', tenantId).maybeSingle(),
    agentId
      ? db.from('agents').select(columns('agents', ['name', 'phone'])).eq('id', agentId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reason: ídem toImage
  const t = tenant as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reason: ídem toImage
  const a = agent as any
  return {
    tenant_name:   t?.name ?? '',
    logo_url:      t?.logo_url ?? null,
    primary_color: t?.primary_color ?? '#1B2A41',
    agent_name:    a?.name ?? null,
    agent_phone:   a?.phone ?? null,
  }
}
