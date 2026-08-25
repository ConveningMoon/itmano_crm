import { describe, it, expect } from 'vitest'
import { webSearchCostUsd, WEB_SEARCH_UNIT_COST_USD, AI_FEATURE_LABELS } from '@/lib/services/ai-usage'

describe('coste de la busqueda web', () => {
  it('cobra por busqueda, a 10 USD el millar', () => {
    expect(WEB_SEARCH_UNIT_COST_USD).toBe(0.01)
    expect(webSearchCostUsd(0)).toBe(0)
    expect(webSearchCostUsd(6)).toBeCloseTo(0.06, 10)
  })

  it('nunca devuelve negativo aunque le pasen basura', () => {
    expect(webSearchCostUsd(-3)).toBe(0)
  })
})

describe('etiquetas de las features nuevas', () => {
  it('las tres de newsletters tienen etiqueta en espanol', () => {
    expect(AI_FEATURE_LABELS.newsletter_research).toBe('Newsletters · Investigación')
    expect(AI_FEATURE_LABELS.newsletter_draft).toBe('Newsletters · Redacción')
    expect(AI_FEATURE_LABELS.newsletter_cover).toBe('Newsletters · Portada')
  })
})
