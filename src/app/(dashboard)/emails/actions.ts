'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'

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
  tenantId:       z.string().optional(), // required for super_admin
})

export async function createSequence(
  fields: z.infer<typeof SequenceSchema>
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = SequenceSchema.safeParse(fields)
  if (!parsed.success) return { ok: false, error: 'Datos inválidos' }

  const tenantId = await getTenantId(parsed.data.tenantId)
  if (typeof tenantId === 'object') return { ok: false, error: tenantId.error }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('email_sequences')
    .insert({
      tenant_id:       tenantId,
      name:            parsed.data.name.trim(),
      language:        parsed.data.language,
      description:     parsed.data.description?.trim() || null,
      activation_type: parsed.data.activationType,
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
  fields: { name: string; language: string; description?: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!fields.name.trim()) return { ok: false, error: 'El nombre es obligatorio' }

  const ctx = await getCurrentTenantContext()
  const supabase = createAdminClient()

  let q = supabase
    .from('email_sequences')
    .update({
      name:        fields.name.trim(),
      language:    fields.language,
      description: fields.description?.trim() || null,
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

const StepSchema = z.object({
  delayHours:        z.number().int().min(0),
  resendTemplateId:  z.string().min(1).max(200),
})

export async function addStep(
  sequenceId: string,
  fields: z.infer<typeof StepSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = StepSchema.safeParse(fields)
  if (!parsed.success) return { ok: false, error: 'Datos inválidos' }

  const ctx = await getCurrentTenantContext()
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
    sequence_id:       sequenceId,
    tenant_id:         tenantId,
    step_order:        stepOrder,
    delay_hours:       parsed.data.delayHours,
    resend_template_id: parsed.data.resendTemplateId.trim(),
    active:            true,
  })

  if (error) return { ok: false, error: error.message }

  revalidateEmails()
  return { ok: true }
}

export async function updateStep(
  stepId: string,
  fields: z.infer<typeof StepSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = StepSchema.safeParse(fields)
  if (!parsed.success) return { ok: false, error: 'Datos inválidos' }

  const ctx = await getCurrentTenantContext()
  const supabase = createAdminClient()

  let q = supabase
    .from('email_sequence_steps')
    .update({
      delay_hours:        parsed.data.delayHours,
      resend_template_id: parsed.data.resendTemplateId.trim(),
    })
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

// ─── Manual enrollment ────────────────────────────────────────────────────────

export interface BulkEnrollResult {
  enrolled: number
  skipped:  number
  errors:   Array<{ leadId: string; reason: string }>
}

export async function addLeadsToSequence(
  leadIds:    string[],
  sequenceId: string,
): Promise<{ ok: true; result: BulkEnrollResult } | { ok: false; error: string }> {
  if (leadIds.length === 0) return { ok: true, result: { enrolled: 0, skipped: 0, errors: [] } }

  const ctx      = await getCurrentTenantContext()
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

  const nextSendAt = new Date(
    Date.now() + (firstStep.delay_hours ?? 0) * 60 * 60 * 1000
  ).toISOString()

  const result: BulkEnrollResult = { enrolled: 0, skipped: 0, errors: [] }

  for (const leadId of leadIds) {
    if (alreadyActive.has(leadId)) {
      result.skipped++
      continue
    }

    const { error } = await supabase.from('lead_sequence_runs').insert({
      tenant_id:          seqRow.tenant_id as string,
      lead_id:            leadId,
      sequence_id:        sequenceId,
      current_step_order: firstStep.step_order,
      status:             'active',
      next_send_at:       nextSendAt,
    })

    if (error) {
      result.errors.push({ leadId, reason: error.message })
    } else {
      result.enrolled++
    }
  }

  revalidateEmails()
  revalidatePath('/leads')
  return { ok: true, result }
}
