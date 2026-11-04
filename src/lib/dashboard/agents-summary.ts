export interface AgentTotals { id: string; total: number; highQuality: number; closed: number }
export interface GlobalTotals { total: number; closed: number; highQuality: number }
export interface Leftover { total: number; highQuality: number; closed: number }

// Concilia la pestaña Agentes con las cifras globales: los leads de agentes
// inactivos (o sin agente) no están en la lista de activos pero siguen en la
// cartera. Los totales salen de `global`; lo que no cubren los activos se reporta
// como una fila "Agentes inactivos".
export function summarizeAgents(active: AgentTotals[], global: GlobalTotals) {
  const sum = (k: 'total' | 'highQuality' | 'closed') => active.reduce((s, a) => s + a[k], 0)
  const left = (k: 'total' | 'highQuality' | 'closed') => Math.max(0, global[k] - sum(k))

  const leftover: Leftover = { total: left('total'), highQuality: left('highQuality'), closed: left('closed') }
  return {
    total: global.total,
    closed: global.closed,
    highQuality: global.highQuality,
    // Leads por agente sigue siendo sobre los activos que los tienen asignados.
    perAgent: active.length > 0 ? Math.round(sum('total') / active.length) : 0,
    inactive: leftover.total > 0 ? leftover : null,
  }
}
