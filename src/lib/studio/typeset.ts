import 'server-only'
import { getFont } from '@/lib/carousels/fonts'
import type { FontRole } from '@/lib/carousels/brand'

// Texto a paths SVG con opentype: determinista, sin fuentes del sistema y sin
// tofu. Reusa la CARGA de fuentes del motor de carruseles (mismos .ttf ya
// empaquetados por outputFileTracingIncludes) pero no su trazado: aquel centra
// todo en el eje del lienzo, y el Estudio necesita texto alineado a la izquierda
// dentro de una banda, en tres formatos distintos.

export type Font = ReturnType<typeof getFont>

export function getStudioFont(role: FontRole): Font {
  return getFont(role)
}

/** Elimina lo que la fuente no puede dibujar (emojis, símbolos ausentes). */
export function sanitize(font: Font, text: string): string {
  const kept = [...text]
    .map(ch => (ch === ' ' || ch === '\n' ? ch : font.charToGlyphIndex(ch) > 0 ? ch : ''))
    .join('')
  return kept.replace(/\s+/g, ' ').trim()
}

export function measure(font: Font, text: string, size: number): number {
  return font.getAdvanceWidth(text, size)
}

export function wrap(font: Font, text: string, size: number, maxWidth: number): string[] {
  const words = text.split(' ').filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w
    if (measure(font, trial, size) <= maxWidth || !cur) cur = trial
    else { lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines
}

/**
 * Reduce el tamaño hasta que el texto quepa en `maxLines`. Nunca baja de `min`:
 * por debajo del mínimo legible se prefiere truncar antes que seguir encogiendo
 * — un precio ilegible no sirve de nada.
 */
export function fit(
  font: Font,
  text: string,
  opts: { maxWidth: number; maxLines: number; start: number; min: number },
): { size: number; lines: string[] } {
  for (let s = opts.start; s >= opts.min; s -= 2) {
    const lines = wrap(font, text, s, opts.maxWidth)
    if (lines.length <= opts.maxLines) return { size: s, lines }
  }
  return { size: opts.min, lines: ellipsize(font, text, opts.min, opts.maxWidth, opts.maxLines) }
}

/** Corta a `maxLines` y cierra con elipsis. La dirección larga se recorta. */
export function ellipsize(font: Font, text: string, size: number, maxWidth: number, maxLines: number): string[] {
  const lines = wrap(font, text, size, maxWidth)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last.length > 1 && measure(font, `${last}…`, size) > maxWidth) last = last.slice(0, -1)
  kept[maxLines - 1] = `${last.trimEnd()}…`
  return kept
}

/** Una línea alineada a la izquierda desde `x`, con baseline en `baselineY`. */
export function textPath(
  font: Font, line: string, size: number, x: number, baselineY: number, color: string,
  opts: { tracking?: number; opacity?: number } = {},
): string {
  const tracking = opts.tracking ?? 0
  const attrs = `fill="${color}"${opts.opacity !== undefined ? ` opacity="${opts.opacity}"` : ''}`
  if (!tracking) {
    const d = font.getPath(line, x, baselineY, size).toPathData(2)
    return d ? `<path ${attrs} d="${d}"/>` : ''
  }
  let cursor = x
  let d = ''
  for (const ch of [...line]) {
    d += font.getPath(ch, cursor, baselineY, size).toPathData(2) + ' '
    cursor += measure(font, ch, size) + tracking
  }
  return d.trim() ? `<path ${attrs} d="${d.trim()}"/>` : ''
}
