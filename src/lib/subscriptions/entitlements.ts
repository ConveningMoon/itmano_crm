// Derechos por plan: la regla ÚNICA de qué puede hacer un tenant según su plan,
// su estado de suscripción y lo que ya usa. Pura: sin red, sin Supabase, sin
// `server-only`. Cada server action consulta este objeto en vez de comparar
// topes por su cuenta; el uso (conteos) lo entrega quien llama.
//
// Combina dos fuentes: los topes del plan (`PLANS`) y el modo degradado de
// `getTenantAccess`. Los mensajes nombran el límite, el uso y el plan que
// incluye más; nunca llevan dólares (superficie del tenant).

import { PLANS } from '@/lib/plans'
import { getTenantAccess, type AccessInput } from '@/lib/subscriptions/access'
import type { SubscriptionPlan } from '@/lib/subscriptions'

export type EntitlementKey =
  | 'publishProperty'
  | 'aiPropertyIntake'
  | 'createLead'
  | 'automatedEmail'
  | 'manualEmail'
  | 'createAgent'
  | 'teamAnalytics'

export type EntitlementState = 'ok' | 'warn' | 'blocked'

export interface Entitlement {
  allowed: boolean
  state: EntitlementState
  /** null = ilimitado (o no aplica). */
  limit: number | null
  used: number | null
  message: string | null
  /** Plan que levanta el bloqueo; null si no hay plan que lo resuelva. */
  upgradeTo: SubscriptionPlan | null
}

export interface TenantUsage {
  leads: number
  agents: number
  publishedProperties: number
  emailsMonth: number
}

export interface EntitlementsInput extends AccessInput {
  usage: TenantUsage
  /** super_admin salta leads, publicación y agentes; no correos ni IA. */
  isSuperAdmin?: boolean
  /** Filas que la operación en curso añadiría (importación). Sólo aplica a leads. */
  extraRows?: number
}

// Aritmética entera a propósito: `1.1 * 2500` da 2750.0000000000005 en punto
// flotante y `Math.ceil` lo subiría a 2751, un lead de más en cada tope.
/** Avisa desde el 80 % del tope y bloquea desde el 110 % (límite blando). */
export function leadThresholds(limit: number): { warnAt: number; blockAt: number } {
  return {
    warnAt: Math.ceil((limit * 8) / 10),
    blockAt: Math.ceil((limit * 11) / 10),
  }
}

const num = (n: number) => n.toLocaleString('es-MX')

const NEXT_PLAN: Record<SubscriptionPlan, SubscriptionPlan | null> = {
  esencial: 'growth',
  growth: 'partner',
  partner: null,
}

const OK: Entitlement = { allowed: true, state: 'ok', limit: null, used: null, message: null, upgradeTo: null }

function blocked(over: Partial<Entitlement> & { message: string }): Entitlement {
  return { allowed: false, state: 'blocked', limit: null, used: null, upgradeTo: null, ...over }
}

