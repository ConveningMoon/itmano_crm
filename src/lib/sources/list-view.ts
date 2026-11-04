import {
  MEASUREMENT_COPY, STATUS_COPY,
  type BadgeCopy, type SourceHealth, type Tone,
} from '@/lib/sources/health'

// Lógica pura de la lista de fuentes: un solo semáforo por fila y el filtro de
// canales. Sin lecturas ni estado, para poder probarla sin base de datos.

const TONE_RANK: Record<Tone, number> = { bad: 3, warn: 2, ok: 1, mute: 0 }

export interface CombinedHealth {
  tone:  Tone
  label: string
  lines: { label: string; what: string; why: string }[]
}

/**
 * Junta el estado del formulario y el de la medición en un solo badge: manda el
 * peor tono y, a igualdad, el del formulario. Sin envíos no hay nada que decir.
 */
export function combinedHealth(health: SourceHealth | undefined): CombinedHealth | null {
  if (!health || health.submissions === 0) return null
  const form: BadgeCopy = STATUS_COPY[health.status]
  const measure: BadgeCopy = MEASUREMENT_COPY[health.measurement]
  const worst = TONE_RANK[measure.tone] > TONE_RANK[form.tone] ? measure : form
  return {
    tone: worst.tone,
    label: worst.label,
    lines: [form, measure].map(({ label, what, why }) => ({ label, what, why })),
  }
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Filtra canales por tipo (`all` no filtra) y por texto en nombre o id público. */
export function filterChannels<T extends { name: string; channelType: string; publicId: string }>(
  channels: T[],
  opts: { type: string; query: string },
): T[] {
  const q = normalize(opts.query)
  return channels.filter(c => {
    if (opts.type !== 'all' && c.channelType !== opts.type) return false
    if (!q) return true
    return normalize(c.name).includes(q) || normalize(c.publicId).includes(q)
  })
}
