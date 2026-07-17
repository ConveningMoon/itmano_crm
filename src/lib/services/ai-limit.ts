import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TenantContext } from '@/lib/auth/tenant-context'

// ── Límite mensual de IA por tenant ──────────────────────────────────────────
// El tope (tenants.ai_monthly_limit_usd, default $10) aplica sobre la suma de
// ai_usage_events.cost_usd del MES CALENDARIO en curso (UTC). Tenants con
// ai_unlimited = true no tienen tope. El super_admin siempre pasa.
//
// El gate se evalúa ANTES de llamar a la Claude API — un request ya iniciado
// nunca se corta a la mitad, así que el gasto real puede excederse por el
// costo de un solo request (~centavos); aceptable por diseño.

export interface AiLimitStatus {
  unlimited:    boolean
  limitUsd:     number
  usedUsd:      number
  remainingUsd: number
  // usedUsd / limitUsd acotado a [0, 1] (0 si unlimited).
  usedRatio:    number
  blocked:      boolean
}

function monthStartIso(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

/**
 * Estado del límite mensual de un tenant. Dos queries baratas (config del
 * tenant + suma del mes); volúmenes actuales no justifican cachear.
 */
export async function getAiLimitStatus(tenantId: string): Promise<AiLimitStatus> {
  const supabase = createAdminClient()

  const [{ data: tenant }, { data: events }] = await Promise.all([
    supabase.from('tenants').select('ai_monthly_limit_usd, ai_unlimited').eq('id', tenantId).maybeSingle(),
    supabase
      .from('ai_usage_events')
      .select('cost_usd')
      .eq('tenant_id', tenantId)
      .gte('created_at', monthStartIso()),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = tenant as any
  const unlimited = (t?.ai_unlimited as boolean) ?? false
  const limitUsd  = Number(t?.ai_monthly_limit_usd ?? 10)

  let usedUsd = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (events ?? []) as any[]) usedUsd += Number(e.cost_usd)
  usedUsd = Math.round(usedUsd * 1_000_000) / 1_000_000

  const remainingUsd = unlimited ? Infinity : Math.max(0, limitUsd - usedUsd)
  return {
    unlimited,
    limitUsd,
    usedUsd,
    remainingUsd: unlimited ? Number.MAX_SAFE_INTEGER : remainingUsd,
    usedRatio:    unlimited || limitUsd <= 0 ? 0 : Math.min(1, usedUsd / limitUsd),
    blocked:      !unlimited && usedUsd >= limitUsd,
  }
}

// ── Reparto por agente (plan Partner) ─────────────────────────────────────────
// En Partner el equipo tiene varios logins, así que el presupuesto mensual del
// tenant se reparte en PARTES IGUALES entre los agentes del equipo (todas las
// filas de `agents` del tenant, incluido el agente vinculado al owner). Un
// tenant con ai_unlimited = true no reparte nada. La atribución de cada request
// vive en ai_usage_events.agent_id (migración 056).

/** agents.id vinculado a un login (agents.user_id = auth uid), o null. */
export async function getLinkedAgentId(userId: string, tenantId: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('agents')
    .select('id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data as any)?.id as string | undefined) ?? null
}

export interface AgentAiShare {
  agentId:    string
  agentCount: number
  shareUsd:   number
  usedUsd:    number
  usedRatio:  number
  blocked:    boolean
}

/**
 * Parte del límite mensual que le corresponde a un agente. null cuando el
 * reparto no aplica: tenant ilimitado, plan distinto de Partner, o tenant sin
 * agentes registrados.
 */
export async function getAgentAiShare(tenantId: string, agentId: string): Promise<AgentAiShare | null> {
  const supabase = createAdminClient()

  const [{ data: tenant }, { data: sub }, agentsRes, { data: events }] = await Promise.all([
    supabase.from('tenants').select('ai_monthly_limit_usd, ai_unlimited').eq('id', tenantId).maybeSingle(),
    supabase.from('subscriptions').select('plan').eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('agents').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase
      .from('ai_usage_events')
      .select('cost_usd')
      .eq('tenant_id', tenantId)
      .eq('agent_id', agentId)
      .gte('created_at', monthStartIso()),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = tenant as any
  if ((t?.ai_unlimited as boolean) ?? false) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (((sub as any)?.plan as string | undefined) !== 'partner') return null

  const agentCount = agentsRes.count ?? 0
  if (agentCount <= 0) return null

  const limitUsd = Number(t?.ai_monthly_limit_usd ?? 10)
  const shareUsd = limitUsd / agentCount

  let usedUsd = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (events ?? []) as any[]) usedUsd += Number(e.cost_usd)
  usedUsd = Math.round(usedUsd * 1_000_000) / 1_000_000

  return {
    agentId,
    agentCount,
    shareUsd,
    usedUsd,
    usedRatio: shareUsd <= 0 ? 0 : Math.min(1, usedUsd / shareUsd),
    blocked:   usedUsd >= shareUsd,
  }
}

// Versión para la UI de usuarios del tenant. DELIBERADAMENTE sin montos USD:
// el costo/límite en dólares es información interna de ITMANO (solo visible en
// el Centro de control). El cliente solo recibe el porcentaje consumido.
export interface AiLimitIndicator {
  unlimited: boolean
  usedRatio: number
  blocked:   boolean
  // true cuando el porcentaje es la PARTE del agente (Partner), no el total.
  perAgent:  boolean
}

export async function getAiLimitIndicator(tenantId: string): Promise<AiLimitIndicator> {
  const s = await getAiLimitStatus(tenantId)
  return { unlimited: s.unlimited, usedRatio: s.usedRatio, blocked: s.blocked, perAgent: false }
}

/**
 * Indicador según el viewer: un rol 'agent' en un tenant Partner ve el
 * porcentaje de SU parte; los demás ven el total del tenant.
 */
export async function getAiLimitIndicatorFor(ctx: TenantContext): Promise<AiLimitIndicator | null> {
  if (!ctx.tenant_id) return null
  if (ctx.role === 'agent' && ctx.agent_id) {
    const share = await getAgentAiShare(ctx.tenant_id, ctx.agent_id)
    if (share) {
      return { unlimited: false, usedRatio: share.usedRatio, blocked: share.blocked, perAgent: true }
    }
  }
  return getAiLimitIndicator(ctx.tenant_id)
}

/**
 * Gate para las server actions de IA. Devuelve null si puede generar, o un
 * `{ ok: false, error }` listo para retornar (mismo patrón que los guards de
 * auth). super_admin siempre pasa — el costo es de ITMANO.
 *
 * Dos capas: el tope del tenant (siempre) y, en plan Partner, la parte igual
 * del agente vinculado al login que genera.
 */
export async function assertAiWithinLimit(
  ctx: TenantContext,
): Promise<{ ok: false; error: string } | null> {
  if (ctx.role === 'super_admin') return null
  if (!ctx.tenant_id) return { ok: false, error: 'Acceso no autorizado' }

  const status = await getAiLimitStatus(ctx.tenant_id)
  if (status.blocked) {
    // Sin montos en el mensaje: el límite en USD es información interna de ITMANO.
    return {
      ok: false,
      error: 'Tu equipo alcanzó el límite mensual de generación con IA. El contador se reinicia el día 1 del próximo mes; si necesitas ampliarlo, contacta a ITMANO.',
    }
  }
  if (status.unlimited) return null

  // Parte por agente (solo Partner). El owner también reparte si su login está
  // vinculado a un agente del equipo; un login sin agente vinculado solo está
  // sujeto al tope del tenant.
  const agentId = ctx.agent_id ?? (await getLinkedAgentId(ctx.user_id, ctx.tenant_id))
  if (!agentId) return null

  const share = await getAgentAiShare(ctx.tenant_id, agentId)
  if (share?.blocked) {
    return {
      ok: false,
      error: 'Alcanzaste tu parte del límite mensual de IA del equipo. Se reinicia el día 1 del próximo mes; si necesitas más, pídele al propietario que lo amplíe con ITMANO.',
    }
  }
  return null
}
