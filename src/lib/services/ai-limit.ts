import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TenantContext } from '@/lib/auth/tenant-context'
import { getTenantAccessFor } from '@/lib/subscriptions/access-server'
import { isCoreFeature, reserveUsdFor, discretionaryLimitUsd, ceilingUsdFor } from '@/lib/services/ai-budget'
import type { AiFeature } from '@/lib/services/ai-feature-labels'
import type { SubscriptionPlan } from '@/lib/subscriptions'
import { isLocalAiSpendBlocked, LOCAL_AI_SPEND_MESSAGE } from '@/lib/services/ai-guard'

// ── Límite mensual de IA por tenant ──────────────────────────────────────────
// El tope (tenants.ai_monthly_limit_usd, default $10) aplica sobre la suma de
// ai_usage_events.cost_usd del MES CALENDARIO en curso (UTC). Tenants con
// ai_unlimited = true no tienen tope. El super_admin siempre pasa.
//
// El gate se evalúa ANTES de llamar a la Claude API — un request ya iniciado
// nunca se corta a la mitad, así que el gasto real puede excederse por el
// costo de un solo request (~centavos); aceptable por diseño.
//
// El tope está partido en dos tramos (ver ai-budget.ts): lo discrecional se
// corta en "tope - reserva" y el núcleo —el análisis de fit, que corre solo—
// llega hasta el tope entero. Por eso casi todo lo de aquí abajo viene por
// duplicado.

export interface AiLimitStatus {
  unlimited:    boolean
  plan:         SubscriptionPlan
  limitUsd:     number
  usedUsd:      number
  /** Los últimos dólares del tope, sólo para el núcleo. 0 si unlimited. */
  reserveUsd:   number
  /** limitUsd - reserveUsd: el techo de todo lo que se pulsa a mano. */
  discretionaryLimitUsd: number
  remainingUsd: number
  /**
   * Consumo contra el techo DISCRECIONAL, acotado a [0, 1] (0 si unlimited).
   *
   * Contra el discrecional y no contra el tope a propósito: es el número que
   * ve el usuario, y tiene que marcar 100% justo cuando deja de poder generar.
   * Medirlo contra el tope entero le diría "83%" mientras la UI lo bloquea.
   */
  usedRatio:    number
  /** Al tope completo: ni siquiera el núcleo puede gastar. */
  blocked:      boolean
  /** En "tope - reserva": lo que se pulsa a mano se para; el núcleo sigue. */
  blockedDiscretionary: boolean
}

