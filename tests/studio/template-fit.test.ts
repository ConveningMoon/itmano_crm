import { describe, it, expect } from 'vitest'
import { templateFit as fitMeta, templatesForRecipeIn, findTemplateIn, type TemplateMeta } from '@/lib/studio/templates/meta'

const meta = (over: Partial<TemplateMeta> = {}): TemplateMeta => ({
  key: 'x', label: 'X', hint: '', recipes: ['new_listing'], aspects: ['4:5'],
  slots: { required: ['photo.hero'], optional: ['photo.agent'] }, idealPhotos: 4, thumbUrl: null,
  ...over,
})

describe('templateFit sobre metadatos', () => {
  it('no es usable sin fotos cuando el diseno exige hero', () => {
    expect(fitMeta(meta(), { photoCount: 0, hasAgentPhoto: true }).usable).toBe(false)
  })

  it('es usable sin fotos cuando el diseno no exige hero', () => {
    const sinHero = meta({ slots: { required: [], optional: [] }, idealPhotos: 0 })
    expect(fitMeta(sinHero, { photoCount: 0, hasAgentPhoto: false }).usable).toBe(true)
  })

  it('avisa de cuantas fotos faltan sin bloquear', () => {
    const r = fitMeta(meta(), { photoCount: 2, hasAgentPhoto: true })
    expect(r.usable).toBe(true)
    expect(r.warnings[0]).toBe('Mejor con 4 fotos, tienes 2')
  })

  it('avisa del hueco del agente solo si el diseno lo admite', () => {
    expect(fitMeta(meta(), { photoCount: 4, hasAgentPhoto: false }).warnings)
      .toContain('Sin portada del agente, ese espacio queda vacío')
  })
})

describe('busquedas sobre la lista', () => {
  const lista = [meta({ key: 'a' }), meta({ key: 'b', recipes: ['sold'] })]

  it('filtra por receta', () => {
    expect(templatesForRecipeIn(lista, 'sold').map(t => t.key)).toEqual(['b'])
  })

  it('devuelve null para una clave inventada', () => {
    expect(findTemplateIn(lista, 'no-existe')).toBeNull()
  })
})
