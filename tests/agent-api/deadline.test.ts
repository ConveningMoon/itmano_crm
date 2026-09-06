import { describe, it, expect } from 'vitest'
import { withDeadline, DEADLINES } from '@/lib/agent-api/deadline'
import { ApiError } from '@/lib/agent-api/errors'

describe('withDeadline', () => {
  it('devuelve el valor si llega a tiempo', async () => {
    await expect(withDeadline(Promise.resolve(7), 100)).resolves.toBe(7)
  })

  it('lanza ApiError si se pasa del presupuesto', async () => {
    const lento = new Promise(resolve => setTimeout(() => resolve(1), 300))
    await expect(withDeadline(lento, 20)).rejects.toThrow(ApiError)
  })

  it('el código del error es timeout', async () => {
    const lento = new Promise(resolve => setTimeout(() => resolve(1), 300))
    try {
      await withDeadline(lento, 20)
      throw new Error('debió lanzar')
    } catch (e) {
      expect((e as ApiError).code).toBe('timeout')
    }
  })

  it('propaga el rechazo original en vez de convertirlo en timeout', async () => {
    const falla = Promise.reject(new ApiError('not_found', 'no está'))
    try {
      await withDeadline(falla, 100)
      throw new Error('debió lanzar')
    } catch (e) {
      expect((e as ApiError).code).toBe('not_found')
    }
  })

  it('declara los presupuestos acordados por clase de endpoint', () => {
    expect(DEADLINES).toEqual({ meta: 3000, read: 5000, write: 8000 })
  })
})
