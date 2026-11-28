import { describe, it, expect } from 'vitest'
import { asksFitQuestions } from '@/lib/sources/fit-questions'

// Espejo de channel_asks_fit_questions (SQL); tests/scoring/quality-band-ties
// fija lo mismo contra la base.
describe('asksFitQuestions', () => {
  it('sin valor explícito decide el tipo de la fuente', () => {
    expect(asksFitQuestions('lead_magnet', null)).toBe(true)
    expect(asksFitQuestions('contact_form', undefined)).toBe(true)
    expect(asksFitQuestions('manychat_flow', null)).toBe(true)
    expect(asksFitQuestions('event', null)).toBe(false)
    expect(asksFitQuestions('newsletter', null)).toBe(false)
    expect(asksFitQuestions('manual', null)).toBe(false)
    expect(asksFitQuestions(null, null)).toBe(false)
  })

  it('el valor explícito manda sobre el tipo', () => {
    expect(asksFitQuestions('event', true)).toBe(true)
    expect(asksFitQuestions('lead_magnet', false)).toBe(false)
  })
})
