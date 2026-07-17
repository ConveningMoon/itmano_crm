'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { createPlatformRequest } from '@/lib/services/platform-requests'
import { getAiLimitStatus } from '@/lib/services/ai-limit'
import { getSubscription } from '@/lib/data/subscriptions'
import { PLAN_CONFIG, SUBSCRIPTION_STATUS_LABELS } from '@/lib/subscriptions'
import { ROLE_LABELS } from '@/components/layout/nav-items'

// Identidad del solicitante (tenant + usuario), adjuntada a cada solicitud
// para que soporte sepa quién escribe sin pedírselo en el formulario.
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
// Se registra como platform_request (kind='support') — el super_admin lo
// gestiona en /solicitudes y recibe el aviso por Telegram.

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

  return createPlatformRequest({
    kind:            'support',
    tenant_id:       ctx.tenant_id,
    tenant_name:     tenantName,
    requester_email: email,
    requester_role:  ROLE_LABELS[ctx.role],
    category,
    subject,
    message,
    metadata:        { category_label: CATEGORY_LABELS[category] },
  })
}

// ─── Solicitud de más capacidad de IA ─────────────────────────────────────────
// Solo el owner/super_admin la envía (los agentes no gestionan el límite). La
// solicitud incluye el estado interno del límite en USD en metadata — solo lo
// ve el super_admin en /solicitudes, nunca el cliente.

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

  // Estado interno (USD) para que soporte dimensione el aumento — solo en metadata.
  const [status, subscription] = await Promise.all([
    getAiLimitStatus(ctx.tenant_id),
    getSubscription(ctx.tenant_id),
  ])
  const planLabel = subscription ? PLAN_CONFIG[subscription.plan].label : '—'
  const statusLabel = subscription ? SUBSCRIPTION_STATUS_LABELS[subscription.status] : '—'
  const usage = status.unlimited
    ? 'Ilimitado'
    : `$${status.usedUsd.toFixed(2)} de $${status.limitUsd.toFixed(2)} (${Math.round(status.usedRatio * 100)}%)`

  return createPlatformRequest({
    kind:            'support',
    tenant_id:       ctx.tenant_id,
    tenant_name:     tenantName,
    requester_email: email,
    requester_role:  ROLE_LABELS[ctx.role],
    category:        'ai_capacity',
    subject:         `Aumento de capacidad de IA — ${tenantName}`,
    message:         parsed.data.reason,
    metadata: {
      plan:         planLabel,
      plan_status:  statusLabel,
      ai_usage:     usage,
      ...(parsed.data.estimate ? { estimate: parsed.data.estimate } : {}),
    },
  })
}
