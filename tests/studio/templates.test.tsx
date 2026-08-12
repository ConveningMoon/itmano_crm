import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'
import { renderToPng } from '@/lib/studio/render/satori'
import { TEMPLATES } from '@/lib/studio/templates/registry'
import type { TemplateProps } from '@/lib/studio/templates/types'

const OUT = process.env.STUDIO_OUT_DIR

async function photo(r: number, g: number, b: number): Promise<string> {
  const png = await sharp({ create: { width: 600, height: 450, channels: 3, background: { r, g, b } } })
    .png().toBuffer()
  return `data:image/png;base64,${png.toString('base64')}`
}

async function props(over: Partial<TemplateProps> = {}): Promise<TemplateProps> {
  return {
    heroPhoto:   await photo(120, 150, 190),
    thumbPhotos: [await photo(200, 200, 195), await photo(180, 175, 170), await photo(160, 165, 175)],
    agentPhoto:  null,
    logo:        null,
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
    palette:   { primary: '#1B2A41', ink: '#FFFFFF', surface: '#FBF6EE' },
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
