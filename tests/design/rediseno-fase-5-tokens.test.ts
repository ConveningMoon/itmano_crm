import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Todo el CRM pinta con clases y tokens de dashboard-ui.css y globals.css. Un
// color suelto (hex o rgba) o un token viejo --accent-* se queda fuera de la
// paleta dorada. Cubre cada carpeta del dashboard y de src/components, así que
// una pantalla nueva entra sola. Marketing queda fuera: conserva la identidad
// original de la marca (ver .mk-root en globals.css).

const SRC = path.resolve(__dirname, '../../src')
const DASHBOARD = path.join(SRC, 'app/(dashboard)')
const COMPONENTS = path.join(SRC, 'components')
const FUERA = new Set(['components/marketing'])

// Archivos cuyo color no es interfaz del CRM y no sale de la paleta a propósito.
// El tema del editor de código del Estudio fija el resaltado de sintaxis, elegido
// por contraste contra su fondo (ver el comentario de cada color en el archivo).
const EXCEPCIONES = new Set(['app/(dashboard)/studio/plantillas/code-editor.tsx'])

const rel = (ruta: string) => path.relative(SRC, ruta).split(path.sep).join('/')

function archivos(ruta: string): string[] {
  if (!statSync(ruta).isDirectory()) return /\.tsx?$/.test(ruta) ? [ruta] : []
  return readdirSync(ruta, { withFileTypes: true }).flatMap(e => archivos(path.join(ruta, e.name)))
}

// Una entrada por carpeta (y una para los archivos sueltos de la raíz), para que
// el fallo diga dónde está el color.
const AMBITOS = [DASHBOARD, COMPONENTS].flatMap(base =>
  readdirSync(base, { withFileTypes: true })
    .filter(e => e.isDirectory() && !FUERA.has(rel(path.join(base, e.name))))
    .map(e => path.join(base, e.name))
    .concat(readdirSync(base, { withFileTypes: true }).filter(e => e.isFile()).map(e => path.join(base, e.name))),
)

describe('paleta del CRM: sin colores sueltos', () => {
  it.each(AMBITOS.map(rel))('%s no tiene hex, rgba ni --accent-*', ambito => {
    const hallazgos: string[] = []
    for (const archivo of archivos(path.join(SRC, ambito))) {
      if (EXCEPCIONES.has(rel(archivo))) continue
      readFileSync(archivo, 'utf8').split(/\r?\n/).forEach((linea, i) => {
        if (/#[0-9a-fA-F]{3,8}\b/.test(linea) || /rgba?\(/.test(linea) || /--accent-/.test(linea)) {
          hallazgos.push(`${rel(archivo)}:${i + 1}  ${linea.trim()}`)
        }
      })
    }
    expect(hallazgos, `Usa los tokens de la paleta (--gold-*, --alert, --text-*):\n${hallazgos.join('\n')}`).toEqual([])
  })
})