export function getEntitlements(input: EntitlementsInput): Record<EntitlementKey, Entitlement> {
  const { usage, plan } = input
  const definition = PLANS[plan]
  const planLabel = (p: SubscriptionPlan | null) => (p ? PLANS[p].label : null)

  // Cortesía (billing_exempt): todo permitido, sin contar nada.
  if (input.billingExempt) {
    return {
      publishProperty: OK, aiPropertyIntake: OK, createLead: OK, automatedEmail: OK,
      manualEmail: OK, createAgent: OK, teamAnalytics: OK,
    }
  }

  const access = getTenantAccess(input)
  const degraded = access.monthlyEmailQuota !== null
  const skip = input.isSuperAdmin === true
  const next = NEXT_PLAN[plan]

  // ── Propiedades publicadas ────────────────────────────────────────────────
  let publishProperty: Entitlement
  if (skip) {
    publishProperty = OK
  } else {
    const planCap = definition.limits.webProperties === null ? 0
      : definition.limits.webProperties === 'unlimited' ? null
      : definition.limits.webProperties
    const caps = [planCap, access.publishedPropertiesCap].filter((c): c is number => c !== null)
    const cap = caps.length ? Math.min(...caps) : null
    const used = usage.publishedProperties
    if (cap === null || used < cap) {
      publishProperty = { ...OK, limit: cap, used }
    } else if (planCap === 0) {
      publishProperty = blocked({
        limit: 0, used, upgradeTo: 'growth',
        message: 'Tu plan Esencial no incluye propiedades en tu sitio web. Growth las incluye.',
      })
    } else if (degraded && cap === access.publishedPropertiesCap) {
      publishProperty = blocked({
        limit: cap, used,
        message: `Con tu suscripción inactiva puedes mantener ${num(cap)} propiedades publicadas (tienes ${num(used)}). Reactívala para publicar más.`,
      })
    } else {
      publishProperty = blocked({
        limit: cap, used, upgradeTo: next,
        message: `Llegaste al tope de ${num(cap)} propiedades publicadas de tu plan ${definition.label}.${next ? ` ${planLabel(next)} incluye más.` : ''}`,
      })
    }
  }

  // ── Intake con IA ─────────────────────────────────────────────────────────
  let aiPropertyIntake: Entitlement
  if (!definition.features.aiPropertyIntake) {
    aiPropertyIntake = blocked({
      upgradeTo: 'growth',
      message: 'Crear propiedades con IA desde un PDF está incluido desde el plan Growth.',
    })
  } else if (!access.canUseAi) {
    aiPropertyIntake = blocked({
      message: 'La IA está en pausa mientras tu suscripción esté inactiva. Reactívala para volver a usarla.',
    })
  } else {
    aiPropertyIntake = OK
  }

  // ── Leads (límite blando) ─────────────────────────────────────────────────
  let createLead: Entitlement
  const leadLimit = definition.limits.leads
  if (skip || leadLimit === 'unlimited') {
    createLead = { ...OK, used: usage.leads }
  } else {
    const { warnAt, blockAt } = leadThresholds(leadLimit)
    const used = usage.leads
    // Crear uno equivale a una fila; una importación suma las suyas. Puede
    // llegar exactamente a `blockAt`, no pasarlo.
    const incoming = Math.max(1, input.extraRows ?? 0)
    if (used + incoming > blockAt) {
      const fit = Math.max(0, blockAt - used)
      createLead = blocked({
        limit: leadLimit, used, upgradeTo: next,
        message: (input.extraRows ?? 0) > 1
          ? `Esta importación pasaría el máximo de tu plan ${definition.label} (${num(leadLimit)} leads, tienes ${num(used)}). Caben ${num(fit)} filas más.${next ? ` ${planLabel(next)} incluye más.` : ''}`
          : `Superaste el máximo de leads de tu plan ${definition.label} (${num(leadLimit)}; tienes ${num(used)}).${next ? ` ${planLabel(next)} incluye más.` : ''}`,
      })
    } else if (used >= warnAt) {
      createLead = {
        allowed: true, state: 'warn', limit: leadLimit, used, upgradeTo: next,
        message: `Usas ${num(used)} de ${num(leadLimit)} leads de tu plan ${definition.label}.${next ? ` ${planLabel(next)} incluye más.` : ''}`,
      }
    } else {
      createLead = { ...OK, limit: leadLimit, used }
    }
  }

  // ── Correos ───────────────────────────────────────────────────────────────
  // En degradado rige la cuota de cortesía sin margen; las secuencias no corren.
  const emailLimit = access.monthlyEmailQuota ?? definition.limits.emailsPerMonth
  const emailUsed = usage.emailsMonth
  const emailWarnAt = Math.ceil((emailLimit * 8) / 10)
  const manualCap = degraded ? emailLimit : leadThresholds(emailLimit).blockAt
  const emailUpgrade = degraded ? null : next

  let automatedEmail: Entitlement
  if (!access.sequencesRunnable) {
    automatedEmail = blocked({
      limit: emailLimit, used: emailUsed,
      message: 'Las secuencias automáticas están en pausa mientras tu suscripción esté inactiva.',
    })
  } else if (emailUsed >= emailLimit) {
    automatedEmail = blocked({
      limit: emailLimit, used: emailUsed, upgradeTo: emailUpgrade,
      message: `Las secuencias automáticas se pausaron: usaste ${num(emailUsed)} de ${num(emailLimit)} correos de este mes.${next ? ` ${planLabel(next)} incluye más.` : ''}`,
    })
  } else if (emailUsed >= emailWarnAt) {
    automatedEmail = {
      allowed: true, state: 'warn', limit: emailLimit, used: emailUsed, upgradeTo: emailUpgrade,
      message: `Llevas ${num(emailUsed)} de ${num(emailLimit)} correos este mes.`,
    }
  } else {
    automatedEmail = { ...OK, limit: emailLimit, used: emailUsed }
  }

  let manualEmail: Entitlement
  if (emailUsed >= manualCap) {
    manualEmail = blocked({
      limit: emailLimit, used: emailUsed, upgradeTo: emailUpgrade,
      message: `Llegaste al máximo de correos de este mes (${num(emailUsed)} de ${num(emailLimit)}).${emailUpgrade ? ` ${planLabel(emailUpgrade)} incluye más.` : ''}`,
    })
  } else if (emailUsed >= emailWarnAt) {
    manualEmail = {
      allowed: true, state: 'warn', limit: emailLimit, used: emailUsed, upgradeTo: emailUpgrade,
      message: `Llevas ${num(emailUsed)} de ${num(emailLimit)} correos este mes.`,
    }
  } else {
    manualEmail = { ...OK, limit: emailLimit, used: emailUsed }
  }

  // ── Agentes rastreados ────────────────────────────────────────────────────
  let createAgent: Entitlement
  const agentLimit = definition.limits.trackedAgents === 'unlimited' ? null : definition.limits.trackedAgents
  if (skip || agentLimit === null) {
    createAgent = { ...OK, used: usage.agents }
  } else if (usage.agents >= agentLimit) {
    createAgent = blocked({
      limit: agentLimit, used: usage.agents, upgradeTo: 'partner',
      message: `Tu plan ${definition.label} incluye ${num(agentLimit)} ${agentLimit === 1 ? 'agente' : 'agentes'} (tienes ${num(usage.agents)}). Partner permite más.`,
    })
  } else {
    createAgent = { ...OK, limit: agentLimit, used: usage.agents }
  }

  // ── Analytics de equipo ───────────────────────────────────────────────────
  const teamAnalytics: Entitlement = definition.features.teamAnalytics
    ? OK
    : blocked({
        upgradeTo: 'partner',
        message: 'La vista consolidada de equipo está incluida en el plan Partner.',
      })

  return { publishProperty, aiPropertyIntake, createLead, automatedEmail, manualEmail, createAgent, teamAnalytics }
}
