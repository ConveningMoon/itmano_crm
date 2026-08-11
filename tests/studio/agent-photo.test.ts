import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { detectCutout, circleCrop } from '@/lib/studio/agent-photo'

async function opaquePng(): Promise<Buffer> {
  return sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .png().toBuffer()
}

async function transparentPng(): Promise<Buffer> {
  return sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0 } } })
    .png().toBuffer()
}

describe('portada del agente', () => {
  it('detecta transparencia real, no la mera presencia de canal alfa', async () => {
    expect(await detectCutout(await transparentPng())).toBe(true)
    expect(await detectCutout(await opaquePng())).toBe(false)
    // Un PNG con canal alfa pero totalmente opaco NO es un recorte: es el caso
    // que haría fallar una comprobación ingenua de `hasAlpha`.
    const alphaButOpaque = await sharp({
      create: { width: 100, height: 100, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } },
    }).png().toBuffer()
    expect(await detectCutout(alphaButOpaque)).toBe(false)
  })

  it('una imagen corrupta no lanza: degrada a "no es recorte"', async () => {
    expect(await detectCutout(Buffer.from('esto no es una imagen'))).toBe(false)
  })

  it('el círculo sale cuadrado, del tamaño pedido y con las esquinas transparentes', async () => {
    const out = await circleCrop(await opaquePng(), 240)
    const meta = await sharp(out).metadata()
    expect(meta.width).toBe(240)
    expect(meta.height).toBe(240)
    expect(meta.hasAlpha).toBe(true)
    // La esquina superior izquierda queda fuera del círculo → transparente.
    const corner = await sharp(out).ensureAlpha().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer()
    expect(corner[3]).toBe(0)
    // El centro sí está pintado.
    const center = await sharp(out).ensureAlpha().extract({ left: 120, top: 120, width: 1, height: 1 }).raw().toBuffer()
    expect(center[3]).toBe(255)
  })
})