function monthStartIso(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

/**
 * Estado del límite mensual de un tenant. Tres queries baratas (config del
 * tenant + plan + suma del mes); volúmenes actuales no justifican cachear.
 *
 * El plan hace falta porque la reserva del núcleo se declara por plan en
 * plans.ts. Un tenant sin fila de subscriptions cae a 'esencial', que es la
 * reserva más pequeña: ante la duda, no le quitamos presupuesto a nadie.
 */
export async function getAiLimitStatus(tenantId: string): Promise<AiLimitStatus> {
  const supabase = createAdminClient()

  const [{ data: tenant }, { data: sub }, { data: events }] = await Promise.all([
    supabase.from('tenants').select('ai_monthly_limit_usd, ai_unlimited').eq('id', tenantId).maybeSingle(),
    supabase.from('subscriptions').select('plan').eq('tenant_id', tenantId).maybeSingle(),
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plan = ((sub as any)?.plan as SubscriptionPlan | undefined) ?? 'esencial'

  let usedUsd = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (events ?? []) as any[]) usedUsd += Number(e.cost_usd)
  usedUsd = Math.round(usedUsd * 1_000_000) / 1_000_000

  // Un tenant ilimitado no reserva nada: no hay escasez que repartir.
  const reserveUsd   = unlimited ? 0 : reserveUsdFor(plan, limitUsd)
  const discrecional = unlimited ? limitUsd : discretionaryLimitUsd(plan, limitUsd)
  const remainingUsd = unlimited ? Infinity : Math.max(0, limitUsd - usedUsd)

  return {
    unlimited,
    plan,
    limitUsd,
    usedUsd,
    reserveUsd,
    discretionaryLimitUsd: discrecional,
    remainingUsd: unlimited ? Number.MAX_SAFE_INTEGER : remainingUsd,
    usedRatio:    unlimited || discrecional <= 0 ? 0 : Math.min(1, usedUsd / discrecional),
    // Mismo techo que reparte ai-budget.ts: núcleo llega al tope entero,
    // discrecional se para en "tope - reserva". ceilingUsdFor es la única
    // idea de dónde está cada línea — antes se repetía a mano aquí.
    blocked:              !unlimited && usedUsd >= ceilingUsdFor(plan, limitUsd, true),
    blockedDiscretionary: !unlimited && usedUsd >= ceilingUsdFor(plan, limitUsd, false),
  }
}

// ── Reparto por agente (plan Partner) ─────────────────────────────────────────
// En Partner el equipo tiene varios logins, así que el presupuesto mensual del
// tenant se reparte en PARTES IGUALES entre los agentes del equipo (todas las
// filas de `agents` del tenant, incluido el agente vinculado al owner). Un
// tenant con ai_unlimited = true no reparte nada. La atribución de cada request
// vive en ai_usage_events.agent_id (migración 056).
//
// Lo que se reparte es el tramo DISCRECIONAL, no el tope entero: si no, el
// equipo podría comerse entre todos la reserva del análisis de leads, que es
// justo lo que la reserva existe para impedir.
//
// Que la cuenta cuadre depende de un detalle de ai-lead-fit.ts: registra su
// gasto con `userId: null`, así que recordAiUsage nunca le pone agent_id y el
// consumo del núcleo NO entra en la parte de nadie. Si algún día el análisis
// pasara a atribuirse a un agente, este reparto empezaría a cobrarle al agente
// un gasto que él no decidió.

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
 * Parte del tramo DISCRECIONAL que le corresponde a un agente. null cuando el
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
  const shareUsd = discretionaryLimitUsd('partner', limitUsd) / agentCount

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
  // `blockedDiscretionary` y no `blocked`: este indicador describe lo que el
  // usuario puede pulsar. Con el tramo discrecional agotado la barra tiene que
  // pintarse llena y en rojo aunque el tenant conserve la reserva del núcleo —
  // si no, la UI dice "queda saldo" y el botón devuelve un error.
  return { unlimited: s.unlimited, usedRatio: s.usedRatio, blocked: s.blockedDiscretionary, perAgent: false }
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
 *
 * `feature` no es decorativo: decide contra QUÉ techo se mide. Las del núcleo
 * (ai-budget.ts) llegan al tope entero; el resto se para en la reserva. Es
 * obligatorio a propósito — un llamador nuevo tiene que decidir de qué lado
 * cae en vez de heredar el más permisivo por olvido.
 */
export async function assertAiWithinLimit(
  ctx: TenantContext,
  feature: AiFeature,
): Promise<{ ok: false; error: string } | null> {
  // Freno de entorno ANTES que nada, incluido el bypass de super_admin: quien
  // prueba en local es justamente el super_admin, y allí el contador del mes
  // vive en el sandbox, así que este tope no puede verlo. Ver ai-guard.ts.
  if (isLocalAiSpendBlocked()) return { ok: false, error: LOCAL_AI_SPEND_MESSAGE }

  if (ctx.role === 'super_admin') return null
  if (!ctx.tenant_id) return { ok: false, error: 'Acceso no autorizado' }

  // Suscripción inactiva: la IA se apaga por completo (spec §6.2). Va DESPUÉS
  // de la comprobación de super_admin — un operador ITMANO inspeccionando un
  // tenant caído no debe quedar bloqueado por la suscripción de ese tenant.
  const access = await getTenantAccessFor(ctx.tenant_id)
  if (!access.canUseAi) {
    return {
      ok: false,
      error: 'La generación con IA está en pausa porque tu suscripción está inactiva. Reactívala desde Configuración para volver a usarla.',
    }
  }

  const status = await getAiLimitStatus(ctx.tenant_id)
  const core = isCoreFeature(feature)

  // Sin montos en los mensajes: el límite en USD es información interna de ITMANO.
  if (status.blocked) {
    return {
      ok: false,
      error: 'Tu equipo alcanzó el límite mensual de generación con IA. El contador se reinicia el día 1 del próximo mes; si necesitas ampliarlo, contacta a ITMANO.',
    }
  }
  // Queda presupuesto, pero es el reservado. Decirlo importa: si no, el usuario
  // lee "alcanzaste el límite" sabiendo que sobra saldo y parece un error.
  if (!core && status.blockedDiscretionary) {
    return {
      ok: false,
      error: 'Tu equipo alcanzó el límite mensual de generación con IA. Lo que queda está reservado para el análisis automático de cada lead, que sigue funcionando. El contador se reinicia el día 1 del próximo mes; si necesitas ampliarlo, contacta a ITMANO.',
    }
  }
  if (status.unlimited) return null
  // El núcleo no reparte por agente: no lo dispara un login, lo dispara un lead
  // que entró por un formulario.
  if (core) return null

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
