import { describe, it, expect } from 'vitest'
import { templateFit, templatesForRecipe, findTemplate, TEMPLATES } from '@/lib/studio/templates/registry'

describe('registro de templates', () => {
  it('cada receta de casa tiene exactamente tres diseños', () => {
    for (const recipe of ['new_listing', 'open_house', 'sold'] as const) {
      expect(templatesForRecipe(recipe)).toHaveLength(3)
    }
  })

  it('los tres diseños de evento tienen imagen principal', () => {
    const evento = templatesForRecipe('event')
    expect(evento).toHaveLength(3)
    // Un evento no sale del módulo de propiedades, así que su imagen viene de
    // una de las otras dos vías: subirla (gratis) o describirla (con IA). Que
    // los tres la tengan es lo que hace que la subida no sea opcional.
    for (const t of evento) {
      expect([...t.slots.required, ...t.slots.optional]).toContain('photo.hero')
      expect(t.idealPhotos).toBeGreaterThan(0)
    }
  })

  it('open_prompt no tiene diseños: la imagen sale tal cual del modelo', () => {
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
