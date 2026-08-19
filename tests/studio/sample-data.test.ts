import { describe, it, expect } from 'vitest'
import { sampleProps, SCENARIOS } from '@/lib/studio/sample-data'

describe('escenarios de ejemplo', () => {
  it('ofrece los cuatro casos', () => {
    expect(SCENARIOS.map(s => s.key)).toEqual(['completo', 'minimo', 'titular-largo', 'sin-agente'])
  })

  it('el completo trae todo lo que la receta publica', () => {
    const p = sampleProps('new_listing', 'completo')
    expect(p.heroPhoto).toBeTruthy()
    expect(p.thumbPhotos).toHaveLength(3)
    expect(p.agentPhoto).toBeTruthy()
    expect(p.logo).toBeTruthy()
    expect(p.price).toBeTruthy()
    expect(p.stats.length).toBeGreaterThan(0)
  })

  it('el minimo deja solo lo imprescindible', () => {
    const p = sampleProps('new_listing', 'minimo')
    expect(p.thumbPhotos).toHaveLength(0)
    expect(p.agentPhoto).toBeNull()
    expect(p.address).toBeNull()
    expect(p.stats).toHaveLength(0)
    expect(p.headline).toBeTruthy()
  })

  it('el titular largo es de verdad largo', () => {
    expect(sampleProps('new_listing', 'titular-largo').headline.length).toBeGreaterThan(60)
  })

  it('sin-agente quita la foto y el nombre', () => {
    const p = sampleProps('sold', 'sin-agente')
    expect(p.agentPhoto).toBeNull()
    expect(p.agentName).toBeNull()
  })

  it('cada receta trae lo suyo y no lo ajeno', () => {
    expect(sampleProps('new_listing', 'completo').price).toBeTruthy()
    expect(sampleProps('sold', 'completo').price).toBeNull()
    expect(sampleProps('open_house', 'completo').when).toBeTruthy()
    expect(sampleProps('event', 'completo').cta).toBeTruthy()
  })

  it('las fotos van por URL para que el iframe las pueda pedir', () => {
    expect(sampleProps('new_listing', 'completo').heroPhoto).toMatch(/^\/studio\/fixtures\//)
  })
})
