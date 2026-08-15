import { describe, it, expect } from 'vitest'
import { templateFit, templatesForRecipe, findTemplate, TEMPLATES } from '@/lib/studio/templates/registry'

describe('registro de templates', () => {
  it('cada receta de casa tiene exactamente tres diseños', () => {
    for (const recipe of ['new_listing', 'open_house', 'sold'] as const) {
      expect(templatesForRecipe(recipe)).toHaveLength(3)
    }
  })

  it('event y open_prompt no tienen diseños: usan el compositor de bandas', () => {
    expect(templatesForRecipe('event')).toHaveLength(0)
    expect(templatesForRecipe('open_prompt')).toHaveLength(0)
  })

  it('las claves son únicas y todos declaran 4:5', () => {
    const keys = TEMPLATES.map(t => t.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const t of TEMPLATES) expect(t.aspects).toContain('4:5')
  })

  it('findTemplate devuelve null para una clave inventada', () => {
    expect(findTemplate('no-existe')).toBeNull()
  })
})

describe('templateFit', () => {
  const mosaico = findTemplate('mosaico-listing')!

  it('sin avisos cuando hay fotos de sobra', () => {
    const fit = templateFit(mosaico, { photoCount: 5, hasAgentPhoto: true })
    expect(fit.warnings).toHaveLength(0)
    expect(fit.usable).toBe(true)
  })

  it('avisa por cantidad de fotos pero NUNCA bloquea', () => {
    const fit = templateFit(mosaico, { photoCount: 1, hasAgentPhoto: false })
    expect(fit.warnings.length).toBeGreaterThan(0)
    expect(fit.warnings[0]).toContain('fotos')
    // Avisar no es impedir: la decisión es del agente.
    expect(fit.usable).toBe(true)
  })

  it('el aviso habla de cantidad, no de calidad', () => {
    const fit = templateFit(mosaico, { photoCount: 2, hasAgentPhoto: false })
    expect(fit.warnings.join(' ')).not.toMatch(/buena|mala|calidad/i)
  })

  it('sin ninguna foto no es usable: no hay con qué llenar el slot obligatorio', () => {
    expect(templateFit(mosaico, { photoCount: 0, hasAgentPhoto: false }).usable).toBe(false)
  })
})
