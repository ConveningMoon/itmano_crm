import { describe, expect, it } from 'vitest'
import { emailHealth } from '@/lib/dashboard/email-health'

describe('emailHealth', () => {
  it('rebote: sano hasta 5%, alerta por encima', () => {
    expect(emailHealth('bounce', 5, 10)).toBe('ok')
    expect(emailHealth('bounce', 6, 10)).toBe('alert')
  })
  it('bajas: sano hasta 3%, alerta por encima', () => {
    expect(emailHealth('unsub', 3, 10)).toBe('ok')
    expect(emailHealth('unsub', 4, 10)).toBe('alert')
  })
  it('clics y respuestas: sólo afirman cuando la tasa es buena', () => {
    expect(emailHealth('click', 5, 10)).toBe('ok')
    expect(emailHealth('click', 4, 10)).toBeNull()
    expect(emailHealth('reply', 3, 10)).toBe('ok')
    expect(emailHealth('reply', 2, 10)).toBeNull()
  })
  it('sin envíos no se afirma nada', () => {
    expect(emailHealth('bounce', 0, 0)).toBeNull()
    expect(emailHealth('unsub', 9, 0)).toBeNull()
    expect(emailHealth('click', 9, 0)).toBeNull()
  })
})
