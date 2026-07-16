'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { ADMIN_TENANT_COOKIE } from '@/lib/auth/admin-tenant'
import { findAuthUserByEmail, normalizeEmail } from '@/lib/auth/admin-users'

// All actions here are super_admin-only (ITMANO internal onboarding), gated the
// same way as updateScoreRules. The admin client (service_role) is the correct
// path: tenants/user_profiles have SELECT-only RLS, and auth.users is only
// reachable via the admin API.

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Administrador ITMANO',
  agent_owner: 'Propietario',
  agent:       'Agente',
}

// ─── Selección de tenant (super_admin) ────────────────────────────────────────

// Entra al CRM de un tenant: setea la cookie de selección y aterriza en su
// dashboard. La cookie solo la honra tenant-context cuando el rol del request
// es super_admin.
export async function enterTenant(tenantId: string): Promise<void> {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'super_admin') return

  const supabase = createAdminClient()
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .maybeSingle()
  if (!tenant) return

  const store = await cookies()
  store.set(ADMIN_TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 3600,
    secure: process.env.NODE_ENV === 'production',
  })
  redirect('/dashboard')
}

// Sale del CRM del tenant y vuelve al centro de control.
export async function exitToHub(): Promise<void> {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'super_admin') return

  const store = await cookies()
  store.delete(ADMIN_TENANT_COOKIE)
  redirect('/admin')
}

// ─── Create tenant ──────────────────────────────────────────────────────────

const CreateTenantSchema = z.object({
  name:         z.string().trim().min(1, 'El nombre es obligatorio').max(100),
  slug:         z.string().trim().min(1).max(60)
                  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'El slug debe ser kebab-case (minúsculas, números y guiones)'),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido (formato #RRGGBB)').optional(),
  plan:         z.enum(['esencial', 'growth', 'partner']).default('esencial'),
})

export async function createTenant(
  input: { name: string; slug: string; primaryColor?: string; plan?: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'super_admin') {
    return { ok: false, error: 'Solo un administrador de ITMANO puede crear tenants.' }
  }

  const parsed = CreateTenantSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  // id is derived from the slug, consistent with 'tenant-aj'.
  const id       = `tenant-${parsed.data.slug}`
  const supabase = createAdminClient()

  // Reject a duplicate id OR slug up front for a clean message (the unique slug
  // constraint is the DB-level backstop).
  const { data: existing } = await supabase
    .from('tenants')
    .select('id')
    .or(`id.eq.${id},slug.eq.${parsed.data.slug}`)
    .limit(1)
    .maybeSingle()
  if (existing) {
    return { ok: false, error: `Ya existe un tenant con el slug "${parsed.data.slug}".` }
  }

  // email_from_address is intentionally omitted (nullable; configured later).
  const { error } = await supabase.from('tenants').insert({
    id,
    name:          parsed.data.name,
    slug:          parsed.data.slug,
    primary_color: parsed.data.primaryColor ?? '#1E3A5F',
  })
  if (error) return { ok: false, error: error.message }

  // Suscripción inicial (sales-led). Best-effort: si falla, el tenant existe y
  // el plan se puede fijar luego desde la gestión (upsert).
  const { error: subErr } = await supabase.from('subscriptions').insert({
    tenant_id: id,
    plan:      parsed.data.plan,
  })
  if (subErr) {
    console.error(JSON.stringify({ service: 'create-tenant-subscription', tenant_id: id, error: subErr.message }))
  }

  revalidatePath('/admin')
  return { ok: true, id }
}

// ─── Update tenant ────────────────────────────────────────────────────────────

