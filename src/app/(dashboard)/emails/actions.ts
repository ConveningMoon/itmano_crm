'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { requireWriteAccess } from '@/lib/auth/guards'
import { processSequenceRun } from '@/lib/services/process-sequence-run'
import { EmailContentSchema } from '@/lib/email-content'
import { renderEmail, type EmailLocale } from '@/lib/services/email-render'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getTenantId(overrideTenantId?: string): Promise<string | { error: string }> {
  const ctx = await getCurrentTenantContext()
  if (ctx.role === 'super_admin') {
    if (!overrideTenantId) return { error: 'Tenant requerido para super_admin' }
    return overrideTenantId
  }
  if (!ctx.tenant_id) return { error: 'Acceso no autorizado' }
  return ctx.tenant_id
}

function revalidateEmails() {
  revalidatePath('/emails')
  revalidatePath('/emails/[id]', 'page')
  revalidatePath('/analytics')
  revalidatePath('/sources')
}

// ─── Sequence CRUD ────────────────────────────────────────────────────────────

const SequenceSchema = z.object({
  name:           z.string().min(1).max(100),
  language:       z.enum(['es', 'en', 'pt']),
  description:    z.string().max(500).optional().nullable(),
  activationType: z.enum(['form', 'manual']).default('form'),
  agentId:        z.string().optional().nullable(), // null = "Toda la agencia"
  tenantId:       z.string().optional(), // required for super_admin
})

// Validates an optional sequence agent_id belongs to the tenant. null/'' → "Toda la
// agencia" (no agent). Returns the value to store, or an error.
async function resolveSequenceAgent(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  agentId: string | null | undefined,
): Promise<string | null | { error: string }> {
  const id = agentId?.trim()
  if (!id) return null
  const { data } = await supabase.from('agents').select('id').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (!data) return { error: 'El agente seleccionado no pertenece a este tenant' }
  return id
}

export async function createSequence(
  fields: z.infer<typeof SequenceSchema>
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = SequenceSchema.safeParse(fields)
  if (!parsed.success) return { ok: false, error: 'Datos inválidos' }

  const ctx = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const tenantId = await getTenantId(parsed.data.tenantId)
  if (typeof tenantId === 'object') return { ok: false, error: tenantId.error }

  const supabase = createAdminClient()
  const agent = await resolveSequenceAgent(supabase, tenantId, parsed.data.agentId)
  if (typeof agent === 'object' && agent !== null) return { ok: false, error: agent.error }

  const { data, error } = await supabase
    .from('email_sequences')
    .insert({
      tenant_id:       tenantId,
      name:            parsed.data.name.trim(),
      language:        parsed.data.language,
      description:     parsed.data.description?.trim() || null,
      activation_type: parsed.data.activationType,
      agent_id:        agent,
      active:          true,
    })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'Error al crear secuencia' }

  revalidateEmails()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ok: true, id: (data as any).id }
}

export async function updateSequence(
  sequenceId: string,
  fields: { name: string; language: string; description?: string | null; agentId?: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!fields.name.trim()) return { ok: false, error: 'El nombre es obligatorio' }

  const ctx = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied
  const supabase = createAdminClient()

  // Resolve/validate the agent against the sequence's tenant.
  const tenantForCheck = ctx.tenant_id ?? (await supabase.from('email_sequences').select('tenant_id').eq('id', sequenceId).maybeSingle()).data?.tenant_id as string | undefined
  const agent = await resolveSequenceAgent(supabase, tenantForCheck ?? '', fields.agentId)
  if (typeof agent === 'object' && agent !== null) return { ok: false, error: agent.error }

  let q = supabase
    .from('email_sequences')
    .update({
      name:        fields.name.trim(),
      language:    fields.language,
      description: fields.description?.trim() || null,
      agent_id:    agent,
    })
    .eq('id', sequenceId)

  if (ctx.tenant_id) q = q.eq('tenant_id', ctx.tenant_id)

  const { error } = await q
  if (error) return { ok: false, error: error.message }

  revalidateEmails()
  return { ok: true }
}

export async function toggleSequenceActive(
  sequenceId: string,
  active: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied
  const supabase = createAdminClient()

  let q = supabase
    .from('email_sequences')
    .update({ active })
    .eq('id', sequenceId)

  if (ctx.tenant_id) q = q.eq('tenant_id', ctx.tenant_id)

  const { error } = await q
  if (error) return { ok: false, error: error.message }

  revalidateEmails()
  return { ok: true }
}

