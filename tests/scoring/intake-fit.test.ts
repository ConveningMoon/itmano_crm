/**
 * Unit tests for the intake fit-extraction helper (FASE 1 of intake scoring wiring).
 * Pure functions — no database. Validates intent normalization and the intent-scoped
 * extraction of recognized fit dimensions from the self-describing answers array.
 */

import { describe, it, expect } from 'vitest'
import { normalizeIntent, extractFitDimensions } from '@/lib/services/intake-fit'

describe('normalizeIntent', () => {
  it('maps buyer spellings to "buy"', () => {
    for (const v of ['buy', 'Compra', ' comprar ', 'COMPRADOR', 'purchase']) {
      expect(normalizeIntent(v)).toBe('buy')
    }
  })
  it('maps investor spellings to "invest"', () => {
    for (const v of ['invest', 'invierte', 'invertir', 'inversionista']) {
      expect(normalizeIntent(v)).toBe('invest')
    }
  })
  it('maps seller spellings to "sell"', () => {
    for (const v of ['sell', 'vende', 'vender', 'vendedor']) {
      expect(normalizeIntent(v)).toBe('sell')
    }
  })
  it('returns null for unknown / non-string', () => {
    expect(normalizeIntent('rent')).toBeNull()
    expect(normalizeIntent(undefined)).toBeNull()
    expect(normalizeIntent(42)).toBeNull()
  })
})

describe('extractFitDimensions', () => {
  it('extracts buyer fit dimensions and ignores free-text keys', () => {
    const answers = [
      { key: 'timeline',    value: 'under_3_months' },
      { key: 'financing',   value: 'cash' },
      { key: 'budget_tier', value: 'premium' },
      { key: 'agent_status', value: 'sin_agente' },
      { key: 'comments',    value: 'me gustaría una casa con jardín' }, // free text → ignored
    ]
    expect(extractFitDimensions('buy', answers)).toEqual({
      timeline: 'under_3_months',
      financing: 'cash',
      budget_tier: 'premium',
      agent_status: 'sin_agente',
    })
  })

  it('scopes by intent — a buyer form cannot inject seller dimensions', () => {
    const answers = [
      { key: 'timeline',        value: '3_6_months' },
      { key: 'sell_motivation', value: 'alta' },   // not a buyer dimension → ignored
    ]
    expect(extractFitDimensions('buy', answers)).toEqual({ timeline: '3_6_months' })
  })

  it('extracts seller fit dimensions', () => {
    const answers = [
      { key: 'sell_motivation', value: 'alta' },
      { key: 'listing_status',  value: 'no_listado_sin_agente' },
      { key: 'financing',       value: 'cash' }, // not a seller dimension → ignored
    ]
    expect(extractFitDimensions('sell', answers)).toEqual({
      sell_motivation: 'alta',
      listing_status: 'no_listado_sin_agente',
    })
  })

  it('falls back to all recognized dimensions when intent is unknown', () => {
    const answers = [
      { key: 'timeline',        value: '6_12_months' },
      { key: 'sell_motivation', value: 'media' },
      { key: 'random',          value: 'x' },
    ]
    expect(extractFitDimensions(null, answers)).toEqual({
      timeline: '6_12_months',
      sell_motivation: 'media',
    })
  })

  it('drops empty values (does not overwrite known answers with blanks)', () => {
    const answers = [
      { key: 'timeline',  value: '   ' },
      { key: 'financing', value: 'preapproved' },
    ]
    expect(extractFitDimensions('buy', answers)).toEqual({ financing: 'preapproved' })
  })

  it('returns an empty object for no answers', () => {
    expect(extractFitDimensions('buy', undefined)).toEqual({})
    expect(extractFitDimensions('buy', [])).toEqual({})
  })
})
