import { describe, it, expect } from 'vitest'
import { encodeCursor, decodeCursor, DEFAULT_LIMIT, MAX_LIMIT } from '@/lib/agent-api/cursor'
import { ApiError } from '@/lib/agent-api/errors'

const FILTROS = { stage: 'nuevo', owner: null }
const ULTIMO  = { created_at: '2026-01-02T03:04:05.123Z', id: 'lead-1' }

describe('cursor keyset', () => {
  it('ida y vuelta con los mismos filtros', () => {
    expect(decodeCursor(encodeCursor(ULTIMO, FILTROS), FILTROS)).toEqual(ULTIMO)
  })

  it('es opaco: no revela los valores en claro', () => {
    const c = encodeCursor(ULTIMO, FILTROS)
    expect(c).not.toContain('lead-1')
    expect(c).not.toContain('2026')
  })

  it('es seguro en url: solo base64url', () => {
    expect(encodeCursor(ULTIMO, FILTROS)).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('rechaza un cursor emitido para otro conjunto de filtros', () => {
    const c = encodeCursor(ULTIMO, FILTROS)
    expect(() => decodeCursor(c, { stage: 'cerrado', owner: null })).toThrow(ApiError)
  })

  it('el error de filtros cambiados es invalid_arguments', () => {
    const c = encodeCursor(ULTIMO, FILTROS)
    try {
      decodeCursor(c, { stage: 'cerrado', owner: null })
      throw new Error('debió lanzar')
    } catch (e) {
      expect((e as ApiError).code).toBe('invalid_arguments')
    }
  })

  it('rechaza basura y cursores con forma incorrecta', () => {
    expect(() => decodeCursor('no-es-base64!!', FILTROS)).toThrow(ApiError)
    expect(() => decodeCursor(Buffer.from('{}').toString('base64url'), FILTROS)).toThrow(ApiError)
    expect(() => decodeCursor(Buffer.from('no json').toString('base64url'), FILTROS)).toThrow(ApiError)
  })

  it('el orden de las claves del filtro no cambia el cursor', () => {
    const a = encodeCursor(ULTIMO, { a: 1, b: 2 })
    const b = encodeCursor(ULTIMO, { b: 2, a: 1 })
    expect(a).toBe(b)
  })

  it('declara los límites de paginación acordados', () => {
    expect(DEFAULT_LIMIT).toBe(25)
    expect(MAX_LIMIT).toBe(100)
  })
})