export async function deleteSequence(
  sequenceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied
  const supabase = createAdminClient()

  // 1. Cancel active runs
  await supabase
    .from('lead_sequence_runs')
    .update({ status: 'cancelled', cancelled_reason: 'sequence_deleted' })
    .eq('sequence_id', sequenceId)
    .eq('status', 'active')

  // 2. Unlink channels
  await supabase
    .from('acquisition_channels')
    .update({ email_sequence_id: null })
    .eq('email_sequence_id', sequenceId)

  // 3. Delete steps (cascade would handle this too, but explicit for clarity)
  await supabase
    .from('email_sequence_steps')
    .delete()
    .eq('sequence_id', sequenceId)

  // 4. Delete sequence (scoped to tenant for non-super_admin)
  let q = supabase
    .from('email_sequences')
    .delete()
    .eq('id', sequenceId)

  if (ctx.tenant_id) q = q.eq('tenant_id', ctx.tenant_id)

  const { error } = await q
  if (error) return { ok: false, error: error.message }

  revalidateEmails()
  return { ok: true }
}

// ─── Step CRUD ────────────────────────────────────────────────────────────────

// Un paso guarda su contenido de UNA de dos formas (mutuamente excluyentes):
//   - 'crm':      subject + content del composer (body_json) — el CRM compila
//                 el HTML al enviar. resend_template_id queda null.
//   - 'template': UUID de un template de Resend (modo legacy/avanzado) —
//                 body_json queda null.
const StepSchema = z.discriminatedUnion('mode', [
  z.object({
    mode:       z.literal('crm'),
    delayHours: z.number().int().min(0),
    subject:    z.string().trim().min(1, 'El asunto es obligatorio').max(200),
    content:    EmailContentSchema,
  }),
  z.object({
    mode:             z.literal('template'),
    delayHours:       z.number().int().min(0),
    resendTemplateId: z.string().trim().min(1).max(200),
  }),
])

export type StepInput = z.infer<typeof StepSchema>

function stepColumns(data: StepInput) {
  return data.mode === 'crm'
    ? {
        delay_hours:        data.delayHours,
        subject:            data.subject,
        body_json:          data.content,
        resend_template_id: null,
      }
    : {
        delay_hours:        data.delayHours,
        subject:            null,
        body_json:          null,
        resend_template_id: data.resendTemplateId.trim(),
      }
}

