import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

// El bug que originó src/lib/uploads: cada formulario hacía su propio
// `fetch('/api/…/media')` + `res.json()`, y un 413 de Vercel (texto plano) acababa
// en "Verifica tu conexión" para cualquiera que subiera una foto de más de 4.5 MB.
// Toda subida a estas rutas pasa por `postMedia` / `prepareImageForUpload`.
const RAIZ = path.resolve(__dirname, '..', '..', 'src')
const ENDPOINTS = ['/api/properties/media', '/api/newsletters/media']
const PERMITIDO = path.join('src', 'lib', 'uploads') + path.sep

function archivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const completo = path.join(dir, e.name)
    if (e.isDirectory()) return archivos(completo)
    return /\.(ts|tsx)$/.test(e.name) ? [completo] : []
  })
}

describe('subidas a las rutas de media', () => {
  it('ningún componente hace fetch directo: usa postMedia', () => {
    const infractores: string[] = []
    for (const f of archivos(RAIZ)) {
      const rel = path.relative(path.resolve(RAIZ, '..'), f)
      if (rel.startsWith(PERMITIDO)) continue
      const texto = readFileSync(f, 'utf8')
      for (const ep of ENDPOINTS) {
        if (new RegExp(`fetch\\(\\s*['"\`]${ep}`).test(texto)) infractores.push(`${rel} → ${ep}`)
      }
    }
    expect(infractores, 'Usa postMedia() de @/lib/uploads/media-upload en vez de fetch directo').toEqual([])
  })

  it('quien sube imágenes a esas rutas las reduce antes con prepareImageForUpload', () => {
    const sinReducir: string[] = []
    for (const f of archivos(RAIZ)) {
      const rel = path.relative(path.resolve(RAIZ, '..'), f)
      if (rel.startsWith(PERMITIDO)) continue
      const texto = readFileSync(f, 'utf8')
      const sube = ENDPOINTS.some(ep => texto.includes(`postMedia('${ep}'`))
      // El modal de propiedades también sube PDF y los trata aparte, pero las imágenes sí pasan por aquí.
      if (sube && !texto.includes('prepareImageForUpload')) sinReducir.push(rel)
    }
    expect(sinReducir).toEqual([])
  })
})
