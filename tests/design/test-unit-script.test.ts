import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// vitest no falla si un filtro de ruta no coincide con nada mientras otro sí
// coincida: una ruta mal escrita saca suites enteras de CI sin avisar.
describe('script test:unit', () => {
  it('toda ruta del script existe en disco', () => {
    const root = path.resolve(__dirname, '../..')
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
    const paths = (pkg.scripts['test:unit'] as string).split(/\s+/).filter(p => p.startsWith('tests/'))

    expect(paths.length).toBeGreaterThan(0)
    expect(paths.filter(p => !existsSync(path.join(root, p)))).toEqual([])
  })
})
