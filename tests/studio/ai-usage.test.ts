import { describe, it, expect } from 'vitest'
import { computeCostUsd, AI_FEATURE_LABELS, IMAGE_UNIT_COST_USD } from '@/lib/services/ai-usage'

describe('ledger de IA del estudio', () => {
  it('las dos features nuevas tienen etiqueta legible', () => {
    expect(AI_FEATURE_LABELS.studio_prompt).toBeTruthy()
    expect(AI_FEATURE_LABELS.studio_image).toBeTruthy()
  })

  it('el costo por tokens de haiku sigue calculándose igual', () => {
    expect(computeCostUsd('claude-haiku-4-5', { input_tokens: 1_000_000, output_tokens: 0 })).toBe(1)
    expect(computeCostUsd('claude-haiku-4-5', { input_tokens: 0, output_tokens: 1_000_000 })).toBe(5)
  })

  it('la imagen tiene un costo fijo por unidad, no por tokens', () => {
    expect(IMAGE_UNIT_COST_USD).toBeGreaterThan(0)
    expect(IMAGE_UNIT_COST_USD).toBeLessThan(1)
  })
})
