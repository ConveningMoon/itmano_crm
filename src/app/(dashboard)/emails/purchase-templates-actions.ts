'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'

export type PurchaseTemplateRow = {
  id:                 string
  milestone:          'start' | 'pre_close' | 'completed'
  language:           'es' | 'en' | 'pt'
  resend_template_id: string
}

export async function getPurchaseTemplates(tenantId: string): Promise<PurchaseTemplateRow[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('purchase_email_templates')
    .select('id, milestone, language, resend_template_id')
    .eq('tenant_id', tenantId)
    .order('milestone')
    .order('language')
  return (data ?? []) as PurchaseTemplateRow[]
}

export async function updatePurchaseTemplate(
  id: string,
  resendTemplateId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  if (ctx.role === 'agent') return { ok: false, error: 'Sin permiso' }

  const db = createAdminClient()

  // Verify the row belongs to this tenant (super_admin: ctx.tenant_id is null — allow).
  if (ctx.tenant_id) {
    const { data: row } = await db
      .from('purchase_email_templates')
      .select('tenant_id')
      .eq('id', id)
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!row || (row as any).tenant_id !== ctx.tenant_id) {
      return { ok: false, error: 'Template no encontrado' }
    }
  }

  const { error } = await db
    .from('purchase_email_templates')
    .update({ resend_template_id: resendTemplateId.trim(), updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/emails')
  return { ok: true }
}
