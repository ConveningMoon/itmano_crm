// Lógica de presentación del uso de IA, sin dependencias de servidor: la usan
// tanto page.tsx (server) como la sección de Configuración (client). Por eso
// sólo importa tipos de @/lib/data/ai-usage, que sí lleva `server-only`.
import type { AgentAiBreakdown, AiUsageSummary } from '@/lib/data/ai-usage'

// Estado del límite mensual SIN montos (misma forma que AiLimitIndicator).
export interface AiUsageLimitView {
  unlimited: boolean
  usedRatio: number
  blocked:   boolean
}

export interface AiUsageMonthPoint {
  /** YYYY-MM en UTC. */
  key:      string
  label:    string
  requests: number
  costUsd:  number
}

// Los meses se cortan en UTC, igual que monthStartIso() de data/ai-usage.ts.
const MONTH_LABEL = new Intl.DateTimeFormat('es-419', { month: 'short', timeZone: 'UTC' })

const monthKey = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, '0')}`

/**
 * Consumo de los últimos `months` meses (el actual incluido), de más viejo a más
 * nuevo y sin huecos: un mes sin uso aparece con ceros para que el eje no salte.
 * Recibe los meses ya agregados por la RPC ai_usage_summary (`key` YYYY-MM en
 * UTC); los que caen fuera de la ventana se ignoran. El costo se redondea a 6
 * decimales al final (como getAgentAiBreakdown); el formato lo pone la capa de
 * presentación.
 */
export function aiUsageByMonth(
  monthly: { key: string; requests: number; costUsd: number | string }[],
  now: Date,
  months = 6,
): AiUsageMonthPoint[] {
  const points = new Map<string, AiUsageMonthPoint>()
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const key = monthKey(d.getUTCFullYear(), d.getUTCMonth())
    points.set(key, { key, label: MONTH_LABEL.format(d), requests: 0, costUsd: 0 })
  }

  for (const m of monthly) {
    const point = points.get(m.key)
    if (!point) continue
    point.requests += Number(m.requests)
    point.costUsd  += Number(m.costUsd)
  }

  return [...points.values()].map(p => ({ ...p, costUsd: Math.round(p.costUsd * 1_000_000) / 1_000_000 }))
}

/**
 * Los montos en USD son información interna de ITMANO. Para quien no es
 * super_admin se ponen en 0 ANTES de cruzar al cliente: no basta con ocultarlos
 * en la UI, no deben viajar en el payload RSC.
 */
export function maskAiCosts(
  summary: AiUsageSummary,
  byAgent: AgentAiBreakdown | null,
  showCosts: boolean,
): { summary: AiUsageSummary; byAgent: AgentAiBreakdown | null } {
  if (showCosts) return { summary, byAgent }

  const zeroCost = <T extends { costUsd: number }>(x: T): T => ({ ...x, costUsd: 0 })
  return {
    summary: {
      allTime:   zeroCost(summary.allTime),
      last30d:   zeroCost(summary.last30d),
      byFeature: summary.byFeature.map(zeroCost),
      byTenant:  null,
      recent:    summary.recent.map(zeroCost),
      byMonth:   summary.byMonth.map(zeroCost),
    },
    byAgent: byAgent ? { ...byAgent, agents: byAgent.agents.map(zeroCost) } : null,
  }
}

export type LimitGauge =
  | { kind: 'hidden' }
  | { kind: 'unlimited' }
  | { kind: 'gauge'; percent: number; blocked: boolean; near: boolean }

/** Qué dibuja la tarjeta "Este mes": nada, "Ilimitado" o el anillo de 0 a 100. */
export function limitGauge(limit: AiUsageLimitView | null): LimitGauge {
  if (!limit) return { kind: 'hidden' }
  if (limit.unlimited) return { kind: 'unlimited' }
  const percent = Math.min(100, Math.max(0, Math.round(limit.usedRatio * 100)))
  return { kind: 'gauge', percent, blocked: limit.blocked, near: percent >= 80 }
}
