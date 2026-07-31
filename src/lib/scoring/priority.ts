// Los tres ejes del lead, en un módulo PURO: etiquetas, colores, orden y cómo se
// muestra la posición. Lo comparten servidor y cliente, así que no importa nada
// de Supabase.
//
// Spec: docs/superpowers/specs/2026-07-31-calidad-urgencia-design.md
//
//   ETAPA    — dónde está en el proceso. La mueve el agente.
//   CALIDAD  — qué tan bueno es. Lo calcula el sistema. NO decae.
//   URGENCIA — si hay que actuar hoy. Lo calcula el sistema. Decae.
//
// Los valores llegan ya resueltos desde la vista `leads_list` (migración 076);
// aquí sólo se les da nombre, color y orden.

// ─── Etapa ────────────────────────────────────────────────────────────────────

export const STAGES = ['nuevo', 'nutricion', 'en_proceso', 'cerrado', 'perdido'] as const
export type Stage = typeof STAGES[number]

export const STAGE_CONFIG: Record<Stage, { label: string; color: string }> = {
  nuevo:      { label: 'Nuevo',        color: 'var(--status-new)' },
  nutricion:  { label: 'En Nutrición', color: 'var(--status-nurturing)' },
  en_proceso: { label: 'En proceso',   color: 'var(--status-process-started)' },
  cerrado:    { label: 'Cerrado',      color: 'var(--status-closed)' },
  perdido:    { label: 'Perdido',      color: 'var(--status-lost)' },
}

/** Etapas que siguen compitiendo por la atención del agente. */
export const ACTIVE_STAGES: Stage[] = ['nuevo', 'nutricion']

export function isActiveStage(stage: Stage | null): boolean {
  return stage !== null && ACTIVE_STAGES.includes(stage)
}

// ─── Calidad ──────────────────────────────────────────────────────────────────

// Cinco bandas, de mejor a peor. El orden del array ES el orden de calidad: lo
// usan el comparador y los filtros, así que no se reordena a la ligera.
export const QUALITY_BANDS = ['alta', 'media_alta', 'media', 'media_baja', 'baja'] as const
export type QualityBand = typeof QUALITY_BANDS[number]

export const QUALITY_CONFIG: Record<QualityBand, { label: string; color: string }> = {
  alta:       { label: 'Alta',       color: 'var(--status-hot)' },
  media_alta: { label: 'Media alta', color: 'var(--status-warm)' },
  media:      { label: 'Media',      color: 'var(--accent-gold)' },
  media_baja: { label: 'Media baja', color: 'var(--text-secondary)' },
  baja:       { label: 'Baja',       color: 'var(--text-muted)' },
}

/** Menor = mejor. Sirve para ordenar descendente por calidad. */
export function qualityRank(band: QualityBand): number {
  return QUALITY_BANDS.indexOf(band)
}

// ─── Urgencia ─────────────────────────────────────────────────────────────────

export const URGENCIES = ['hoy', 'esta_semana', 'sin_apuro'] as const
export type Urgency = typeof URGENCIES[number]

export const URGENCY_CONFIG: Record<Urgency, { label: string; color: string }> = {
  hoy:         { label: 'Hoy',         color: 'var(--accent-coral)' },
  esta_semana: { label: 'Esta semana', color: 'var(--accent-gold)' },
  sin_apuro:   { label: 'Sin prisa',   color: 'var(--text-muted)' },
}

// La vista devuelve 9 para los leads fuera de la cola (etapas post-embudo).
export const OUT_OF_QUEUE_RANK = 9

// ─── Prioridad ────────────────────────────────────────────────────────────────

export interface PriorityInput {
  urgencyRank:  number
  qualityBand:  QualityBand
  id:           string
}

/**
 * Orden LEXICOGRÁFICO: primero lo que caduca, dentro de eso lo mejor.
 *
 * Se evita a propósito una fórmula ponderada (`a·urgencia + b·calidad`): pediría
 * inventar cuántos puntos de calidad vale un día de urgencia, que es exactamente
 * el problema que tiene el modelo de puntos y que este rediseño viene a quitar.
 *
 * `id` desempata para que el orden sea estable entre peticiones — sin él, dos
 * leads empatados pueden saltar de página al paginar.
 */
export function compareByPriority(a: PriorityInput, b: PriorityInput): number {
  if (a.urgencyRank !== b.urgencyRank) return a.urgencyRank - b.urgencyRank
  const qa = qualityRank(a.qualityBand)
  const qb = qualityRank(b.qualityBand)
  if (qa !== qb) return qa - qb
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

// ─── Posición en la cartera ───────────────────────────────────────────────────

// Por encima de este número de leads activos la posición absoluta deja de
// informar: "#247 de 1000" no le sirve a nadie. A partir de ahí se muestra el
// percentil, que sí responde "¿está entre los que debo trabajar?".
export const POSITION_ABSOLUTE_MAX = 100

export interface PositionLabel {
  text:    string
  /** true cuando el lead está en el 20% superior de la cartera activa. */
  top:     boolean
}

/**
 * Cómo se muestra la posición del lead dentro de la cartera activa.
 * `rank` es 1-based.
 */
export function formatPosition(rank: number, total: number): PositionLabel | null {
  if (total <= 0 || rank <= 0) return null

  const percentile = rank / total
  const top = percentile <= 0.2

  if (total <= POSITION_ABSOLUTE_MAX) {
    return { text: `#${rank} de ${total} activos`, top }
  }

  // Se redondea hacia arriba para no prometer de más: un lead en el 4.2% se
  // muestra como "top 5%", nunca como "top 4%".
  const pct = Math.max(1, Math.ceil(percentile * 100))
  return { text: `top ${pct}% de tu cartera`, top }
}
