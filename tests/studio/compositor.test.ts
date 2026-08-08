import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'
import { composeStudioImage } from '@/lib/studio/compositor'
import { parseStudioForm, type StudioForm } from '@/lib/studio/recipes'
import { CANVAS } from '@/lib/studio/canvas'
import type { Aspect, StudioBrand } from '@/lib/studio/types'

const OUT = process.env.STUDIO_OUT_DIR // opcional: volcar PNGs para QA visual

const brand: StudioBrand = {
  tenant_name: 'A&J Real Estate Group',
  logo_url: null,
  primary_color: '#1B2A41',
  agent_name: 'Adriana Melendez',
  agent_phone: '+1 757 555 0199',
}

async function fakeBg(aspect: Aspect): Promise<Buffer> {
  const { width, height } = CANVAS[aspect]
  return sharp({ create: { width, height, channels: 3, background: { r: 150, g: 120, b: 86 } } })
    .png().toBuffer()
}

function form(input: Record<string, unknown>): StudioForm {
  const r = parseStudioForm(input)
  if (!r.ok) throw new Error(`fixture inválido: ${r.error}`)
  return r.data
}

const base = { style: 'editorial', palette: ['#1B2A41'] }

const fixtures = (aspect: Aspect) => [
  form({ ...base, aspect, recipe: 'open_house', address: '123 Ocean View Ave, Norfolk, VA', date: '2026-08-15', time_start: '11:00', time_end: '14:00', refreshments: true }),
  form({ ...base, aspect, recipe: 'new_listing', address: '9 Bay Street, Virginia Beach, VA', price: 450000, bedrooms: 4, bathrooms: 2.5, sqft: 2400, highlights: ['Piscina', 'Cocina nueva'] }),
  form({ ...base, aspect, recipe: 'sold', address: 'Ghent, Norfolk', show_price: true, price: 389000, note: 'Vendida en 9 días' }),
  form({ ...base, aspect, recipe: 'event', title: 'Seminario para compradores primerizos', date: '2026-09-01', time_start: '18:00', venue: 'Centro Comunitario Ghent', is_free: true, signup: 'itmano.com/eventos' }),
  form({ ...base, aspect, recipe: 'open_prompt', prompt: 'una llave dorada sobre mármol' }),
]

describe('studio compositor', () => {
  for (const aspect of ['1:1', '4:5', '9:16'] as const) {
    it(`compone las cinco recetas en ${aspect} con las dimensiones exactas`, async () => {
      for (const f of fixtures(aspect)) {
        const png = await composeStudioImage({ form: f, brand, background: await fakeBg(aspect), textZone: 'bottom' })
        const meta = await sharp(png).metadata()
        expect(meta.width).toBe(CANVAS[aspect].width)
        expect(meta.height).toBe(CANVAS[aspect].height)
        expect(meta.format).toBe('png')
        if (OUT) writeFileSync(`${OUT}/${f.recipe}-${aspect.replace(':', 'x')}.png`, png)
      }
    })
  }

  it('sin fondo también compone (degradación a procedural)', async () => {
    const [openHouse] = fixtures('4:5')
    const png = await composeStudioImage({ form: openHouse, brand, background: null, textZone: 'bottom' })
    expect((await sharp(png).metadata()).height).toBe(1350)
  })

  it('el prompt abierto no escribe nada encima de la imagen', async () => {
    const openPrompt = fixtures('1:1')[4]
    const composed = await composeStudioImage({ form: openPrompt, brand, background: await fakeBg('1:1'), textZone: 'bottom' })
    // Sin texto ni degradado, la imagen conserva el color plano del fondo.
    const stats = await sharp(composed).stats()
    expect(stats.channels[0].stdev).toBeLessThan(3)
  })

  it('una receta con datos sí escribe encima (contraste con el caso anterior)', async () => {
    const [openHouse] = fixtures('1:1')
    const composed = await composeStudioImage({ form: openHouse, brand, background: await fakeBg('1:1'), textZone: 'bottom' })
    const stats = await sharp(composed).stats()
    expect(stats.channels[0].stdev).toBeGreaterThan(3)
  })

  it('un texto larguísimo no desborda: se trunca', async () => {
    const long = form({
      ...base, aspect: '1:1', recipe: 'sold',
      address: 'Una zona con un nombre absurdamente largo que jamás cabría en la banda inferior de un cuadrado',
      show_price: false,
    })
    const png = await composeStudioImage({ form: long, brand, background: await fakeBg('1:1'), textZone: 'bottom' })
    expect((await sharp(png).metadata()).width).toBe(1080)
  })

  it('9:16 cae a bottom si le piden una banda lateral', async () => {
    const [openHouse] = fixtures('9:16')
    const png = await composeStudioImage({ form: openHouse, brand, background: await fakeBg('9:16'), textZone: 'left' })
    expect((await sharp(png).metadata()).height).toBe(1920)
  })
})
