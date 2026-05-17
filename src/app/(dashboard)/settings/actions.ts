'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

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
