import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { TEMPLATES } from '@/lib/studio/templates/registry'

describe('miniaturas del selector', () => {
  it('todo diseño tiene su miniatura commiteada', () => {
    // El olvido común: añades el décimo diseño y el selector lo muestra roto.
    for (const t of TEMPLATES) {
      const p = join(process.cwd(), 'public', 'studio', 'templates', `${t.key}.webp`)
      expect(existsSync(p), `falta la miniatura de ${t.key} — corre: node scripts/gen-template-thumbs.mjs`).toBe(true)
    }
  })
})
