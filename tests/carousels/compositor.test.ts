import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'
import { composeSlide } from '@/lib/carousels/compositor'
import type { CarouselBrandProfile, SlideCopy } from '@/lib/carousels/types'

const OUT = process.env.CAROUSEL_OUT_DIR // opcional: volcar PNGs para QA visual

const brand: CarouselBrandProfile = {
  agent_id: 'agent-adriana', tenant_id: 'aj-real-estate', display_name: 'Adriana Melendez',
  instagram_handle: '@adrysofi_realestate', agency_name: 'A&J Real Estate Group',
  market: 'Virginia & North Carolina', language: 'es', brand_voice: null, active: true,
}

// Fondo editorial simulado (Nano Banana lo reemplaza en producción).
async function fakeBg(): Promise<Buffer> {
  return sharp({
    create: { width: 1024, height: 1024, channels: 3, background: { r: 150, g: 120, b: 86 } },
  }).png().toBuffer()
}

const slides: SlideCopy[] = [
  { slide_number: 1, slide_type: 'cover', label: 'lo que nadie está conectando', title: 'El Mundial 2026 va a mover los precios de las casas en Virginia', subtitle: 'y casi nadie lo está viendo venir', lines: null, icon: null, image_prompt: 'editorial stadium at golden hour' },
  { slide_number: 2, slide_type: 'data', label: 'el dato incómodo', title: '3 meses', subtitle: 'es lo que tarda hoy una casa bien preparada en venderse en Hampton Roads', lines: null, icon: 'clock', image_prompt: null },
  { slide_number: 5, slide_type: 'text', label: 'tres claves', title: null, subtitle: null, lines: ['Prepara tu crédito antes de mirar casas', 'Conoce tu presupuesto real, no el soñado', 'Actúa antes de que suba la demanda'], icon: null, image_prompt: null },
  { slide_number: 8, slide_type: 'cta', label: null, title: 'Guárdalo y compártelo con tu familia', subtitle: 'Comenta CASA y te envío la guía · sígueme para más · guarda este post', lines: null, icon: null, image_prompt: null },
]

describe('carousel compositor', () => {
  it('compone slides 1080x1350 sin lanzar (con y sin foto)', async () => {
    for (const s of slides) {
      const bg = s.image_prompt ? await fakeBg() : null
      const png = await composeSlide(s, brand, bg)
      const meta = await sharp(png).metadata()
      expect(meta.width).toBe(1080)
      expect(meta.height).toBe(1350)
      expect(meta.format).toBe('png')
      if (OUT) writeFileSync(`${OUT}/slide-${s.slide_number}-${s.slide_type}.png`, png)
    }
  })
})
