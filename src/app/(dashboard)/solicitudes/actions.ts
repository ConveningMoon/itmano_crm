'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'

// Gestión de platform_requests (migración 057) — solo super_admin.

export type PlatformRequestRow = {
  id:              string
  kind:            'contact' | 'support' | 'page'
  tenant_name:     string | null
  requester_name:  string | null
  requester_email: string
  requester_role:  string | null
  company:         string | null
  category:        string | null
  subject:         string | null
  message:         string
  metadata:        Record<string, unknown>
  responded:       boolean
  responded_at:    string | null
  created_at:      string
}

export async function listPlatformRequests(): Promise<PlatformRequestRow[]> {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'super_admin') return []

  const db = createAdminClient()
  const { data } = await db
    .from('platform_requests')
    .select('id, kind, tenant_name, requester_name, requester_email, requester_role, company, category, subject, message, metadata, responded, responded_at, created_at')
    .order('created_at', { ascending: false })
    .limit(300)

  return (data ?? []) as PlatformRequestRow[]
}

export async function setRequestResponded(
  id: string,
  responded: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'super_admin') return { ok: false, error: 'Sin permiso' }

  const db = createAdminClient()
  const { error } = await db
    .from('platform_requests')
    .update({ responded, responded_at: responded ? new Date().toISOString() : null })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/solicitudes')
  return { ok: true }
}
