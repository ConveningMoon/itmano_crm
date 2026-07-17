'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { sendSupportEmail } from '@/lib/services/support-email'
import { getAiLimitStatus } from '@/lib/services/ai-limit'
import { getSubscription } from '@/lib/data/subscriptions'
import { PLAN_CONFIG, SUBSCRIPTION_STATUS_LABELS } from '@/lib/subscriptions'
import { ROLE_LABELS } from '@/components/layout/nav-items'

// Identidad del solicitante (tenant + usuario), adjuntada a cada correo para
// que soporte sepa quién escribe sin pedírselo en el formulario.
async function requesterContext() {
  const ctx = await getCurrentTenantContext()
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  const email = user?.email ?? '(desconocido)'

  let tenantName = ctx.tenant_id ?? 'ITMANO (sin tenant)'
  if (ctx.tenant_id) {
    const admin = createAdminClient()
    const { data } = await admin.from('tenants').select('name').eq('id', ctx.tenant_id).maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tenantName = ((data as any)?.name as string | undefined) ?? ctx.tenant_id
  }
  return { ctx, email, tenantName }
}

// ─── Soporte técnico ──────────────────────────────────────────────────────────

const CATEGORIES = ['problema', 'pregunta', 'cambio', 'otro'] as const
const CATEGORY_LABELS: Record<(typeof CATEGORIES)[number], string> = {
  problema: 'Problema técnico',
  pregunta: 'Pregunta sobre el uso',
  cambio:   'Solicitud de cambio',
  otro:     'Otro',
}

const SupportSchema = z.object({
  category: z.enum(CATEGORIES),
  subject:  z.string().trim().min(3, 'Escribe un asunto.').max(160),
  message:  z.string().trim().min(10, 'Cuéntanos un poco más — mínimo 10 caracteres.').max(4000),
  website:  z.string().max(0).optional().or(z.literal('')), // honeypot
})

export type SupportInput = z.input<typeof SupportSchema>

export async function submitSupportRequest(
  input: SupportInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = SupportSchema.safeParse(input)
  if (!parsed.success) {
    if (parsed.error.issues.some(i => i.path[0] === 'website')) return { ok: true }
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisa los campos del formulario.' }
  }
  if (parsed.data.website) return { ok: true }

  const { ctx, email, tenantName } = await requesterContext()
  const { category, subject, message } = parsed.data

  return sendSupportEmail({
    subject: `[Soporte · ${CATEGORY_LABELS[category]}] ${subject} — ${tenantName}`,
    replyTo: email,
    lines: [
      `Categoría: ${CATEGORY_LABELS[category]}`,
      `Equipo: ${tenantName} (${ctx.tenant_id ?? '—'})`,
      `Usuario: ${email} · ${ROLE_LABELS[ctx.role]}`,
      '',
      `Asunto: ${subject}`,
      '',
      'Mensaje:',
      message,
    ],
  })
}

// ─── Solicitud de más capacidad de IA ─────────────────────────────────────────
// Solo el owner/super_admin la envía (los agentes no gestionan el límite). El
// correo incluye el estado interno del límite en USD — va al buzón de ITMANO,
// nunca se muestra al cliente.

const AiCapacitySchema = z.object({
  reason:   z.string().trim().min(10, 'Cuéntanos por qué necesitas más capacidad — mínimo 10 caracteres.').max(2000),
  estimate: z.string().trim().max(300).optional().or(z.literal('')),
})

export type AiCapacityInput = z.input<typeof AiCapacitySchema>

export async function requestAiCapacityIncrease(
  input: AiCapacityInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = AiCapacitySchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisa los campos del formulario.' }
  }

  const { ctx, email, tenantName } = await requesterContext()
  if (ctx.role === 'agent') {
    return { ok: false, error: 'Solo el propietario del equipo puede solicitar más capacidad de IA.' }
  }
  if (!ctx.tenant_id) return { ok: false, error: 'Selecciona un equipo primero.' }

  // Estado interno (USD) para que soporte dimensione el aumento — solo en el correo.
  const [status, subscription] = await Promise.all([
    getAiLimitStatus(ctx.tenant_id),
    getSubscription(ctx.tenant_id),
  ])
  const planLabel = subscription ? PLAN_CONFIG[subscription.plan].label : '—'
  const statusLabel = subscription ? SUBSCRIPTION_STATUS_LABELS[subscription.status] : '—'
  const usage = status.unlimited
    ? 'Ilimitado'
    : `$${status.usedUsd.toFixed(2)} de $${status.limitUsd.toFixed(2)} (${Math.round(status.usedRatio * 100)}%)`

  return sendSupportEmail({
    subject: `[IA · Aumento de capacidad] ${tenantName}`,
    replyTo: email,
    lines: [
      `Equipo: ${tenantName} (${ctx.tenant_id})`,
      `Solicitante: ${email} · ${ROLE_LABELS[ctx.role]}`,
      `Plan: ${planLabel} · ${statusLabel}`,
      `Uso de IA del mes: ${usage}`,
      '',
      'Motivo:',
      parsed.data.reason,
      ...(parsed.data.estimate ? ['', `Estimación de uso adicional: ${parsed.data.estimate}`] : []),
    ],
  })
}
