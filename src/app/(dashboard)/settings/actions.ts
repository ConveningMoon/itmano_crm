'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { requireWriteAccess, resolveTargetTenant } from '@/lib/auth/guards'
import { findAuthUserByEmail, normalizeEmail } from '@/lib/auth/admin-users'

// ─── Update tenant name ───────────────────────────────────────────────────────

export async function updateTenantName(
  name: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!name.trim()) return { ok: false, error: 'El nombre no puede estar vacío' }

  const ctx = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const supabase = createAdminClient()
  // TODO(admin-onboarding): super_admin tenant selection arrives with the admin
  // onboarding prompt; until then super_admin falls back to 'tenant-aj'.
  const tenantId = ctx.tenant_id ?? 'tenant-aj'
  const { error } = await supabase
    .from('tenants')
    .update({ name: name.trim() })
    .eq('id', tenantId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings')
  return { ok: true }
}

// ─── Update agent ─────────────────────────────────────────────────────────────

export async function updateAgent(
  agentId: string,
  fields: {
    name: string
    email: string
    phone: string
    accentColor: string
    avatarInitials: string
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!fields.name.trim()) return { ok: false, error: 'El nombre no puede estar vacío' }
  if (!fields.email.trim()) return { ok: false, error: 'El email no puede estar vacío' }

  const ctx = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const supabase = createAdminClient()
  // TODO(admin-onboarding): super_admin tenant selection arrives with the admin
  // onboarding prompt; until then super_admin falls back to 'tenant-aj'.
  const tenantId = ctx.tenant_id ?? 'tenant-aj'
  const { error } = await supabase
    .from('agents')
    .update({
      name:            fields.name.trim(),
      email:           fields.email.trim(),
      phone:           fields.phone.trim() || null,
      accent_color:    fields.accentColor,
      avatar_initials: fields.avatarInitials.trim().toUpperCase().slice(0, 2),
    })
    .eq('id', agentId)
    .eq('tenant_id', tenantId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings')
  revalidatePath('/leads')
  revalidatePath('/dashboard')
  return { ok: true }
}

// ─── Update global scoring rules ──────────────────────────────────────────────
// Only super_admin (ITMANO internal) may edit the GLOBAL rules (tenant_id = null).
// Per-tenant overrides are a future feature. Only `points` and `is_active` are
// editable — the dimension/match_value vocabulary is fixed in code. The DB also
// enforces super_admin via the lead_score_rules write RLS policy; this guard gives
// a clean error and is the primary gate (an RLS-blocked UPDATE silently affects 0 rows).

const ScoreRuleUpdateSchema = z
  .array(
    z.object({
      id:       z.string().min(1),
      points:   z.number().int().min(-100).max(100),
      isActive: z.boolean(),
    })
  )
  .min(1)
  .max(200)

export async function updateScoreRules(
  updates: { id: string; points: number; isActive: boolean }[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'super_admin') {
    return { ok: false, error: 'Solo un administrador de ITMANO puede ajustar el scoring.' }
  }

  const parsed = ScoreRuleUpdateSchema.safeParse(updates)
  if (!parsed.success) {
    return { ok: false, error: 'Los puntos deben ser números enteros entre -100 y 100.' }
  }

  const supabase = createAdminClient()
  for (const u of parsed.data) {
    const { error } = await supabase
      .from('lead_score_rules')
      .update({ points: u.points, is_active: u.isActive })
      .eq('id', u.id)
      .is('tenant_id', null) // global rules only — never touch a per-tenant override
    if (error) return { ok: false, error: error.message }
  }

  revalidatePath('/settings')
  return { ok: true }
}

// ─── Agents: create + login access (invite / revoke) ──────────────────────────
// All three are owner/super_admin only; requireWriteAccess blocks role 'agent'
// (read-only). Login access uses the same PRE-PROVISION pattern as provisionOwner:
// the auth user + user_profiles(role='agent') + agents.user_id are created up front
// so the agent's first Magic Link just works. Email is NOT sent here (the verified
// sending domain is per-tenant, not ITMANO's) — the UI shows a copyable message.

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

// 'agent-' + slug(name), with a numeric suffix on collision within the tenant.
async function generateAgentId(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  name: string,
): Promise<string> {
  const base = `agent-${slugify(name) || 'team'}`
  const { data } = await supabase
    .from('agents')
    .select('id')
    .eq('tenant_id', tenantId)
    .like('id', `${base}%`)
  const taken = new Set((data ?? []).map(r => (r as { id: string }).id))
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}

const CreateAgentSchema = z.object({
  name:           z.string().trim().min(1, 'El nombre es obligatorio').max(80),
  email:          z.string().trim().email('Email inválido'),
  phone:          z.string().trim().max(40).optional(),
  language:       z.enum(['es', 'en', 'pt']),
  specialty:      z.enum(['hispanic', 'military', 'first_buyer', 'brazilian']),
  avatarInitials: z.string().trim().min(1).max(2),
  accentColor:    z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido (formato #RRGGBB)'),
  tenantId:       z.string().optional(), // required for super_admin
})

export async function createAgent(
  input: {
    name: string; email: string; phone?: string; language: string
    specialty: string; avatarInitials: string; accentColor: string; tenantId?: string
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const ctx    = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const parsed = CreateAgentSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const tenant = resolveTargetTenant(ctx, parsed.data.tenantId)
  if (typeof tenant === 'object') return { ok: false, error: tenant.error }
  const tenantId = tenant

  const supabase = createAdminClient()
  const id       = await generateAgentId(supabase, tenantId, parsed.data.name)

  const { error } = await supabase.from('agents').insert({
    id,
    tenant_id:       tenantId,
    name:            parsed.data.name,
    email:           normalizeEmail(parsed.data.email),
    phone:           parsed.data.phone?.trim() || null,
    language:        parsed.data.language,
    specialty:       parsed.data.specialty,
    avatar_initials: parsed.data.avatarInitials.toUpperCase().slice(0, 2),
    accent_color:    parsed.data.accentColor,
    active:          true,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings')
  revalidatePath('/leads')
  revalidatePath('/dashboard')
  return { ok: true, id }
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Administrador ITMANO',
  agent_owner: 'Propietario',
  agent:       'Agente',
}

export async function inviteAgentAccess(
  agentId: string,
  email?: string,
): Promise<{ ok: true; email: string; created: boolean } | { ok: false; error: string }> {
  const ctx    = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const supabase = createAdminClient()

  // Load the agent tenant-scoped (super_admin: no tenant filter).
  let agentQ = supabase.from('agents').select('id, tenant_id, email, user_id').eq('id', agentId)
  if (ctx.tenant_id) agentQ = agentQ.eq('tenant_id', ctx.tenant_id)
  const { data: agent } = await agentQ.maybeSingle()
  if (!agent) return { ok: false, error: 'Agente no encontrado' }

  const a = agent as { id: string; tenant_id: string; email: string; user_id: string | null }
  if (a.user_id) return { ok: false, error: 'Este agente ya tiene acceso' }

  // Resolve + validate the email up front. Default to the agent's stored email.
  const rawEmail = (email?.trim() || a.email)
  const emailCheck = z.string().email().safeParse(rawEmail)
  if (!emailCheck.success) return { ok: false, error: 'Email inválido' }
  const normalized = normalizeEmail(rawEmail)

  // Validate EVERYTHING that can fail before creating any auth user, so a rejected
  // invite never leaves an orphan account behind.
  const found = await findAuthUserByEmail(normalized)
  if (found) {
    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('tenant_id, role')
      .eq('id', found.id)
      .maybeSingle()
    if (existingProfile) {
      const p = existingProfile as { tenant_id: string | null; role: string }
      return { ok: false, error: `Este email ya tiene un perfil (${ROLE_LABELS[p.role] ?? p.role} en ${p.tenant_id ?? 'sin tenant'}).` }
    }
  }

  // Find-or-create the auth user (no password — Magic Link; email_confirm so the
  // first link works immediately).
  let userId: string
  let created = false
  if (found) {
    userId = found.id
  } else {
    const { data: createdUser, error: createErr } = await supabase.auth.admin.createUser({
      email:         normalized,
      email_confirm: true,
    })
    if (createErr || !createdUser?.user) {
      return { ok: false, error: `No se pudo crear el usuario: ${createErr?.message ?? 'desconocido'}` }
    }
    userId  = createdUser.user.id
    created = true
  }

  // Profile (role 'agent') → link agents.user_id → record the invitation.
  const { error: profileErr } = await supabase.from('user_profiles').insert({
    id:        userId,
    tenant_id: a.tenant_id,
    role:      'agent',
  })
  if (profileErr) return { ok: false, error: profileErr.message }

  const { error: linkErr } = await supabase.from('agents').update({ user_id: userId }).eq('id', a.id)
  if (linkErr) return { ok: false, error: linkErr.message }

  const { error: inviteErr } = await supabase.from('invitations').insert({
    tenant_id:  a.tenant_id,
    email:      normalized,
    role:       'agent',
    agent_id:   a.id,
    invited_by: ctx.user_id,
    status:     'pending',
    expires_at: null,
  })
  if (inviteErr) return { ok: false, error: inviteErr.message }

  revalidatePath('/settings')
  return { ok: true, email: normalized, created }
}

export async function revokeAgentAccess(
  agentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx    = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const supabase = createAdminClient()

  let agentQ = supabase.from('agents').select('id, tenant_id, user_id').eq('id', agentId)
  if (ctx.tenant_id) agentQ = agentQ.eq('tenant_id', ctx.tenant_id)
  const { data: agent } = await agentQ.maybeSingle()
  if (!agent) return { ok: false, error: 'Agente no encontrado' }

  const a = agent as { id: string; tenant_id: string; user_id: string | null }
  if (!a.user_id) return { ok: false, error: 'Este agente no tiene acceso' }

  // Deleting the auth user cascades: user_profiles ON DELETE CASCADE, and
  // agents.user_id ON DELETE SET NULL (031). The agent's leads are untouched.
  const { error: delErr } = await supabase.auth.admin.deleteUser(a.user_id)
  if (delErr) return { ok: false, error: `No se pudo revocar el acceso: ${delErr.message}` }

  // Mark the pending invitation for this agent as revoked.
  await supabase
    .from('invitations')
    .update({ status: 'revoked' })
    .eq('agent_id', a.id)
    .eq('status', 'pending')

  revalidatePath('/settings')
  revalidatePath('/leads')
  return { ok: true }
}