export async function addStep(
  sequenceId: string,
  fields: StepInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = StepSchema.safeParse(fields)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const ctx = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied
  const supabase = createAdminClient()

  // Verify sequence belongs to tenant
  let seqQ = supabase.from('email_sequences').select('id, tenant_id').eq('id', sequenceId)
  if (ctx.tenant_id) seqQ = seqQ.eq('tenant_id', ctx.tenant_id)
  const { data: seq } = await seqQ.single()
  if (!seq) return { ok: false, error: 'Secuencia no encontrada' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (seq as any).tenant_id as string

  // Get next step_order
  const { data: existingSteps } = await supabase
    .from('email_sequence_steps')
    .select('step_order')
    .eq('sequence_id', sequenceId)
    .order('step_order', { ascending: false })
    .limit(1)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maxOrder = (existingSteps as any[])?.[0]?.step_order ?? -1
  const stepOrder = maxOrder + 1

  const { error } = await supabase.from('email_sequence_steps').insert({
    sequence_id: sequenceId,
    tenant_id:   tenantId,
    step_order:  stepOrder,
    active:      true,
    ...stepColumns(parsed.data),
  })

  if (error) return { ok: false, error: error.message }

  revalidateEmails()
  return { ok: true }
}

export async function updateStep(
  stepId: string,
  fields: StepInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = StepSchema.safeParse(fields)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const ctx = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied
  const supabase = createAdminClient()

  let q = supabase
    .from('email_sequence_steps')
    .update(stepColumns(parsed.data))
    .eq('id', stepId)

  if (ctx.tenant_id) q = q.eq('tenant_id', ctx.tenant_id)

  const { error } = await q
  if (error) return { ok: false, error: error.message }

  revalidateEmails()
  return { ok: true }
}

export async function deleteStep(
  stepId: string,
  sequenceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied
  const supabase = createAdminClient()

  // Guard: don't allow deleting the last step
  const { count } = await supabase
    .from('email_sequence_steps')
    .select('id', { count: 'exact', head: true })
    .eq('sequence_id', sequenceId)

  if ((count ?? 0) <= 1) {
    return { ok: false, error: 'No se puede eliminar el único paso de una secuencia' }
  }

  // Get the step's current order before deleting
  const { data: step } = await supabase
    .from('email_sequence_steps')
    .select('step_order')
    .eq('id', stepId)
    .single()

  if (!step) return { ok: false, error: 'Paso no encontrado' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deletedOrder = (step as any).step_order as number

  let q = supabase.from('email_sequence_steps').delete().eq('id', stepId)
  if (ctx.tenant_id) q = q.eq('tenant_id', ctx.tenant_id)
  const { error } = await q
  if (error) return { ok: false, error: error.message }

  // Decrement step_order for all steps after the deleted one
  const { data: laterSteps } = await supabase
    .from('email_sequence_steps')
    .select('id, step_order')
    .eq('sequence_id', sequenceId)
    .gt('step_order', deletedOrder)

  type StepRow = { id: string; step_order: number }
  for (const s of (laterSteps ?? []) as StepRow[]) {
    await supabase
      .from('email_sequence_steps')
      .update({ step_order: s.step_order - 1 })
      .eq('id', s.id)
  }

  revalidateEmails()
  return { ok: true }
}

export async function moveStep(
  stepId: string,
  sequenceId: string,
  direction: 'up' | 'down',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const supabase = createAdminClient()

  const { data: allSteps } = await supabase
    .from('email_sequence_steps')
    .select('id, step_order')
    .eq('sequence_id', sequenceId)
    .eq('active', true)
    .order('step_order')

  if (!allSteps) return { ok: false, error: 'Error al leer pasos' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const steps = allSteps as any[]
  const idx   = steps.findIndex(s => s.id === stepId)
  if (idx === -1) return { ok: false, error: 'Paso no encontrado' }

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= steps.length) {
    return { ok: false, error: 'El paso ya está en el límite' }
  }

  const a = steps[idx]
  const b = steps[swapIdx]

  // Swap orders
  await Promise.all([
    supabase.from('email_sequence_steps').update({ step_order: b.step_order }).eq('id', a.id),
    supabase.from('email_sequence_steps').update({ step_order: a.step_order }).eq('id', b.id),
  ])

  revalidateEmails()
  return { ok: true }
}

// ─── Vista previa del composer ────────────────────────────────────────────────
// Compila el HTML con el MISMO renderer que usan los envíos (email-render.ts)
// y variables de muestra. La consumen las tres superficies del composer:
// steps de secuencia, correos de compra y envío one-off desde el lead.

const PreviewSchema = z.object({
  subject:  z.string().trim().min(1).max(200),
  content:  EmailContentSchema,
  locale:   z.enum(['es', 'en', 'pt']).default('es'),
  // Solo la respeta super_admin (preview de un tenant específico, p. ej. en el
  // panel de correos de compra); los demás roles usan su propio tenant.
  tenantId: z.string().optional(),
})

export async function previewEmailHtml(
  input: z.infer<typeof PreviewSchema>,
): Promise<{ ok: true; html: string; subject: string } | { ok: false; error: string }> {
  const parsed = PreviewSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const ctx = await getCurrentTenantContext()
  const tenantId = ctx.role === 'super_admin'
    ? (parsed.data.tenantId ?? ctx.tenant_id)
    : ctx.tenant_id

  // Branding real del tenant si hay uno resuelto; genérico si no (super_admin
  // en el hub sin selección).
  let branding = { tenantName: 'ITMANO CRM', primaryColor: '#1E3A5F' }
  if (tenantId) {
    const supabase = createAdminClient()
    const { data } = await supabase.from('tenants').select('name, primary_color').eq('id', tenantId).maybeSingle()
    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = data as any
      branding = { tenantName: t.name as string, primaryColor: (t.primary_color as string) ?? '#1E3A5F' }
    }
  }

  const rendered = renderEmail({
    subject: parsed.data.subject,
    content: parsed.data.content,
    vars: {
      customer_name:    'María',
      agent_name:       'Adriana Melendez',
      agent_email:      'agente@ejemplo.com',
      lead_magnet_name: 'Guía del comprador',
    },
    branding,
    signature:      { agentName: 'Adriana Melendez', agentEmail: 'agente@ejemplo.com' },
    unsubscribeUrl: '#',
    locale:         parsed.data.locale as EmailLocale,
  })

  return { ok: true, html: rendered.html, subject: rendered.subject }
}

// ─── Manual enrollment ────────────────────────────────────────────────────────

export interface BulkEnrollResult {
  enrolled: number
  skipped:  number
  blocked:  number   // leads skipped because email_blocked = true
  errors:   Array<{ leadId: string; reason: string }>
}

export async function addLeadsToSequence(
  leadIds:    string[],
  sequenceId: string,
): Promise<{ ok: true; result: BulkEnrollResult } | { ok: false; error: string }> {
  if (leadIds.length === 0) return { ok: true, result: { enrolled: 0, skipped: 0, blocked: 0, errors: [] } }

  const ctx      = await getCurrentTenantContext()
  // Bulk enrollment from the sequence side is email management — owner / super_admin
  // only. (An agent enrolling their OWN leads would be a future lead-profile action
  // gated by assertCanWriteLead; out of scope here.)
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const supabase = createAdminClient()

  // Verify sequence exists, belongs to tenant, and is manual-type
  let seqQ = supabase
    .from('email_sequences')
    .select('id, tenant_id, activation_type, active')
    .eq('id', sequenceId)
  if (ctx.tenant_id) seqQ = seqQ.eq('tenant_id', ctx.tenant_id)

  const { data: seq } = await seqQ.single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seqRow = seq as any
  if (!seqRow) return { ok: false, error: 'Secuencia no encontrada' }
  if ((seqRow.activation_type as string) !== 'manual') {
    return { ok: false, error: 'Solo se pueden agregar leads manualmente a secuencias de tipo manual' }
  }
  if (!seqRow.active) return { ok: false, error: 'La secuencia está inactiva' }

  // Fetch the first active step
  const { data: firstStepRows } = await supabase
    .from('email_sequence_steps')
    .select('step_order, delay_hours')
    .eq('sequence_id', sequenceId)
    .eq('active', true)
    .order('step_order', { ascending: true })
    .limit(1)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firstStep = (firstStepRows as any[])?.[0] ?? null
  if (!firstStep) return { ok: false, error: 'La secuencia no tiene pasos activos' }

  // Fetch leads that already have an active run in this sequence (to skip)
  const { data: activeRunRows } = await supabase
    .from('lead_sequence_runs')
    .select('lead_id')
    .eq('sequence_id', sequenceId)
    .eq('status', 'active')
    .in('lead_id', leadIds)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const alreadyActive = new Set((activeRunRows as any[] ?? []).map((r: any) => r.lead_id as string))

  // Fetch leads whose email channel is permanently blocked — do not enroll them.
  const { data: blockedLeadRows } = await supabase
    .from('leads')
    .select('id')
    .eq('email_blocked', true)
    .in('id', leadIds)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emailBlocked = new Set((blockedLeadRows as any[] ?? []).map((r: any) => r.id as string))

  const nextSendAt = new Date(
    Date.now() + (firstStep.delay_hours ?? 0) * 60 * 60 * 1000
  ).toISOString()

  const result: BulkEnrollResult = { enrolled: 0, skipped: 0, blocked: 0, errors: [] }

  for (const leadId of leadIds) {
    if (alreadyActive.has(leadId)) {
      result.skipped++
      continue
    }

    if (emailBlocked.has(leadId)) {
      result.blocked++
      continue
    }

    const { data: inserted, error } = await supabase.from('lead_sequence_runs').insert({
      tenant_id:          seqRow.tenant_id as string,
      lead_id:            leadId,
      sequence_id:        sequenceId,
      current_step_order: firstStep.step_order,
      status:             'active',
      next_send_at:       nextSendAt,
    }).select('id').single()

    if (error) {
      result.errors.push({ leadId, reason: error.message })
      continue
    }
    result.enrolled++

    // Send the first email immediately, in-process (same pattern as
    // enrollLeadInSequence). A failure never rolls back the enrollment —
    // the hourly cron will retry.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runId = (inserted as any).id as string
    try {
      const proc = await processSequenceRun({ db: supabase, runId })
      console.info(JSON.stringify({
        service: 'add-leads-to-sequence',
        result:  'first_email_processed',
        run_id:  runId,
        lead_id: leadId,
        action:  proc.action,
        reason:  proc.reason,
      }))
    } catch (err) {
      console.warn(JSON.stringify({
        service: 'add-leads-to-sequence',
        result:  'first_email_failed',
        run_id:  runId,
        lead_id: leadId,
        error:   err instanceof Error ? err.message : String(err),
      }))
    }
  }

  revalidateEmails()
  revalidatePath('/leads')
  return { ok: true, result }
}
