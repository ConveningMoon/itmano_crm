import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { parseEmailContent } from '@/lib/email-content'

// Estado de los 3 emails de cierre (hitos del proceso de compra) para un tenant
// y un idioma. Un email está "listo" si tiene contenido creado en el CRM
// (subject + body) o un Resend template id real (no placeholder). Misma
// definición que usa el envío real en send-purchase-email.ts.

export type ClosingMilestone = 'start' | 'pre_close' | 'completed'

const MILESTONES: ClosingMilestone[] = ['start', 'pre_close', 'completed']

export const CLOSING_MILESTONE_LABEL: Record<ClosingMilestone, string> = {
  start:     'inicio de proceso',
  pre_close: 'pre-cierre',
  completed: 'proceso completado',
}

function isPlaceholder(id: string | null | undefined): boolean {
  return !id || id.startsWith('REPLACE_ME')
}

// Devuelve los hitos cuyos emails NO están configurados para (tenant, idioma).
// Array vacío = los 3 están listos.
export async function getMissingClosingEmails(
  db: ReturnType<typeof createAdminClient>,
  tenantId: string,
  language: string,
): Promise<ClosingMilestone[]> {
  const lang = ['es', 'en', 'pt'].includes(language) ? language : 'es'

  const { data } = await db
    .from('purchase_email_templates')
    .select('milestone, subject, body_json, resend_template_id')
    .eq('tenant_id', tenantId)
    .eq('language', lang)

  const rows = (data ?? []) as {
    milestone: string; subject: string | null; body_json: unknown; resend_template_id: string | null
  }[]

  const ready = new Set<string>()
  for (const r of rows) {
    const hasCrm = !!(parseEmailContent(r.body_json) && (r.subject ?? '').trim())
    if (hasCrm || !isPlaceholder(r.resend_template_id)) ready.add(r.milestone)
  }

  return MILESTONES.filter(m => !ready.has(m))
}
