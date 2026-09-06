// Reparto de envíos por secuencia. Puro y sin `server-only` a propósito: es la
// única pieza del batch de métricas que puede equivocarse en silencio.
//
// Leer los envíos de varias secuencias de una vez ahorra queries, pero abre un
// riesgo que la versión de una en una no tenía: que los envíos de una secuencia
// terminen contados en otra. El puente es `sequence_run_id` → `sequence_id`, y
// si ese mapa se aplica mal nadie ve un error — sólo números creíbles y falsos.

export interface SendWithRun {
  lead_id:         string
  step_order:      number
  sent_at:         string
  sequence_run_id: string
}

/**
 * Agrupa los envíos por la secuencia dueña de su run.
 *
 * Un envío cuyo run no está en el mapa se DESCARTA en vez de caer en un cubo
 * por defecto: pertenece a una secuencia que no se pidió (o que ya no existe), y
 * sumarlo a otra sería inventar métricas.
 */
export function groupSendsBySequence(
  sends: readonly SendWithRun[],
  sequenceByRun: ReadonlyMap<string, string>,
): Map<string, SendWithRun[]> {
  const bySequence = new Map<string, SendWithRun[]>()
  for (const send of sends) {
    const sequenceId = sequenceByRun.get(send.sequence_run_id)
    if (!sequenceId) continue
    const bucket = bySequence.get(sequenceId)
    if (bucket) bucket.push(send)
    else bySequence.set(sequenceId, [send])
  }
  return bySequence
}
