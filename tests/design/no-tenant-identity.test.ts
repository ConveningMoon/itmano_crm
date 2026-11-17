import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// White-label: los textos de ejemplo del CRM los ve cualquier tenant. Hasta
// noviembre de 2026 muchos placeholders nombraban al piloto ("Oficina A&J ·
// Virginia Beach", "Hampton Roads", "Navy Federal"), así que otro cliente veía
// la identidad y el mercado de A&J en sus formularios. AGENTS.md prohíbe
// hardcodear identidad de un tenant en código.
//
// Se revisan sólo placeholders: los comentarios pueden citar al piloto como
// contexto histórico.

const ROOTS = ['src/app/(dashboard)', 'src/components/dashboard', 'src/components/layout']
const FORBIDDEN = /A&J|Hampton Roads|Virginia Beach|Norfolk|Chesapeake|Suffolk|Navy Federal|\(757\)/

function walk(dir: string): string[] {
  const abs = path.resolve(__dirname, '../..', dir)
  return readdirSync(abs).flatMap(name => {
    const p = path.join(abs, name)
    if (statSync(p).isDirectory()) return walk(path.relative(path.resolve(__dirname, '../..'), p))
    return /\.(tsx?|jsx?)$/.test(name) ? [p] : []
  })
}

describe('placeholders sin identidad de un tenant', () => {
  it('ningún placeholder del CRM nombra al piloto ni su mercado', () => {
    const offenders: string[] = []
    for (const file of ROOTS.flatMap(walk)) {
      const lines = readFileSync(file, 'utf8').split(/\r?\n/)
      lines.forEach((line, i) => {
        if (/placeholder/i.test(line) && FORBIDDEN.test(line)) {
          offenders.push(`${path.relative(process.cwd(), file)}:${i + 1}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })
})
