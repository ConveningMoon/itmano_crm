import { describe, it, expect } from 'vitest'
import { templateValues, templateRawValues, templateFlags, paletteVars } from '@/lib/studio/templates/values'
import { DEFAULT_PALETTE } from '@/lib/studio/palettes'
import type { TemplateProps } from '@/lib/studio/templates/types'

const props = (over: Partial<TemplateProps> = {}): TemplateProps => ({
  heroPhoto: 'data:image/jpeg;base64,AAA', thumbPhotos: [], agentPhoto: null, logo: null,
  headline: 'Casa elegante', price: null, when: null, address: null, phone: null, cta: null,
  badge: 'NUEVA DISPONIBLE', stats: [], agentName: null, palette: DEFAULT_PALETTE,
  ...over,
})

describe('templateValues', () => {
  it('omite las claves sin dato en vez de ponerlas vacias', () => {
    const v = templateValues(props())
    expect(v.price).toBeUndefined()
    expect('price' in v).toBe(false)
  })

  it('numera las miniaturas desde 1 y corta en 3', () => {
    const v = templateValues(props({ thumbPhotos: ['a', 'b', 'c', 'd'] }))
    expect(v.thumb1).toBe('a')
    expect(v.thumb3).toBe('c')
    expect(v.thumb4).toBeUndefined()
  })

  it('numera las specs', () => {
    const v = templateValues(props({ stats: [{ icon: 'bed', value: '3 hab' }] }))
    expect(v.stat1).toBe('3 hab')
  })

  it('nombra cada spec por su icono, no por su posicion', () => {
    // Sin metros: bedrooms cae en la posicion 1 del array. Si el diseno
    // pintara el icono de regla en stat1, saldria junto al numero de
    // habitaciones — las nombradas atan el icono al dato, no al indice.
    const v = templateValues(props({
      stats: [{ icon: 'bed', value: '3 hab' }, { icon: 'bath', value: '2 baños' }],
    }))
    expect(v.statBedrooms).toBe('3 hab')
    expect(v.statBathrooms).toBe('2 baños')
    expect(v.statSqft).toBeUndefined()
    expect('statSqft' in v).toBe(false)
  })

  it('parte la fecha en dia y hora', () => {
    const v = templateValues(props({ when: '15 de agosto de 2026 · 11:00–14:00' }))
    expect(v.whenDay).toBe('15 de agosto de 2026')
    expect(v.whenTime).toBe('11:00–14:00')
    expect(v.when).toBe('15 de agosto de 2026 · 11:00–14:00')
  })

  it('no inventa hora cuando la fecha no la trae', () => {
    const v = templateValues(props({ when: '15 de agosto de 2026' }))
    expect(v.whenTime).toBeUndefined()
  })
})

describe('templateRawValues', () => {
  it('alterna el enfasis palabra a palabra', () => {
    const r = templateRawValues(props({ headline: 'Casa elegante y familiar' }))
    expect(r.headlineRitmo).toBe(
      '<span class="palabra">Casa</span> <span class="palabra-fuerte">elegante</span> '
      + '<span class="palabra">y</span> <span class="palabra-fuerte">familiar</span>',
    )
  })

  it('escapa cada palabra', () => {
    expect(templateRawValues(props({ headline: 'Ana & Luis' })).headlineRitmo).toContain('&amp;')
  })

  it('no emite nada sin titular', () => {
    expect(templateRawValues(props({ headline: '' })).headlineRitmo).toBeUndefined()
  })
})

describe('templateFlags', () => {
  it('marca lo que falta', () => {
    const f = templateFlags(props())
    expect(f).toContain('sin-precio')
    expect(f).toContain('sin-agente')
    expect(f).toContain('sin-logo')
    expect(f).not.toContain('sin-hero')
  })

  it('cuenta las fotos incluyendo el hero', () => {
    expect(templateFlags(props({ thumbPhotos: ['a', 'b'] }))).toContain('fotos-3')
  })

  it('cuenta cero fotos sin hero', () => {
    expect(templateFlags(props({ heroPhoto: null }))).toContain('fotos-0')
  })

  it('cuenta los bloques de texto para que el diseno se recoloque', () => {
    // badge + headline = 2
    expect(templateFlags(props())).toContain('datos-2')
    // badge + headline + price + address = 4
    expect(templateFlags(props({ price: '$1', address: 'Calle 1' }))).toContain('datos-4')
  })
})

describe('templateFlags — tramo del titular', () => {
  // Existe porque datos-N cuenta CUANTOS bloques hay, no cuanto ocupa uno: un
  // titular de 60 caracteres y otro de 20 daban exactamente las mismas clases.
  it('un titular corto sale como corto', () => {
    expect(templateFlags(props({ headline: 'Casa en venta' }))).toContain('titular-corto')
  })

  it('uno intermedio sale como medio', () => {
    // 33 caracteres sobre un limite de 60 = 55%
    expect(templateFlags(props({ headline: 'Casa elegante y familiar en venta' }))).toContain('titular-medio')
  })

  it('uno en el limite del formulario sale como largo', () => {
    const enElLimite = 'Casa de cuatro habitaciones con jardín y garaje en el centro'
    expect(enElLimite.length).toBe(60)
    expect(templateFlags(props({ headline: enElLimite }))).toContain('titular-largo')
  })

  it('sale exactamente UN tramo, nunca dos', () => {
    const tramos = templateFlags(props({ headline: 'Otra familia en su nuevo hogar' }))
      .filter(c => c.startsWith('titular-'))
    expect(tramos).toHaveLength(1)
  })

  it('sin titular no sale ningun tramo', () => {
    expect(templateFlags(props({ headline: '' })).filter(c => c.startsWith('titular-'))).toEqual([])
  })
})

describe('paletteVars', () => {
  it('expone los roles y los derivados', () => {
    const v = paletteVars(DEFAULT_PALETTE)
    expect(v.brand).toBe(DEFAULT_PALETTE.brand)
    expect(v['brand-dark']).toBeTypeOf('string')
    expect(v['on-brand']).toBeTypeOf('string')
    expect(v['on-photo']).toBeTypeOf('string')
  })
})
