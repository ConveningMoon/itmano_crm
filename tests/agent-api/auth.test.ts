import { describe, it, expect } from 'vitest'
import { hashToken, tokenPrefix, requireScope } from '@/lib/agent-api/auth'
import { ApiError } from '@/lib/agent-api/errors'

const conScopes = (scopes: string[]) => ({ scopes })

describe('hashToken', () => {
  it('es estable', () => {
    expect(hashToken('itmano_agent_sbx_abc')).toBe(hashToken('itmano_agent_sbx_abc'))
  })

  it('no contiene el token en claro y mide 64 hex', () => {
    const hash = hashToken('itmano_agent_sbx_secretoLargo123')
    expect(hash).not.toContain('secretoLargo123')
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('tokens distintos dan hashes distintos', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'))
  })
})

describe('tokenPrefix', () => {
  it('no revela la parte secreta', () => {
    const raw = 'itmano_agent_sbx_' + 'x'.repeat(43)
    const prefix = tokenPrefix(raw)
    expect(raw.startsWith(prefix)).toBe(true)
    expect(prefix.length).toBeLessThan(raw.length)
  })
})

describe('requireScope', () => {
  it('deja pasar un scope concedido', () => {
    expect(() => requireScope(conScopes(['read', 'write']), 'write')).not.toThrow()
    expect(() => requireScope(conScopes(['read']), 'read')).not.toThrow()
  })

  it('rechaza un scope ausente', () => {
    expect(() => requireScope(conScopes(['read']), 'write')).toThrow(ApiError)
  })

  it('el error de scope ausente es insufficient_scope', () => {
    try {
      requireScope(conScopes(['read']), 'write')
      throw new Error('debió lanzar')
    } catch (e) {
      expect((e as ApiError).code).toBe('insufficient_scope')
    }
  })

  it('un token sin scopes no puede leer', () => {
    expect(() => requireScope(conScopes([]), 'read')).toThrow(ApiError)
  })
})
