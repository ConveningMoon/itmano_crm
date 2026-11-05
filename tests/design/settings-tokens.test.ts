import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// /settings pinta con clases y tokens de dashboard-ui.css. Un color suelto
// (hex o rgba) se queda fuera del tema y no responde a los cambios de paleta.
// Los colores que elige el usuario (etiquetas, acento) llegan como datos, no
// como literales en el código.

const DIR = path.resolve(__dirname, '../../src/app/(dashboard)/settings')

function archivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const ruta = path.join(dir, e.name)
    if (e.isDirectory()) return archivos(ruta)
    return /\.tsx?$/.test(e.name) ? [ruta] : []
  })
}

describe('settings: sin colores sueltos', () => {
  it('ningún archivo de settings contiene hex ni rgba de color', () => {
    const hallazgos: string[] = []
    for (const archivo of archivos(DIR)) {
      readFileSync(archivo, 'utf8').split(/\r?\n/).forEach((linea, i) => {
        if (/#[0-9a-fA-F]{3,8}\b/.test(linea) || /rgba?\(/.test(linea)) {
          hallazgos.push(`${path.relative(DIR, archivo)}:${i + 1}  ${linea.trim()}`)
        }
      })
    }
    expect(hallazgos, `Usa tokens (var(--…)) en vez de colores literales:\n${hallazgos.join('\n')}`).toEqual([])
  })

  it('settings-styles.ts ya no existe', () => {
    expect(existsSync(path.join(DIR, 'settings-styles.ts'))).toBe(false)
  })
})
