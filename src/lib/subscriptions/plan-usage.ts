import { PLANS } from '@/lib/plans'
import { type Entitlement, type EntitlementKey } from '@/lib/subscriptions/entitlements'
import type { AiUsageLimitView } from '@/lib/ai-usage/view'
import type { SubscriptionPlan } from '@/lib/subscriptions'

// Filas de Configuración → "Tu plan": una por límite. Pura (sin red ni React):
// recibe los derechos ya calculados y decide qué dibuja cada barra. Nunca lleva
// dólares — la IA se muestra sólo en porcentaje.

export type PlanUsageTone = 'ok' | 'warn' | 'blocked'

export type PlanUsageRow =
  | { key: string; label: string; kind: 'bar'; used: number; limit: number; percent: number; tone: PlanUsageTone; detail: string; hint: string | null }
  | { key: string; label: string; kind: 'percent'; percent: number; tone: PlanUsageTone; detail: string; hint: string | null }
  | { key: string; label: string; kind: 'unlimited'; used: number | null; detail: string; hint: null }
  | { key: string; label: string; kind: 'not-included'; detail: string; hint: string | null }

const num = (n: number) => n.toLocaleString('es-MX')
const clampPct = (n: number) => Math.min(100, Math.max(0, Math.round(n)))

function upgradeHint(e: Entitlement): string | null {
  return e.upgradeTo ? `${PLANS[e.upgradeTo].label} incluye más.` : null
}

// El estado lo decide el derecho (leads y correos ya avisan al 80 %); las
// propiedades no tienen aviso propio, así que se avisa igual desde el 80 %.
function toneOf(e: Entitlement, used: number, limit: number): PlanUsageTone {
  if (e.state !== 'ok') return e.state
  if (used >= Math.ceil((limit * 8) / 10)) return 'warn'
  return 'ok'
}

function limitRow(
  key: string, label: string, e: Entitlement, unit: string, unlimitedWord: string,
): PlanUsageRow {
  if (e.limit === null) {
    return { key, label, kind: 'unlimited', used: e.used, detail: unlimitedWord, hint: null }
  }
  const used = e.used ?? 0
  const tone = toneOf(e, used, e.limit)
  return {
    key, label, kind: 'bar', used, limit: e.limit,
    percent: e.limit > 0 ? clampPct((used / e.limit) * 100) : 100,
    tone,
    detail: `${num(used)} de ${num(e.limit)} ${unit}`,
    hint: tone === 'ok' ? null : upgradeHint(e),
  }
}

export interface PlanUsageInput {
  plan: SubscriptionPlan
  entitlements: Record<EntitlementKey, Entitlement>
  /** Indicador de IA ya calculado para quien mira (sin montos). null = ocultar. */
  ai: (AiUsageLimitView & { perAgent?: boolean }) | null
}

export function buildPlanUsageRows({ plan, entitlements: ent, ai }: PlanUsageInput): PlanUsageRow[] {
  const rows: PlanUsageRow[] = []

  rows.push(limitRow('leads', 'Leads', ent.createLead, 'leads', 'Ilimitados'))
  rows.push(limitRow('emails', 'Correos del mes', ent.automatedEmail, 'correos', 'Ilimitados'))

  // Esencial no incluye propiedades en la web (tope 0): se dice, no se dibuja
  // una barra vacía que parezca un cupo sin estrenar.
  if (ent.publishProperty.limit === 0) {
    rows.push({
      key: 'properties', label: 'Propiedades en la web', kind: 'not-included',
      detail: 'No incluido en tu plan', hint: upgradeHint(ent.publishProperty) ?? `${PLANS.growth.label} las incluye.`,
    })
  } else {
    rows.push(limitRow('properties', 'Propiedades en la web', ent.publishProperty, 'propiedades', 'Ilimitadas'))
  }

  if (ai) {
    if (ai.unlimited) {
      rows.push({ key: 'ai', label: 'IA este mes', kind: 'unlimited', used: null, detail: 'Ilimitada', hint: null })
    } else {
      const percent = clampPct(ai.usedRatio * 100)
      const tone: PlanUsageTone = ai.blocked ? 'blocked' : percent >= 80 ? 'warn' : 'ok'
      rows.push({
        key: 'ai', label: 'IA este mes', kind: 'percent', percent, tone,
        detail: `${percent} % ${ai.perAgent ? 'de tu parte del límite del equipo' : 'de la capacidad incluida'}`,
        hint: tone === 'blocked' ? 'Se reinicia el día 1.' : null,
      })
    }
  }

  // Los logins/agentes sólo se cuentan en Partner: en los demás planes el tope
  // es 1 y no hay nada que administrar.
  if (plan === 'partner') {
    rows.push(limitRow('agents', 'Agentes del equipo', ent.createAgent, 'agentes', 'Ilimitados'))
  }

  return rows
}
