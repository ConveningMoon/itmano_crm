'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { assertCanWriteProperty, resolveTargetTenant } from '@/lib/auth/guards'
import { MEDIA_BUCKET, sanitizeSlugFolder, objectPathFromPublicUrl } from '@/lib/services/property-media'

// http(s)-only URL, empty string tolerated (normalized to null before insert).
const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine(
    (u) => u === '' || /^https?:\/\//i.test(u),
    'La URL debe comenzar con http:// o https://',
  )

// kebab-case: lowercase alphanumerics separated by single hyphens.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const PropertySchema = z
  .object({
    // ── Internal / core ────────────────────────────────────────────────────────
    address:       z.string().trim().min(1, 'La dirección es obligatoria').max(300),
    city:          z.string().trim().max(100).optional().nullable(),
    mls_number:    z.string().trim().max(50).optional().nullable(),
    property_type: z.enum(['residential', 'condo', 'townhouse', 'land', 'commercial', 'multifamily']),
    list_price:    z.number().nonnegative().optional().nullable(),
    bedrooms:      z.number().int().nonnegative().max(50).optional().nullable(),
    sqft:          z.number().int().nonnegative().max(1000000).optional().nullable(),
    year_built:    z.number().int().optional().nullable(),
    status:        z.enum(['available', 'in_process', 'sold']).default('available'),
    external_url:  httpUrl.optional().nullable(),
    notes:         z.string().trim().max(2000).optional().nullable(),
    tenant_id:     z.string().optional(), // super_admin picks tenant

    // ── Web listing (migration 045) ─────────────────────────────────────────────
    name:           z.string().trim().max(200).optional().nullable(),
    slug:           z
      .string()
      .trim()
      .max(120)
      .refine((s) => s === '' || SLUG_RE.test(s), 'Slug inválido: usa minúsculas, números y guiones')
      .optional()
      .nullable(),
    neighborhood:   z.string().trim().max(200).optional().nullable(),
    state:          z.string().trim().max(100).optional().nullable(),
    bathrooms_full: z.number().int().nonnegative().max(50).optional().nullable(),
    bathrooms_half: z.number().int().nonnegative().max(10).optional().nullable(),
    garage_spaces:  z.number().int().nonnegative().max(50).optional().nullable(),
    lot_sqft:       z.number().int().nonnegative().max(100000000).optional().nullable(),
    description_en: z.string().trim().max(5000).optional().nullable(),
    description_es: z.string().trim().max(5000).optional().nullable(),
    features_en:    z.array(z.string().trim().min(1).max(300)).max(30).optional().default([]),
    features_es:    z.array(z.string().trim().min(1).max(300)).max(30).optional().default([]),
    image_url:      httpUrl.optional().nullable(),
    gallery:        z.array(httpUrl.min(1)).max(60).optional().default([]),
    floor_plans:    z.array(httpUrl.min(1)).max(30).optional().default([]),
    detail_pdf_url: httpUrl.optional().nullable(),
    published_to_web: z.boolean().optional().default(false),
  })
  .superRefine((data, ctx) => {
    // Web-required fields are only mandatory when the property is published.
    if (!data.published_to_web) return
    const requireField = (field: string, value: unknown, message: string) => {
      if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [field] })
      }
    }
    requireField('name', data.name, 'El nombre es obligatorio para publicar en la web')
    requireField('slug', data.slug, 'El slug es obligatorio para publicar en la web')
    requireField('neighborhood', data.neighborhood, 'El vecindario es obligatorio para publicar en la web')
    requireField('state', data.state, 'El estado es obligatorio para publicar en la web')
    requireField('description_en', data.description_en, 'La descripción en inglés es obligatoria para publicar')
    requireField('description_es', data.description_es, 'La descripción en español es obligatoria para publicar')
    requireField('image_url', data.image_url, 'La imagen de portada es obligatoria para publicar')
  })

export type PropertyInput = z.infer<typeof PropertySchema>

