// Lógica pura del plano "cantidad vs. score" de la pestaña Fuentes. Sin React ni
// base de datos, para poder probarla sola.

export interface PlanePoint {
  id: string
  name: string
  /** Leads captados en el periodo (eje X). Siempre mayor que 0. */
  leads: number
  /** Score medio de sus leads, 0 a 100 (eje Y). */
  score: number
}

/**
 * Una fuente sin leads en el periodo no se pinta, y una sin score tampoco: no hay
 * coordenada Y que inventar. Un score de 0 sí es un dato.
 */
export function planePoints(
  rows: { id: string; name: string; leads: number; score: number | null }[],
): PlanePoint[] {
  const points: PlanePoint[] = []
  for (const r of rows) {
    if (r.leads > 0 && r.score !== null) {
      points.push({ id: r.id, name: r.name, leads: r.leads, score: r.score })
    }
  }
  return points
}

/** Ids del Top 3 por leads × score. En un empate decide el nombre, para que no cambie entre cargas. */
export function topThree(points: PlanePoint[]): string[] {
  return [...points]
    .sort((a, b) => b.leads * b.score - a.leads * a.score || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .slice(0, 3)
    .map(p => p.id)
}

/** Cortes de las cuatro zonas: el promedio de las fuentes pintadas. Sin puntos, 0 (sin dividir). */
export function planeCuts(points: PlanePoint[]): { leads: number; score: number } {
  if (points.length === 0) return { leads: 0, score: 0 }
  const n = points.length
  return {
    leads: points.reduce((s, p) => s + p.leads, 0) / n,
    score: points.reduce((s, p) => s + p.score, 0) / n,
  }
}

/** Ids que comparten coordenada con `id` (incluido él): se encienden y apagan juntos. */
export function samePoint(points: PlanePoint[], id: string): string[] {
  const at = points.find(p => p.id === id)
  if (!at) return []
  return points.filter(p => p.leads === at.leads && p.score === at.score).map(p => p.id)
}

/**
 * Conversión global: envíos de formulario entre vistas, sólo de las fuentes que
 * tienen vistas (las demás no tienen cómo medirse). Sin vistas, 0. Redondeada a entero.
 */
export function overallConversion(rows: { views: number; submissions: number }[]): number {
  let views = 0
  let submissions = 0
  for (const r of rows) {
    if (r.views > 0) {
      views += r.views
      submissions += r.submissions
    }
  }
  return views > 0 ? Math.round((submissions / views) * 100) : 0
}
