'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'

// Mark every unread notification in the caller's scope as read.
// super_admin (tenant_id = null) clears across all tenants; agent_owner only
// clears its own tenant's rows.
export async function markAllNotificationsRead(): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx      = await getCurrentTenantContext()
  const supabase = createAdminClient()

  let q = supabase.from('notifications').update({ read: true }).eq('read', false)
  if (ctx.tenant_id) q = q.eq('tenant_id', ctx.tenant_id)

  const { error } = await q
  if (error) {
    console.error(JSON.stringify({ service: 'notifications-actions', action: 'markAllRead', error: error.message }))
    return { ok: false, error: error.message }
  }

  revalidatePath('/notifications')
  return { ok: true }
}