// Maps validated input → the shared property column set (everything except
// tenant_id and authorship, which the create path sets separately). Empty
// strings collapse to null; bathrooms is derived from the full/half split so the
// legacy numeric column stays coherent (full + 0.5 × half).
type ParsedProperty = z.infer<typeof PropertySchema>
function toColumns(data: ParsedProperty) {
  const nz = (v: string | null | undefined) => {
    const t = (v ?? '').trim()
    return t === '' ? null : t
  }
  const full = data.bathrooms_full ?? null
  const half = data.bathrooms_half ?? null
  const bathrooms =
    full === null && half === null ? null : (full ?? 0) + 0.5 * (half ?? 0)

  return {
    address:          data.address,
    city:             nz(data.city),
    mls_number:       nz(data.mls_number),
    property_type:    data.property_type,
    list_price:       data.list_price ?? null,
    bedrooms:         data.bedrooms ?? null,
    bathrooms,
    sqft:             data.sqft ?? null,
    year_built:       data.year_built ?? null,
    status:           data.status,
    external_url:     nz(data.external_url),
    notes:            nz(data.notes),
    // Web listing
    name:             nz(data.name),
    slug:             nz(data.slug),
    neighborhood:     nz(data.neighborhood),
    state:            nz(data.state),
    bathrooms_full:   full,
    bathrooms_half:   half,
    garage_spaces:    data.garage_spaces ?? null,
    lot_sqft:         data.lot_sqft ?? null,
    description_en:   nz(data.description_en),
    description_es:   nz(data.description_es),
    features_en:      data.features_en ?? [],
    features_es:      data.features_es ?? [],
    image_url:        nz(data.image_url),
    gallery:          data.gallery ?? [],
    floor_plans:      data.floor_plans ?? [],
    detail_pdf_url:   nz(data.detail_pdf_url),
    published_to_web: data.published_to_web ?? false,
  }
}

export async function createProperty(
  input: PropertyInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()

  const parsed = PropertySchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const targetTenant = resolveTargetTenant(ctx, parsed.data.tenant_id)
  if (typeof targetTenant !== 'string') return { ok: false, error: targetTenant.error }

  const db = createAdminClient()

  // Resolve authorship: agent → their agent record; owner → look up linked agent
  // record by user_id (e.g. Adriana is both login user and agent-adriana);
  // super_admin → no individual author.
  let created_by_agent_id: string | null = null
  let created_by_user_id: string | null = null

  if (ctx.role === 'agent') {
    created_by_agent_id = ctx.agent_id
    created_by_user_id  = ctx.user_id
  } else if (ctx.role === 'agent_owner') {
    created_by_user_id = ctx.user_id
    const { data: linked } = await db
      .from('agents')
      .select('id')
      .eq('user_id', ctx.user_id)
      .eq('tenant_id', targetTenant)
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    created_by_agent_id = (linked as any)?.id ?? null
  }
  // super_admin: both remain null

  const { data, error } = await db
    .from('properties')
    .insert({
      tenant_id:          targetTenant,
      created_by_agent_id,
      created_by_user_id,
      ...toColumns(parsed.data),
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: slugError(error.message) }

  revalidatePath('/properties')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ok: true, id: (data as any).id as string }
}

