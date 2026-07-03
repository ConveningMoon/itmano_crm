'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { assertCanWriteProperty, resolveTargetTenant } from '@/lib/auth/guards'

const PropertySchema = z.object({
  address:       z.string().trim().min(1, 'La dirección es obligatoria').max(300),
  city:          z.string().trim().max(100).optional().nullable(),
  mls_number:    z.string().trim().max(50).optional().nullable(),
  property_type: z.enum(['residential', 'condo', 'townhouse', 'land', 'commercial', 'multifamily']),
  list_price:    z.number().nonnegative().optional().nullable(),
  bedrooms:      z.number().int().nonnegative().max(50).optional().nullable(),
  bathrooms:     z.number().nonnegative().max(50).optional().nullable(),
  sqft:          z.number().int().nonnegative().max(100000).optional().nullable(),
  year_built:    z.number().int().min(1800).max(2100).optional().nullable(),
  status:        z.enum(['available', 'in_process', 'sold']).default('available'),
  external_url:  z.string().trim().max(500).optional().nullable(),
  notes:         z.string().trim().max(2000).optional().nullable(),
  tenant_id:     z.string().optional(), // super_admin picks tenant
})

export type PropertyInput = z.infer<typeof PropertySchema>

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
      address:            parsed.data.address,
      city:               parsed.data.city    ?? null,
      mls_number:         parsed.data.mls_number ?? null,
      property_type:      parsed.data.property_type,
      list_price:         parsed.data.list_price  ?? null,
      bedrooms:           parsed.data.bedrooms    ?? null,
      bathrooms:          parsed.data.bathrooms   ?? null,
      sqft:               parsed.data.sqft        ?? null,
      year_built:         parsed.data.year_built  ?? null,
      status:             parsed.data.status,
      external_url:       parsed.data.external_url ?? null,
      notes:              parsed.data.notes        ?? null,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

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
      address:       parsed.data.address,
      city:          parsed.data.city       ?? null,
      mls_number:    parsed.data.mls_number ?? null,
      property_type: parsed.data.property_type,
      list_price:    parsed.data.list_price  ?? null,
      bedrooms:      parsed.data.bedrooms    ?? null,
      bathrooms:     parsed.data.bathrooms   ?? null,
      sqft:          parsed.data.sqft        ?? null,
      year_built:    parsed.data.year_built  ?? null,
      status:        parsed.data.status,
      external_url:  parsed.data.external_url ?? null,
      notes:         parsed.data.notes        ?? null,
      updated_at:    new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

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

  const { error } = await db.from('properties').delete().eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/properties')
  return { ok: true }
}
