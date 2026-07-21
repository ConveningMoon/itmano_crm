import 'server-only'
import { readFileSync } from 'node:fs'
import opentype from 'opentype.js'
import { FONT_FILES, type FontRole } from './brand'

// Carga y cachea las fuentes empaquetadas (OFL) para el compositor. Se leen del
// disco con `new URL('./fonts/…', import.meta.url)` — patrón que el file-tracer
// de Next detecta para incluir los .ttf en la función serverless (reforzado por
// outputFileTracingIncludes en next.config.ts).

const cache = new Map<FontRole, opentype.Font>()

export function getFont(role: FontRole): opentype.Font {
  const cached = cache.get(role)
  if (cached) return cached
  const url = new URL(`./fonts/${FONT_FILES[role]}`, import.meta.url)
  const buf = readFileSync(url)
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const font = opentype.parse(ab)
  cache.set(role, font)
  return font
}
