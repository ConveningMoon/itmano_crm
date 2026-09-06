import { describe, it, expect } from 'vitest'
import { requestHash } from '@/lib/agent-api/idempotency'

describe('requestHash', () => {
  it('es estable ante el orden de las claves del body', () => {
    expect(requestHash('POST', '/agent/v1/leads', { a: 1, b: 2 }))
      .toBe(requestHash('POST', '/agent/v1/leads', { b: 2, a: 1 }))
  })

  it('es estable en objetos anidados', () => {
    expect(requestHash('POST', '/x', { o: { a: 1, b: 2 } }))
      .toBe(requestHash('POST', '/x', { o: { b: 2, a: 1 } }))
  })

  it('cambia si cambia un valor del body', () => {
    expect(requestHash('POST', '/agent/v1/leads', { a: 1 }))
      .not.toBe(requestHash('POST', '/agent/v1/leads', { a: 2 }))
  })

  it('cambia si cambia la ruta', () => {
    expect(requestHash('POST', '/agent/v1/leads', { a: 1 }))
      .not.toBe(requestHash('POST', '/agent/v1/notes', { a: 1 }))
  })

  it('cambia si cambia el método', () => {
    expect(requestHash('POST', '/x', { a: 1 }))
      .not.toBe(requestHash('PATCH', '/x', { a: 1 }))
  })

  it('NO es estable ante el orden de un array: el orden es dato, no ruido', () => {
    expect(requestHash('POST', '/x', { a: [1, 2] }))
      .not.toBe(requestHash('POST', '/x', { a: [2, 1] }))
  })

  it('distingue body nulo de body vacío', () => {
    expect(requestHash('POST', '/x', null)).not.toBe(requestHash('POST', '/x', {}))
  })
})
