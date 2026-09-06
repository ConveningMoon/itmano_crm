import { describe, it, expect } from 'vitest'
import { canGenerateWithAi } from '@/lib/newsletters/source-domains'

describe('puertas antes de gastar', () => {
  it('sin allowlist no se genera', () => {
    expect(canGenerateWithAi(null)).toBe(false)
    expect(canGenerateWithAi([])).toBe(false)
  })

  it('con allowlist se puede intentar', () => {
    expect(canGenerateWithAi(['nar.realtor', 'redfin.com'])).toBe(true)
  })
})
