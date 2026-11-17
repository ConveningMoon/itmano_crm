import { describe, it, expect } from 'vitest'
import { matchesAudience, decideRecipient, decideRecipients, summarizeAudience, chunk, type AudienceLead } from '@/lib/open-houses/audience'

// Quién recibe el anuncio de un open house. Un error aquí es un correo real a
// quien no debía (o ninguno a quien sí).

function lead(over: Partial<AudienceLead> = {}): AudienceLead {
  return {
    id: 'l1', email: 'lead@example.com', emailBlocked: false, language: 'es',
    agentLanguages: ['es', 'en'], agentPrimary: 'es', tagIds: [], ...over,
  }
}

describe('matchesAudience', () => {
  it('any: basta una etiqueta', () => {
    expect(matchesAudience(['a'], ['a', 'b'], 'any')).toBe(true)
    expect(matchesAudience(['c'], ['a', 'b'], 'any')).toBe(false)
  })

  it('all: hacen falta todas', () => {
    expect(matchesAudience(['a'], ['a', 'b'], 'all')).toBe(false)
    expect(matchesAudience(['b', 'a', 'x'], ['a', 'b'], 'all')).toBe(true)
  })

  it('sin etiquetas no selecciona a nadie (nunca "todo el tenant")', () => {
    expect(matchesAudience(['a'], [], 'any')).toBe(false)
    expect(matchesAudience(['a'], [], 'all')).toBe(false)
  })
})

describe('decideRecipient', () => {
  it('envía en el idioma del lead si su agente lo habla', () => {
    expect(decideRecipient(lead(), ['es', 'en'])).toEqual({ send: true, language: 'es' })
  })

  it('cae a inglés si el agente no habla el idioma del lead', () => {
    expect(decideRecipient(lead({ language: 'pt' }), ['es', 'en'])).toEqual({ send: true, language: 'en' })
  })

  it('no envía si el open house no tiene su idioma', () => {
    expect(decideRecipient(lead(), ['en'])).toEqual({ send: false, reason: 'no_language', language: 'es' })
  })

  it('no envía sin email ni con el email bloqueado', () => {
    expect(decideRecipient(lead({ email: '  ' }), ['es'])).toMatchObject({ send: false, reason: 'no_email' })
    expect(decideRecipient(lead({ emailBlocked: true }), ['es'])).toMatchObject({ send: false, reason: 'email_blocked' })
  })
})

describe('summarizeAudience', () => {
  it('cuenta envíos por idioma y omisiones por motivo', () => {
    const s = summarizeAudience([
      lead({ id: '1' }), lead({ id: '2', email: 'lead2@example.com', language: 'en' }), lead({ id: '3', emailBlocked: true }), lead({ id: '4', email: null }),
    ], ['es', 'en'])
    expect(s).toEqual({ total: 4, toSend: 2, byLanguage: { es: 1, en: 1 }, skipped: { email_blocked: 1, no_email: 1 } })
  })
})

describe('chunk', () => {
  it('parte en lotes del tamaño pedido', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 100)).toEqual([])
  })
})


describe('decideRecipients — un envío por email', () => {
  it('salta como duplicate_email al segundo lead con el mismo email (sin distinguir mayúsculas)', () => {
    const leads = [
      lead({ id: 'a', email: 'ana@example.com' }),
      lead({ id: 'b', email: ' ANA@example.com ' }),
      lead({ id: 'c', email: 'otro@example.com' }),
    ]
    const out = decideRecipients(leads, ['es', 'en'])
    expect(out.map(r => r.decision.send)).toEqual([true, false, true])
    expect(out[1].decision).toMatchObject({ send: false, reason: 'duplicate_email' })
  })

  it('un duplicado bloqueado no le quita el envío al otro', () => {
    const leads = [
      lead({ id: 'a', email: 'ana@example.com', emailBlocked: true }),
      lead({ id: 'b', email: 'ana@example.com' }),
    ]
    const out = decideRecipients(leads, ['es', 'en'])
    expect(out.map(r => r.decision.send)).toEqual([false, true])
  })

  it('summarizeAudience cuenta los duplicados como saltados', () => {
    const s = summarizeAudience([lead({ id: 'a', email: 'x@example.com' }), lead({ id: 'b', email: 'x@example.com' })], ['es', 'en'])
    expect(s.toSend).toBe(1)
    expect(s.skipped.duplicate_email).toBe(1)
  })
})
