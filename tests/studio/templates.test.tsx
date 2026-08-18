import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToPng } from '@/lib/studio/render/satori'
import { normalizePhoto, badgeFor } from '@/lib/studio/template-props'
import { TEMPLATES } from '@/lib/studio/templates/registry'
import type { TemplateProps } from '@/lib/studio/templates/types'
import type { StudioRecipe } from '@/lib/studio/types'

const OUT = process.env.STUDIO_OUT_DIR

// Fotos reales (casas neutras generadas una vez, ver
// scripts/gen-studio-fixtures.mjs). Con rectángulos de color no se puede juzgar
// si un diseño es publicable: el contraste del texto sobre una foto de verdad y
// el peso visual de las miniaturas solo se ven así. Pasan por normalizePhoto,
// el mismo camino que en producción.
const FIXTURE_DIR = join(process.cwd(), 'public', 'studio', 'fixtures')

/**
 * El logo va como PNG, no como WebP ni JPEG:
 *   · JPEG no tiene canal alfa → la marca acababa sobre un cuadro negro.
 *   · satori NO decodifica WebP → la descartaba en silencio y no salía nada.
 * En producción `tintLogo` ya emite PNG; esto solo replica ese formato.
 */
async function logoFixture(): Promise<string> {
  const png = await sharp(readFileSync(join(FIXTURE_DIR, 'logo-ejemplo.webp'))).png().toBuffer()
  return `data:image/png;base64,${png.toString('base64')}`
}

async function photo(name: string): Promise<string> {
  const uri = await normalizePhoto(readFileSync(join(FIXTURE_DIR, `${name}.webp`)))
  if (!uri) throw new Error(`No se pudo leer el fixture ${name}`)
  return uri
}

/**
 * Los datos que el CRM le pasaría a un diseño de ESA receta.
 *
 * No es un detalle del test: de aquí salen las miniaturas del selector
 * (scripts/gen-template-thumbs.mjs). Con un fixture único, los seis diseños de
 * casa abierta y vendida se anunciaban en el selector como "NUEVA DISPONIBLE" y
 * enseñaban un precio que esas recetas no tienen.
 */
async function props(recipe: StudioRecipe, over: Partial<TemplateProps> = {}): Promise<TemplateProps> {
  const esVenta  = recipe === 'new_listing'
  const esCierre = recipe === 'sold'
  const esEvento = recipe === 'event'

  return {
    heroPhoto:   await photo('casa-fachada'),
    thumbPhotos: [await photo('casa-salon'), await photo('casa-comedor'), await photo('casa-atardecer')],
    // Con null, las MINIATURAS del selector enseñaban un diseño con dos huecos
    // invisibles: no se veía dónde caen la foto del agente ni el logo.
    agentPhoto:  await photo('agente-ejemplo'),
    logo:        await logoFixture(),
    headline:    esCierre ? 'Otra familia en su nuevo hogar'
               : esEvento ? 'Seminario para compradores primerizos'
               : recipe === 'open_house' ? 'Te esperamos este sábado'
               : 'Casa elegante y familiar en venta',
    // Solo una venta publica cifra: un cierre dejó de hacerlo, una casa abierta
    // nunca la tuvo y un evento dejó de pedirla.
    price:       esVenta ? '$274,400' : null,
    when:        recipe === 'open_house' ? '15 de agosto de 2026 · 11:00–14:00'
               : esEvento ? '1 de septiembre de 2026 · 18:00'
               : null,
    // En un evento este hueco lo ocupa el LUGAR.
    address:     esEvento ? 'Centro Comunitario Ghent' : '1909 Ocean View Avenue, Norfolk, VA',
    phone:       '+1 757 555 0199',
    // La nota del cierre se retiró; en un evento el hueco lo ocupa el registro.
    cta:         esEvento ? 'Regístrate en itmano.com/eventos' : null,
    badge:       badgeFor(recipe),
    // Las specs solo existen en la receta de venta: statsFor las devuelve vacías
    // para las otras dos.
    stats: esVenta
      ? [
          { icon: 'ruler', value: '1,548 sqft' },
          { icon: 'bed',   value: '3 hab' },
          { icon: 'bath',  value: '2 baños' },
        ]
      : [],
    agentName: 'Adriana Melendez',
    palette:   { brand: '#1B2A41', surface: '#FBF6EE', ink: '#1B2A41', logo: '#1B2A41' },
    ...over,
  }
}

describe('templates', () => {
  for (const t of TEMPLATES) {
    // Un diseño declara para qué recetas sirve; hoy cada uno sirve para una.
    const recipe = t.recipes[0]

    it(`${t.key} rinde 1080x1350`, async () => {
      const png = await renderToPng(t.render(await props(recipe)), { width: 1080, height: 1350 })
      const meta = await sharp(png).metadata()
      expect(meta.width).toBe(1080)
      expect(meta.height).toBe(1350)
      expect(meta.format).toBe('png')
      if (OUT) writeFileSync(`${OUT}/${t.key}.png`, png)
    })

    it(`${t.key} rinde sin portada de agente y sin logo`, async () => {
      const png = await renderToPng(t.render(await props(recipe, { agentPhoto: null, logo: null })), { width: 1080, height: 1350 })
      expect((await sharp(png).metadata()).height).toBe(1350)
    })

    it(`${t.key} aguanta un titular y una dirección larguísimos`, async () => {
      const png = await renderToPng(t.render(await props(recipe, {
        headline: 'Una casa absolutamente espectacular y enorme junto al agua con vistas',
        address:  'Un nombre de calle desmesuradamente largo, Virginia Beach, Virginia, Estados Unidos',
      })), { width: 1080, height: 1350 })
      expect((await sharp(png).metadata()).width).toBe(1080)
    })

    it(`${t.key} rinde sin miniaturas`, async () => {
      const png = await renderToPng(t.render(await props(recipe, { thumbPhotos: [] })), { width: 1080, height: 1350 })
      expect((await sharp(png).metadata()).width).toBe(1080)
    })

    it(`${t.key} rinde sin specs`, async () => {
      const png = await renderToPng(t.render(await props(recipe, { stats: [] })), { width: 1080, height: 1350 })
      expect((await sharp(png).metadata()).width).toBe(1080)
    })

    // Un cierre sin cifra es lo normal: muchos agentes no publican por cuánto
    // vendieron. Y una casa abierta no tiene precio en absoluto.
    it(`${t.key} rinde sin precio`, async () => {
      const png = await renderToPng(t.render(await props(recipe, { price: null })), { width: 1080, height: 1350 })
      expect((await sharp(png).metadata()).height).toBe(1350)
    })

    it(`${t.key} rinde sin nota y sin fecha`, async () => {
      const png = await renderToPng(t.render(await props(recipe, { cta: null, when: null })), { width: 1080, height: 1350 })
      expect((await sharp(png).metadata()).height).toBe(1350)
    })
  }
})
