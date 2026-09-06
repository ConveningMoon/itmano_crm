import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { finishFreeImage } from '@/lib/studio/finish-free-image'

async function lienzo(w: number, h: number): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: '#123456' } }).png().toBuffer()
}

describe('finishFreeImage', () => {
  it('encaja la imagen al lienzo pedido', async () => {
    const png = await finishFreeImage({ background: await lienzo(800, 800), accent: '#1B2A41', width: 1080, height: 1350 })
    const meta = await sharp(png).metadata()
    expect(meta.width).toBe(1080)
    expect(meta.height).toBe(1350)
  })

  it('sin fondo devuelve el degradado del color de marca', async () => {
    const png = await finishFreeImage({ background: null, accent: '#1B2A41', width: 1080, height: 1350 })
    const meta = await sharp(png).metadata()
    expect(meta.width).toBe(1080)
    expect(meta.format).toBe('png')
  })
})
