'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { EmailContentSchema } from '@/lib/email-content'
import { ensurePurchaseTemplateRows } from '@/lib/services/closing-emails-status'

// Emails de cierre POR AGENTE (migración 058): cada agente activo tiene 3 hitos
// × cada idioma registrado (agents.languages). Visibilidad y edición:
//   - super_admin: todos los tenants, todos los agentes.
//   - agent_owner: todos los agentes de su tenant.
//   - agent: solo sus propios correos (ctx.agent_id).

export type PurchaseTemplateRow = {
  id:                 string
  agent_id:           string
  milestone:          'start' | 'pre_close' | 'completed'
  language:           'es' | 'en' | 'pt'
  resend_template_id: string
  subject:            string | null
  body_json:          unknown
}

export type AgentPurchaseTemplates = {
  agent_id:     string
  agent_name:   string
  accent_color: string
  languages:    string[]
  templates:    PurchaseTemplateRow[]
}

const TEMPLATE_COLS = 'id, agent_id, milestone, language, resend_template_id, subject, body_json'

// Agrupa los correos de un tenant por agente. `agentId` restringe a un solo
// agente (rol 'agent'). Garantiza primero que existan las filas (provisión
// perezosa — un idioma recién agregado aparece con sus 3 correos vacíos).
export async function getPurchaseTemplatesByAgent(
  tenantId: string,
  opts?: { agentId?: string | null },
): Promise<AgentPurchaseTemplates[]> {
  // 'use server' exporta un endpoint público: forzar el scope del contexto para
  // no-super_admin (tenant propio; rol 'agent' además solo su propio agente).
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'super_admin') {
    if (!ctx.tenant_id) return []
    tenantId = ctx.tenant_id
    if (ctx.role === 'agent') opts = { agentId: ctx.agent_id }
  }

  const db = createAdminClient()
  await ensurePurchaseTemplateRows(db, tenantId)

  let agentsQ = db
    .from('agents')
    .select('id, name, accent_color, languages')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .order('name')
  if (opts?.agentId) agentsQ = agentsQ.eq('id', opts.agentId)

  const [{ data: agents }, { data: rows }] = await Promise.all([
    agentsQ,
    db.from('purchase_email_templates').select(TEMPLATE_COLS).eq('tenant_id', tenantId),
  ])

  const templates = (rows ?? []) as PurchaseTemplateRow[]
  return ((agents ?? []) as { id: string; name: string; accent_color: string; languages: string[] | null }[])
    .map(a => ({
      agent_id:     a.id,
      agent_name:   a.name,
      accent_color: a.accent_color,
      languages:    a.languages ?? [],
      templates:    templates.filter(t => t.agent_id === a.id),
    }))
}

export type PurchaseTemplateByTenant = {
  tenant_id:   string
  tenant_name: string
  agents:      AgentPurchaseTemplates[]
}

// super_admin path: todos los tenants, agrupados por tenant → agente.
export async function getAllPurchaseTemplatesByTenant(): Promise<PurchaseTemplateByTenant[]> {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'super_admin') return []

  const db = createAdminClient()
  const { data: tenants } = await db.from('tenants').select('id, name').order('name')

  const result: PurchaseTemplateByTenant[] = []
  for (const t of (tenants ?? []) as { id: string; name: string }[]) {
    const agents = await getPurchaseTemplatesByAgent(t.id)
    if (agents.length > 0) {
      result.push({ tenant_id: t.id, tenant_name: t.name, agents })
    }
  }
  return result
}

// Verifica que el usuario actual pueda editar la fila: scoping por tenant para
// todos; los 'agent' solo tocan sus propios correos. Devuelve null si puede.
async function assertCanEditRow(
  db: ReturnType<typeof createAdminClient>,
  id: string,
): Promise<{ ok: false; error: string } | null> {
  const ctx = await getCurrentTenantContext()

  const { data: row } = await db
    .from('purchase_email_templates')
    .select('tenant_id, agent_id')
    .eq('id', id)
    .maybeSingle()
  const r = row as { tenant_id: string; agent_id: string } | null
  if (!r) return { ok: false, error: 'Template no encontrado' }

  if (ctx.tenant_id && r.tenant_id !== ctx.tenant_id) {
    return { ok: false, error: 'Template no encontrado' }
  }
  if (ctx.role === 'agent' && r.agent_id !== ctx.agent_id) {
    return { ok: false, error: 'Solo puedes editar tus propios emails de cierre.' }
  }
  return null
}

export async function updatePurchaseTemplate(
  id: string,
  resendTemplateId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = createAdminClient()
  const denied = await assertCanEditRow(db, id)
  if (denied) return denied

  const { error } = await db
    .from('purchase_email_templates')
    .update({ resend_template_id: resendTemplateId.trim(), updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/emails')
  return { ok: true }
}

// Guarda contenido del composer en un correo de hito de compra. El contenido
// CRM tiene precedencia sobre resend_template_id en el envío
// (send-purchase-email.ts), así que el template id se conserva como fallback
// visible en modo avanzado.
const PurchaseContentSchema = z.object({
  subject: z.string().trim().min(1, 'El asunto es obligatorio').max(200),
  content: EmailContentSchema,
})

export async function updatePurchaseTemplateContent(
  id: string,
  fields: z.infer<typeof PurchaseContentSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = PurchaseContentSchema.safeParse(fields)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const db = createAdminClient()
  const denied = await assertCanEditRow(db, id)
  if (denied) return denied

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
  const db = createAdminClient()
  const denied = await assertCanEditRow(db, id)
  if (denied) return denied

  const { error } = await db
    .from('purchase_email_templates')
    .update({ subject: null, body_json: null, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/emails')
  return { ok: true }
}
