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

// Versión serializable para la UI (sin Infinity — cruza la frontera RSC/client).
export interface AiLimitIndicator {
  unlimited: boolean
  limitUsd:  number
  usedUsd:   number
  usedRatio: number
  blocked:   boolean
}

export async function getAiLimitIndicator(tenantId: string): Promise<AiLimitIndicator> {
  const s = await getAiLimitStatus(tenantId)
  return { unlimited: s.unlimited, limitUsd: s.limitUsd, usedUsd: s.usedUsd, usedRatio: s.usedRatio, blocked: s.blocked }
}

/**
 * Gate para las server actions de IA. Devuelve null si puede generar, o un
 * `{ ok: false, error }` listo para retornar (mismo patrón que los guards de
 * auth). super_admin siempre pasa — el costo es de ITMANO.
 */
export async function assertAiWithinLimit(
  ctx: TenantContext,
): Promise<{ ok: false; error: string } | null> {
  if (ctx.role === 'super_admin') return null
  if (!ctx.tenant_id) return { ok: false, error: 'Acceso no autorizado' }

  const status = await getAiLimitStatus(ctx.tenant_id)
  if (!status.blocked) return null

  return {
    ok: false,
    error: `Tu equipo alcanzó el límite mensual de IA ($${status.limitUsd.toFixed(2)}). El contador se reinicia el día 1 del próximo mes; si necesitas ampliarlo, contacta a ITMANO.`,
  }
}
