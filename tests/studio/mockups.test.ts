import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  MOCKUP_SLOTS, mockupSlot, fallbackMockups, resolveMockups, isFallbackUrl,
} from '@/lib/studio/mockups'
import { imageKeysIn, IMAGE_KEYS } from '@/lib/studio/templates/slots'

describe('catalogo de mockups', () => {
  it('cubre las seis claves de imagen del contrato', () => {
    expect(MOCKUP_SLOTS.map(s => s.key))
      .toEqual(['hero', 'thumb1', 'thumb2', 'thumb3', 'agentPhoto', 'logo'])
  })

  it('cada imagen de reserva existe de verdad en el repo', () => {
    for (const slot of MOCKUP_SLOTS) {
      const ruta = join(process.cwd(), 'public', slot.fallback.replace(/^\//, ''))
      expect(existsSync(ruta), slot.fallback).toBe(true)
    }
  })

  it('marca como alfa solo las que la necesitan', () => {
    const conAlfa = MOCKUP_SLOTS.filter(s => s.keepsAlpha).map(s => s.key)
    expect(conAlfa).toEqual(['agentPhoto', 'logo'])
  })

  it('cada hueco tiene etiqueta y pista en espanol, sin quedarse vacias', () => {
    for (const slot of MOCKUP_SLOTS) {
      expect(slot.label.length, slot.key).toBeGreaterThan(0)
      expect(slot.hint.length, slot.key).toBeGreaterThan(0)
    }
  })

  it('mockupSlot devuelve null para una clave inventada', () => {
    expect(mockupSlot('no-existe')).toBeNull()
  })

  // El catálogo y el vocabulario del contrato son dos listas distintas a
  // propósito (una es presentación, la otra es el contrato). Si se separan, el
  // panel enseñaría un hueco que el HTML no puede usar, o al revés.
  it('el catalogo y las claves de imagen del contrato no se separan', () => {
    expect(MOCKUP_SLOTS.map(s => s.key)).toEqual(IMAGE_KEYS)
  })
})

describe('resolveMockups', () => {
  it('sin nada subido devuelve las seis de reserva', () => {
    expect(resolveMockups({})).toEqual(fallbackMockups())
  })

  it('lo subido gana sobre la de reserva', () => {
    const r = resolveMockups({ hero: 'https://bucket/mockups/hero.jpg' })
    expect(r.hero).toBe('https://bucket/mockups/hero.jpg')
  })

  it('lo que no se subio sigue cayendo a la de reserva', () => {
    const r = resolveMockups({ hero: 'https://bucket/mockups/hero.jpg' })
    expect(isFallbackUrl(r.thumb1)).toBe(true)
    expect(isFallbackUrl(r.logo)).toBe(true)
  })

  it('nunca deja un hueco vacio', () => {
    const r = resolveMockups({ hero: '', logo: '' })
    for (const slot of MOCKUP_SLOTS) expect(r[slot.key], slot.key).toBeTruthy()
  })

  it('ignora claves que no son huecos de imagen', () => {
    const r = resolveMockups({ headline: 'https://bucket/no.jpg' })
    expect(r.headline).toBeUndefined()
  })
})

describe('imageKeysIn — que huecos ensena el panel', () => {
  it('devuelve solo las claves de imagen que el html usa', () => {
    expect(imageKeysIn('<img src="{{hero}}"><h1>{{headline}}</h1>')).toEqual(['hero'])
  })

  it('las reconoce dentro de secciones', () => {
    expect(imageKeysIn('{{#logo}}<img src="{{logo}}">{{/logo}}')).toEqual(['logo'])
  })

  it('las devuelve en el orden del catalogo, no en el del html', () => {
    const html = '<img src="{{logo}}"><img src="{{thumb2}}"><img src="{{hero}}">'
    expect(imageKeysIn(html)).toEqual(['hero', 'thumb2', 'logo'])
  })

  it('no repite una clave usada dos veces', () => {
    expect(imageKeysIn('<img src="{{hero}}"><img src="{{hero}}">')).toEqual(['hero'])
  })

  it('un diseno sin imagenes no ensena ningun hueco', () => {
    expect(imageKeysIn('<h1>{{headline}}</h1><p>{{price}}</p>')).toEqual([])
  })

  it('ignora claves de texto aunque se parezcan', () => {
    expect(imageKeysIn('<p>{{address}} {{agentName}}</p>')).toEqual([])
  })
})

describe('los ocho disenos sembrados declaran huecos coherentes', () => {
  const SEED = join(process.cwd(), 'src', 'lib', 'studio', 'templates', 'seed')

  it('cada uno usa solo claves del catalogo, y las de mosaico piden miniaturas', () => {
    const mosaico = readFileSync(join(SEED, 'mosaico-listing', 'template.html'), 'utf8')
    const claves = imageKeysIn(mosaico)
    expect(claves).toContain('hero')
    expect(claves).toContain('thumb1')
    // Todas las que salgan tienen que estar en el catálogo: si un diseño usara
    // una clave de imagen que el panel no conoce, no habría cómo cambiarla.
    for (const clave of claves) expect(mockupSlot(clave), clave).not.toBeNull()
  })

  it('un diseno de foto completa no pide miniaturas', () => {
    const completa = readFileSync(join(SEED, 'completa-listing', 'template.html'), 'utf8')
    expect(imageKeysIn(completa)).not.toContain('thumb1')
  })
})
