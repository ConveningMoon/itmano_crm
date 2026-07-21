import 'server-only'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import opentype from 'opentype.js'
import { FONT_FILES, type FontRole } from './brand'

// Carga y cachea las fuentes empaquetadas (OFL) para el compositor.
//
// IMPORTANTE: no usar `readFileSync(new URL('./fonts/…', import.meta.url))`. En
// Node puro funciona, pero Turbopack/Next reescriben `import.meta.url` a un
// objeto asset que readFileSync NO acepta → error "The 'path' argument must be
// of type string or an instance of Buffer or URL. Received an instance of URL".
// Leemos con una ruta de STRING relativa a process.cwd() (los .ttf se copian ahí
// por outputFileTracingIncludes en next.config.ts), con un fallback y un error
// explícito con las rutas probadas para depurar en producción.

const cache = new Map<FontRole, opentype.Font>()

function resolveFontPath(file: string): string {
  const candidates = [
    join(process.cwd(), 'src', 'lib', 'carousels', 'fonts', file),
    join(process.cwd(), '.next', 'server', 'src', 'lib', 'carousels', 'fonts', file),
  ]
  // Último recurso: la ruta relativa al módulo, si el runtime da un file URL.
  try { candidates.push(fileURLToPath(new URL(`./fonts/${file}`, import.meta.url))) } catch { /* runtime bundleado: sin file URL */ }

  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  throw new Error(`Fuente del carrusel no encontrada: ${file}. Rutas probadas: ${candidates.join(' | ')}`)
}

export function getFont(role: FontRole): opentype.Font {
  const cached = cache.get(role)
  if (cached) return cached
  const path = resolveFontPath(FONT_FILES[role])
  const buf = readFileSync(path)
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const font = opentype.parse(ab)
  cache.set(role, font)
  return font
}
