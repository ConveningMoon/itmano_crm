import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Pantallas ya rediseñadas en la fase 5: pintan con clases y tokens de
// dashboard-ui.css. Un color suelto (hex o rgba) o un token viejo --accent-*
// se queda fuera de la paleta dorada. Cada tanda nueva añade sus carpetas aquí.

const DASHBOARD = path.resolve(__dirname, '../../src/app/(dashboard)')
const REDISENADAS = ['activity', 'notifications', 'soporte', 'solicitudes', 'leads']

function archivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const ruta = path.join(dir, e.name)
    if (e.isDirectory()) return archivos(ruta)
    return /\.tsx?$/.test(e.name) ? [ruta] : []
  })
}

describe('fase 5: pantallas rediseñadas sin colores sueltos', () => {
  it.each(REDISENADAS)('%s no tiene hex, rgba ni --accent-*', carpeta => {
    const dir = path.join(DASHBOARD, carpeta)
    const hallazgos: string[] = []
    for (const archivo of archivos(dir)) {
      readFileSync(archivo, 'utf8').split(/\r?\n/).forEach((linea, i) => {
        if (/#[0-9a-fA-F]{3,8}\b/.test(linea) || /rgba?\(/.test(linea) || /--accent-/.test(linea)) {
          hallazgos.push(`${path.relative(DASHBOARD, archivo)}:${i + 1}  ${linea.trim()}`)
        }
      })
    }
    expect(hallazgos, `Usa los tokens de la paleta (--gold-*, --alert, --text-*):\n${hallazgos.join('\n')}`).toEqual([])
  })
})
