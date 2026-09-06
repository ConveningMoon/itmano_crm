import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { parseEmailContent } from '@/lib/email-content'
import { SUPPORTED_LANGUAGE_CODES } from '@/lib/config'

// Estado de los 3 emails de cierre (hitos del proceso de compra) POR AGENTE
// (migración 058: purchase_email_templates.agent_id). Cada agente tiene sus
// 3 correos × cada idioma registrado (agents.languages). Un email está "listo"
// si tiene contenido creado en el CRM (subject + body_json) o un Resend
// template id real (no placeholder) — misma definición que el envío real en
// send-purchase-email.ts.

export type ClosingMilestone = 'start' | 'pre_close' | 'completed'

const MILESTONES: ClosingMilestone[] = ['start', 'pre_close', 'completed']
const VALID_LANGS = SUPPORTED_LANGUAGE_CODES as readonly string[]

export const CLOSING_MILESTONE_LABEL: Record<ClosingMilestone, string> = {
  start:     'inicio de proceso',
  pre_close: 'pre-cierre',
  completed: 'proceso completado',
}

function isPlaceholder(id: string | null | undefined): boolean {
  return !id || id.startsWith('REPLACE_ME')
}

// Idioma efectivo del email de cierre para un lead: el idioma del lead si el
// agente lo tiene registrado; si no, el idioma principal del agente. Si el lead
// habla un idioma que el agente NO domina, el default es INGLÉS (no español).
// La misma regla aplica en el gate (startPurchaseProcess) y en el envío real.
export function resolveClosingLanguage(
  agentLanguages: string[] | null | undefined,
  agentPrimary: string,
  leadLanguage: string | null | undefined,
): string {
  const langs = (agentLanguages ?? []).filter(l => VALID_LANGS.includes(l))
  const lead  = leadLanguage && VALID_LANGS.includes(leadLanguage) ? leadLanguage : null
  // 1. El lead recibe su idioma si el agente lo tiene configurado.
  if (lead && langs.includes(lead)) return lead
  // 2. El agente domina inglés → default inglés para leads fuera de su set.
  if (langs.includes('en')) return 'en'
  // 3. Idioma principal del agente como último recurso.
  if (VALID_LANGS.includes(agentPrimary)) return agentPrimary
  return langs[0] ?? 'en'
}

// Devuelve los hitos cuyos emails NO están configurados para (agente, idioma).
// Array vacío = los 3 están listos.
export async function getMissingClosingEmails(
  db: ReturnType<typeof createAdminClient>,
  tenantId: string,
  agentId: string,
  language: string,
): Promise<ClosingMilestone[]> {
  const lang = VALID_LANGS.includes(language) ? language : 'en'

  const { data } = await db
    .from('purchase_email_templates')
    .select('milestone, subject, body_json, resend_template_id')
    .eq('tenant_id', tenantId)
    .eq('agent_id', agentId)
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

// Provisión perezosa e idempotente: garantiza que exista una fila por
// (agente activo × idioma registrado × hito) del tenant. Se llama al cargar
// la página /emails y al cambiar los idiomas de un agente — así agregar un
// idioma en Configuración hace aparecer sus 3 correos vacíos al instante.
export async function ensurePurchaseTemplateRows(
  db: ReturnType<typeof createAdminClient>,
  tenantId: string,
): Promise<void> {
  const [{ data: agents }, { data: existing }] = await Promise.all([
    db.from('agents').select('id, languages').eq('tenant_id', tenantId).eq('active', true),
    db.from('purchase_email_templates').select('agent_id, milestone, language').eq('tenant_id', tenantId),
  ])

  const have = new Set(
    ((existing ?? []) as { agent_id: string; milestone: string; language: string }[])
      .map(r => `${r.agent_id}|${r.milestone}|${r.language}`)
  )

  const missing: { tenant_id: string; agent_id: string; milestone: string; language: string; resend_template_id: string }[] = []
  for (const a of (agents ?? []) as { id: string; languages: string[] | null }[]) {
    const langs = (a.languages ?? []).filter(l => (VALID_LANGS as readonly string[]).includes(l))
    for (const lang of langs) {
      for (const m of MILESTONES) {
        if (!have.has(`${a.id}|${m}|${lang}`)) {
          missing.push({ tenant_id: tenantId, agent_id: a.id, milestone: m, language: lang, resend_template_id: '' })
        }
      }
    }
  }

  if (missing.length === 0) return

  const { error } = await db
    .from('purchase_email_templates')
    .upsert(missing, { onConflict: 'tenant_id,agent_id,milestone,language', ignoreDuplicates: true })
  if (error) {
    console.error(JSON.stringify({ service: 'closing-emails-ensure', tenant_id: tenantId, error: error.message }))
  }
}
