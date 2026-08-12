// Utilidades de color de los templates. Aparte de primitives.tsx porque no
// dibujan nada — así los tests pueden probarlas sin renderizar.

/** El mismo color, más oscuro. Para la segunda banda, sin traer una librería. */
export function darken(hex: string, factor = 0.62): string {
  const n = parseInt(hex.replace('#', ''), 16)
  if (!Number.isFinite(n)) return hex
  const r = Math.round(((n >> 16) & 255) * factor)
  const g = Math.round(((n >> 8) & 255) * factor)
  const b = Math.round((n & 255) * factor)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