const UpdateTenantSchema = z.object({
  tenantId:     z.string().trim().min(1),
  name:         z.string().trim().min(1, 'El nombre es obligatorio').max(100),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido (formato #RRGGBB)'),
  // Límite mensual de IA (USD). aiUnlimited = true ignora el monto.
  aiMonthlyLimitUsd: z.number().min(0, 'El límite no puede ser negativo').max(9999.99, 'Límite demasiado alto'),
  aiUnlimited:       z.boolean(),
})

export async function updateTenant(
  input: {
    tenantId: string; name: string; primaryColor: string
    aiMonthlyLimitUsd: number; aiUnlimited: boolean
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'super_admin') {
    return { ok: false, error: 'Solo un administrador de ITMANO puede editar tenants.' }
  }

  const parsed = UpdateTenantSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('tenants')
    .update({
      name:                 parsed.data.name,
      primary_color:        parsed.data.primaryColor,
      ai_monthly_limit_usd: Math.round(parsed.data.aiMonthlyLimitUsd * 100) / 100,
      ai_unlimited:         parsed.data.aiUnlimited,
    })
    .eq('id', parsed.data.tenantId)
  if (error) return { ok: false, error: error.message }

  // El nombre/branding se lee en el layout (sidebar, switcher) — revalidar todo.
  revalidatePath('/', 'layout')
  return { ok: true }
}

// ─── Subscription management (super_admin) ───────────────────────────────────
// Aplica el plan/estado definitivo de un tenant y limpia cualquier solicitud
// pendiente (el flujo del owner solo SOLICITA; aquí se resuelve).

const UpdateSubscriptionSchema = z.object({
  tenantId: z.string().trim().min(1),
  plan:     z.enum(['esencial', 'growth', 'partner']),
  status:   z.enum(['active', 'cancelled']),
})

export async function updateTenantSubscription(
  input: { tenantId: string; plan: string; status: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'super_admin') {
    return { ok: false, error: 'Solo un administrador de ITMANO puede gestionar suscripciones.' }
  }

  const parsed = UpdateSubscriptionSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const supabase = createAdminClient()
  // Upsert: tenants creados antes de la migración 054 podrían no tener fila.
  const { error } = await supabase
    .from('subscriptions')
    .upsert({
      tenant_id:      parsed.data.tenantId,
      plan:           parsed.data.plan,
      status:         parsed.data.status,
      requested_plan: null,
      updated_at:     new Date().toISOString(),
    }, { onConflict: 'tenant_id' })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin')
  revalidatePath('/settings')
  return { ok: true }
}

// ─── Delete tenant ────────────────────────────────────────────────────────────

// Eliminación real de la fila. La mayoría de las FKs a tenants NO son cascade
// (leads, agents, canales, emails…), así que un tenant con datos operativos es
// rechazado por Postgres — eso es intencional: borrar un tenant productivo
// requiere limpieza deliberada, no un botón. `confirmSlug` obliga a teclear el
// slug exacto como confirmación.
export async function deleteTenant(
  tenantId: string,
  confirmSlug: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'super_admin') {
    return { ok: false, error: 'Solo un administrador de ITMANO puede eliminar tenants.' }
  }

  const supabase = createAdminClient()
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, slug, logo_url')
    .eq('id', tenantId)
    .maybeSingle()
  if (!tenant) return { ok: false, error: 'El tenant no existe.' }

  const t = tenant as { id: string; slug: string; logo_url: string | null }
  if (confirmSlug.trim() !== t.slug) {
    return { ok: false, error: `Escribe el slug exacto (“${t.slug}”) para confirmar.` }
  }

  const { error } = await supabase.from('tenants').delete().eq('id', tenantId)
  if (error) {
    if (/foreign key|violates/i.test(error.message)) {
      return {
        ok: false,
        error: 'El tenant tiene datos asociados (leads, agentes, canales…). Elimina o migra esos datos antes de borrarlo.',
      }
    }
    return { ok: false, error: error.message }
  }

  // Limpieza best-effort del branding en Storage (la fila ya no existe).
  const { data: assets } = await supabase.storage.from('tenant-assets').list(tenantId, { limit: 100 })
  const paths = (assets ?? []).map(o => `${tenantId}/${o.name}`)
  if (paths.length > 0) {
    const { error: rmErr } = await supabase.storage.from('tenant-assets').remove(paths)
    if (rmErr) console.error(JSON.stringify({ service: 'delete-tenant-assets', tenant_id: tenantId, error: rmErr.message }))
  }

  // Si el super_admin estaba actuando como este tenant, soltar la selección.
  const store = await cookies()
  if (store.get(ADMIN_TENANT_COOKIE)?.value === tenantId) {
    store.delete(ADMIN_TENANT_COOKIE)
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

// ─── Provision owner ──────────────────────────────────────────────────────────

const ProvisionOwnerSchema = z.object({
  tenantId:       z.string().trim().min(1),
  email:          z.string().trim().email('Email inválido'),
  telegramChatId: z.string().trim().max(50).optional(),
})

export async function provisionOwner(
  input: { tenantId: string; email: string; telegramChatId?: string },
): Promise<{ ok: true; email: string; created: boolean } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'super_admin') {
    return { ok: false, error: 'Solo un administrador de ITMANO puede provisionar owners.' }
  }

  const parsed = ProvisionOwnerSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const email          = normalizeEmail(parsed.data.email)
  const telegramChatId = parsed.data.telegramChatId?.trim() || null
  const supabase       = createAdminClient()

  // Tenant must exist.
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name')
    .eq('id', parsed.data.tenantId)
    .maybeSingle()
  if (!tenant) return { ok: false, error: 'El tenant no existe.' }

  // One owner per tenant (current rule). Check BEFORE creating any auth user so a
  // rejected provisioning never leaves a stray account behind.
  const { data: existingOwner } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('tenant_id', parsed.data.tenantId)
    .eq('role', 'agent_owner')
    .limit(1)
    .maybeSingle()
  if (existingOwner) {
    return { ok: false, error: `${(tenant as { name: string }).name} ya tiene un owner asignado.` }
  }

  // Find an existing auth user with this email, else create one (no password —
  // login is Magic Link; email_confirm so the first link works immediately).
  const found = await findAuthUserByEmail(email)
  let userId: string
  let created = false
  if (found) {
    userId = found.id
  } else {
    const { data: createdUser, error: createErr } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
    })
    if (createErr || !createdUser?.user) {
      return { ok: false, error: `No se pudo crear el usuario: ${createErr?.message ?? 'desconocido'}` }
    }
    userId  = createdUser.user.id
    created = true
  }

  // The user must not already have a profile (reused auth user from another
  // tenant/role). A freshly created user never does.
  const { data: existingProfile } = await supabase
    .from('user_profiles')
    .select('tenant_id, role')
    .eq('id', userId)
    .maybeSingle()
  if (existingProfile) {
    const p = existingProfile as { tenant_id: string | null; role: string }
    const where = p.tenant_id ?? 'sin tenant'
    return { ok: false, error: `Este email ya tiene un perfil (${ROLE_LABELS[p.role] ?? p.role} en ${where}).` }
  }

  // RLS on user_profiles is SELECT-only; the admin client (service_role) is the
  // correct path for this insert.
  const { error: insertErr } = await supabase.from('user_profiles').insert({
    id:               userId,
    tenant_id:        parsed.data.tenantId,
    role:             'agent_owner',
    telegram_chat_id: telegramChatId,
  })
  if (insertErr) return { ok: false, error: insertErr.message }

  revalidatePath('/admin')
  return { ok: true, email, created }
}
