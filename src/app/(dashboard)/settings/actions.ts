'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'

const TENANT_ID = 'tenant-aj'

// ─── Update tenant name ───────────────────────────────────────────────────────

export async function updateTenantName(
  name: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!name.trim()) return { ok: false, error: 'El nombre no puede estar vacío' }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('tenants')
    .update({ name: name.trim() })
    .eq('id', TENANT_ID)

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

  const supabase = createAdminClient()
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
    .eq('tenant_id', TENANT_ID)

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
