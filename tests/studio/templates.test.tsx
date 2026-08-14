import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToPng } from '@/lib/studio/render/satori'
import { normalizePhoto } from '@/lib/studio/template-props'
import { TEMPLATES } from '@/lib/studio/templates/registry'
import type { TemplateProps } from '@/lib/studio/templates/types'

const OUT = process.env.STUDIO_OUT_DIR

// Fotos reales (casas neutras generadas una vez, ver
// scripts/gen-studio-fixtures.mjs). Con rectángulos de color no se puede juzgar
// si un diseño es publicable: el contraste del texto sobre una foto de verdad y
// el peso visual de las miniaturas solo se ven así. Pasan por normalizePhoto,
// el mismo camino que en producción.
const FIXTURE_DIR = join(process.cwd(), 'public', 'studio', 'fixtures')

async function photo(name: string): Promise<string> {
  const uri = await normalizePhoto(readFileSync(join(FIXTURE_DIR, `${name}.webp`)))
  if (!uri) throw new Error(`No se pudo leer el fixture ${name}`)
  return uri
}

async function props(over: Partial<TemplateProps> = {}): Promise<TemplateProps> {
  return {
    heroPhoto:   await photo('casa-fachada'),
    thumbPhotos: [await photo('casa-salon'), await photo('casa-comedor'), await photo('casa-atardecer')],
    // Con null, las MINIATURAS del selector enseñaban un diseño con dos huecos
    // invisibles: no se veía dónde caen la foto del agente ni el logo.
    agentPhoto:  await photo('agente-ejemplo'),
    // El logo NO pasa por normalizePhoto: eso convierte a JPEG y el JPEG no tiene
    // canal alfa, así que la marca acababa sobre un cuadro negro. En producción
    // el logo va por tintLogo, que sí conserva la transparencia.
    logo:        `data:image/webp;base64,${readFileSync(join(FIXTURE_DIR, 'logo-ejemplo.webp')).toString('base64')}`,
    headline:    'Casa elegante y familiar en venta',
    price:       '$274,400',
    when:        '15 de agosto de 2026 · 11:00–14:00',
    address:     '1909 Ocean View Avenue, Norfolk, VA',
    phone:       '+1 757 555 0199',
    cta:         null,
    badge:       'NUEVA DISPONIBLE',
    stats: [
      { icon: 'ruler', value: '1,548 sqft' },
      { icon: 'bed',   value: '3 hab' },
      { icon: 'bath',  value: '2 baños' },
    ],
    agentName: 'Adriana Melendez',
    palette:   { brand: '#1B2A41', surface: '#FBF6EE', ink: '#1B2A41' },
    ...over,
  }
}

describe('templates', () => {
  for (const t of TEMPLATES) {
    it(`${t.key} rinde 1080x1350`, async () => {
      const png = await renderToPng(t.render(await props()), { width: 1080, height: 1350 })
      const meta = await sharp(png).metadata()
      expect(meta.width).toBe(1080)
      expect(meta.height).toBe(1350)
      expect(meta.format).toBe('png')
      if (OUT) writeFileSync(`${OUT}/${t.key}.png`, png)
    })

    it(`${t.key} rinde sin portada de agente y sin logo`, async () => {
      const png = await renderToPng(t.render(await props({ agentPhoto: null, logo: null })), { width: 1080, height: 1350 })
      expect((await sharp(png).metadata()).height).toBe(1350)
    })

    it(`${t.key} aguanta un titular y una dirección larguísimos`, async () => {
      const png = await renderToPng(t.render(await props({
        headline: 'Una casa absolutamente espectacular y enorme junto al agua con vistas',
        address:  'Un nombre de calle desmesuradamente largo, Virginia Beach, Virginia, Estados Unidos',
      })), { width: 1080, height: 1350 })
      expect((await sharp(png).metadata()).width).toBe(1080)
    })

    it(`${t.key} rinde sin miniaturas`, async () => {
      const png = await renderToPng(t.render(await props({ thumbPhotos: [] })), { width: 1080, height: 1350 })
      expect((await sharp(png).metadata()).width).toBe(1080)
    })

    it(`${t.key} rinde sin specs`, async () => {
      const png = await renderToPng(t.render(await props({ stats: [] })), { width: 1080, height: 1350 })
      expect((await sharp(png).metadata()).width).toBe(1080)
    })
  }
})
