'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { EmailContentSchema } from '@/lib/email-content'

export type PurchaseTemplateRow = {
  id:                 string
  milestone:          'start' | 'pre_close' | 'completed'
  language:           'es' | 'en' | 'pt'
  resend_template_id: string
  subject:            string | null
  body_json:          unknown
}

export async function getPurchaseTemplates(tenantId: string): Promise<PurchaseTemplateRow[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('purchase_email_templates')
    .select('id, milestone, language, resend_template_id, subject, body_json')
    .eq('tenant_id', tenantId)
    .order('milestone')
    .order('language')
  return (data ?? []) as PurchaseTemplateRow[]
}

export type PurchaseTemplateByTenant = {
  tenant_id:   string
  tenant_name: string
  templates:   PurchaseTemplateRow[]
}

// super_admin path: fetch all tenants' purchase templates, grouped by tenant.
export async function getAllPurchaseTemplatesByTenant(): Promise<PurchaseTemplateByTenant[]> {
  const db = createAdminClient()
  const { data: rows } = await db
    .from('purchase_email_templates')
    .select('id, milestone, language, resend_template_id, subject, body_json, tenant_id')
    .order('tenant_id')
    .order('milestone')
    .order('language')

  const raw = (rows ?? []) as {
    id: string; milestone: 'start' | 'pre_close' | 'completed'
    language: 'es' | 'en' | 'pt'; resend_template_id: string
    subject: string | null; body_json: unknown; tenant_id: string
  }[]

  if (raw.length === 0) return []

  const tids = [...new Set(raw.map(r => r.tenant_id))]
  const { data: tenants } = await db
    .from('tenants')
    .select('id, name')
    .in('id', tids)
  const nameMap = new Map<string, string>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tenants ?? []).map((t: any) => [t.id, t.name] as [string, string])
  )

  const grouped = new Map<string, PurchaseTemplateByTenant>()
  for (const r of raw) {
    if (!grouped.has(r.tenant_id)) {
      grouped.set(r.tenant_id, {
        tenant_id:   r.tenant_id,
        tenant_name: nameMap.get(r.tenant_id) ?? r.tenant_id,
        templates:   [],
      })
    }
    grouped.get(r.tenant_id)!.templates.push({
      id: r.id, milestone: r.milestone,
      language: r.language, resend_template_id: r.resend_template_id,
      subject: r.subject, body_json: r.body_json,
    })
  }

  return [...grouped.values()]
}

export async function updatePurchaseTemplate(
  id: string,
  resendTemplateId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'super_admin') return { ok: false, error: 'Sin permiso' }

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

// Guarda contenido del composer en un correo de hito de compra. Mismo gate
// super_admin que updatePurchaseTemplate. El contenido CRM tiene precedencia
// sobre resend_template_id en el envío (send-purchase-email.ts), así que el
// template id se conserva como fallback visible en modo avanzado.
const PurchaseContentSchema = z.object({
  subject: z.string().trim().min(1, 'El asunto es obligatorio').max(200),
  content: EmailContentSchema,
})

export async function updatePurchaseTemplateContent(
  id: string,
  fields: z.infer<typeof PurchaseContentSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'super_admin') return { ok: false, error: 'Sin permiso' }

  const parsed = PurchaseContentSchema.safeParse(fields)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const db = createAdminClient()

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
    .update({
      subject:    parsed.data.subject,
      body_json:  parsed.data.content,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/emails')
  return { ok: true }
}

// Vuelve un correo de compra al modo template (borra el contenido CRM).
export async function clearPurchaseTemplateContent(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'super_admin') return { ok: false, error: 'Sin permiso' }

  const db = createAdminClient()
  const { error } = await db
    .from('purchase_email_templates')
    .update({ subject: null, body_json: null, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/emails')
  return { ok: true }
}
