import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

// Las fotos de la home viven en public/landing y las referencian las escenas de
// src/components/marketing/landing y la propia página. Este test ata los dos
// lados: una referencia a un archivo que no existe es una imagen rota en
// producción (next/image no falla el build por eso), y un archivo que nadie usa
// es peso muerto en el repo.

const ROOT = path.resolve(__dirname, '../..')
const PUBLIC_DIR = path.join(ROOT, 'public/landing')
const SOURCES = [
  path.join(ROOT, 'src/app/(marketing)/page.tsx'),
  ...readdirSync(path.join(ROOT, 'src/components/marketing/landing'))
    .filter(f => /\.(ts|tsx)$/.test(f))
    .map(f => path.join(ROOT, 'src/components/marketing/landing', f)),
]

function referencedAssets(): Set<string> {
  const found = new Set<string>()
  for (const file of SOURCES) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/['"`]\/landing\/([a-z0-9-]+\.(?:webp|png|jpg|jpeg|avif|svg))['"`]/gi)) {
      found.add(match[1])
    }
  }
  return found
}

describe('assets de la landing', () => {
  const referenced = referencedAssets()
  const onDisk = new Set(readdirSync(PUBLIC_DIR).filter(f => !f.startsWith('.')))

  it('la landing usa al menos una foto (el test sigue buscando en el lugar correcto)', () => {
    expect(referenced.size).toBeGreaterThan(0)
  })

  it('cada foto referenciada existe en public/landing', () => {
    const missing = [...referenced].filter(f => !existsSync(path.join(PUBLIC_DIR, f)))
    expect(missing).toEqual([])
  })

  it('no hay archivos en public/landing que nadie use', () => {
    const unused = [...onDisk].filter(f => !referenced.has(f))
    expect(unused).toEqual([])
  })
})
