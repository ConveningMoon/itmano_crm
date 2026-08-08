import { describe, it, expect } from 'vitest'
import { canUseStudio } from '@/lib/access/studio'

describe('canUseStudio', () => {
  it('solo super_admin puede generar', () => {
    expect(canUseStudio({ role: 'super_admin' })).toBe(true)
    expect(canUseStudio({ role: 'agent_owner' })).toBe(false)
    expect(canUseStudio({ role: 'agent' })).toBe(false)
  })
})
