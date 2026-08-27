import { describe, it, expect } from 'vitest'
import { webSearchCostUsd, WEB_SEARCH_UNIT_COST_USD, AI_FEATURE_LABELS, type AiFeature } from '@/lib/services/ai-usage'

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
    expect(AI_FEATURE_LABELS.newsletter_sources).toBe('Newsletters · Fuentes del mercado')
  })
})

// `AiFeature` no es enumerable en runtime (es un tipo, se borra al compilar),
// así que la cobertura se ata a mano con esta lista literal. El truco está en
// tiparla como `Record<AiFeature, true>`: si alguien añade un valor a la
// unión `AiFeature` y no lo agrega aquí, `tsc` falla por propiedad faltante
// ANTES de que el test corra. Y si alguien agrega la feature aquí pero se
// olvida de ponerle etiqueta en `AI_FEATURE_LABELS` (o la escribe con un typo
// en la clave), el test de abajo se pone en rojo. Ninguno de los dos casos
// pasa en silencio — que es justo lo que permitió que el panel de uso
// mostrara features en snake_case antes de este fix.
const ALL_FEATURES: Record<AiFeature, true> = {
  property_intake:     true,
  email_draft:          true,
  sequence_bootstrap:   true,
  hosted_page_copy:     true,
  lead_fit:             true,
  carousel_copy:        true,
  studio_prompt:        true,
  studio_image:         true,
  newsletter_sources:   true,
  newsletter_research:  true,
  newsletter_draft:     true,
  newsletter_cover:     true,
}

describe('cobertura completa de AI_FEATURE_LABELS', () => {
  it('toda AiFeature declarada tiene una etiqueta no vacia', () => {
    for (const feature of Object.keys(ALL_FEATURES) as AiFeature[]) {
      expect(AI_FEATURE_LABELS[feature]).toBeTruthy()
    }
  })

  it('toda clave del mapa corresponde a una AiFeature declarada', () => {
    const known = new Set(Object.keys(ALL_FEATURES))
    for (const key of Object.keys(AI_FEATURE_LABELS)) {
      expect(known.has(key)).toBe(true)
    }
  })
})