export async function updateProperty(
  id: string,
  input: PropertyInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()

  const parsed = PropertySchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const db = createAdminClient()

  const { data: existing } = await db
    .from('properties')
    .select('tenant_id, created_by_user_id')
    .eq('id', id)
    .maybeSingle()

  if (!existing) return { ok: false, error: 'Propiedad no encontrada' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingRow = existing as any
  const denial = assertCanWriteProperty(ctx, {
    tenant_id:          existingRow.tenant_id as string,
    created_by_user_id: existingRow.created_by_user_id ?? null,
  })
  if (denial) return denial

  const { error } = await db
    .from('properties')
    .update({
      ...toColumns(parsed.data),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return { ok: false, error: slugError(error.message) }

  revalidatePath('/properties')
  return { ok: true }
}

export async function deleteProperty(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  const db = createAdminClient()

  const { data: existing } = await db
    .from('properties')
    .select('tenant_id, created_by_user_id, slug, image_url, gallery, floor_plans, detail_pdf_url')
    .eq('id', id)
    .maybeSingle()

  if (!existing) return { ok: false, error: 'Propiedad no encontrada' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingRow = existing as any
  const denial = assertCanWriteProperty(ctx, {
    tenant_id:          existingRow.tenant_id as string,
    created_by_user_id: existingRow.created_by_user_id ?? null,
  })
  if (denial) return denial

  const { error } = await db.from('properties').delete().eq('id', id)

  if (error) return { ok: false, error: error.message }

  // Best-effort: remove the property's images/PDF and its slug folder from Storage.
  await removePropertyMedia(
    db,
    existingRow.tenant_id as string,
    existingRow.slug as string | null,
    [
      existingRow.image_url,
      ...((existingRow.gallery ?? []) as unknown[]),
      ...((existingRow.floor_plans ?? []) as unknown[]),
      existingRow.detail_pdf_url,
    ],
  )

  revalidatePath('/properties')
  return { ok: true }
}

// Translates the (tenant_id, slug) unique-index violation into a friendly
// message; passes any other DB error through unchanged.
function slugError(message: string): string {
  if (/properties_tenant_slug_key|duplicate key/i.test(message)) {
    return 'Ya existe otra propiedad con ese slug. Usa uno distinto.'
  }
  return message
}

// ── Media ─────────────────────────────────────────────────────────────────────
// Upload lives in a Route Handler (src/app/api/properties/media/route.ts), not a
// Server Action — see that file for why. Constants/helpers shared with it live in
// src/lib/services/property-media.ts.

// Removes every stored file a property references, plus anything left in its
// slug folder. Best-effort — failures are logged, never thrown.
async function removePropertyMedia(
  db: ReturnType<typeof createAdminClient>,
  tenantId: string,
  slug: string | null | undefined,
  urls: unknown[],
): Promise<void> {
  const bucket = db.storage.from(MEDIA_BUCKET)
  const paths = new Set<string>()

  // Referenced files (robust to slug renames / legacy paths).
  for (const url of urls) {
    const p = objectPathFromPublicUrl(url)
    if (p) paths.add(p)
  }

  // Everything still sitting in the property's slug folder.
  const folder = sanitizeSlugFolder(slug)
  if (folder) {
    const prefix = `${tenantId}/${folder}`
    const { data: list } = await bucket.list(prefix, { limit: 1000 })
    for (const obj of list ?? []) paths.add(`${prefix}/${obj.name}`)
  }

  if (paths.size === 0) return
  const { error } = await bucket.remove([...paths])
  if (error) {
    console.error(JSON.stringify({ service: 'delete-property-media', tenant_id: tenantId, error: error.message }))
  }
}

// Deletes specific media objects by their public URLs. Used to reconcile
// Storage when the form is saved (removed files) or discarded (files uploaded
// during the session but never persisted). Scoped to the caller's tenant folder
// so a user can only delete media within their own tenant. Best-effort.
export async function deletePropertyMediaByUrls(
  urls: string[],
  tenantId?: string,
): Promise<{ ok: true }> {
  const ctx = await getCurrentTenantContext()
  const resolved = resolveTargetTenant(ctx, tenantId)
  const tenantFolder = typeof resolved === 'string' ? resolved : null
  if (!tenantFolder) return { ok: true }

  const paths: string[] = []
  for (const url of urls) {
    const p = objectPathFromPublicUrl(url)
    // Security: only allow deleting within the caller's tenant folder.
    if (p && p.startsWith(`${tenantFolder}/`)) paths.push(p)
  }
  if (paths.length === 0) return { ok: true }

  const db = createAdminClient()
  const { error } = await db.storage.from(MEDIA_BUCKET).remove(paths)
  if (error) {
    console.error(JSON.stringify({ service: 'delete-property-media-urls', tenant_id: tenantFolder, error: error.message }))
  }
  return { ok: true }
}
