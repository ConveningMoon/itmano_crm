import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { renderToPng } from '@/lib/studio/render/satori'
import { Band, Headline, StatRow, Badge } from '@/lib/studio/templates/primitives'

describe('primitivas', () => {
  it('cada primitiva renderiza sin lanzar', async () => {
    const el = (
      <div style={{ display: 'flex', flexDirection: 'column', width: 1080, height: 1350, backgroundColor: '#FBF6EE', position: 'relative' }}>
        <div style={{ display: 'flex', flexDirection: 'column', padding: 60 }}>
          <Badge text="NUEVA DISPONIBLE" color="#C9A96E" />
          <Headline text="Casa elegante y familiar en venta" color="#1B2A41" size={64} />
        </div>
        <Band color="#1B2A41" height={120}>
          <StatRow stats={[{ icon: 'ruler', value: '1,548 sqft' }, { icon: 'bed', value: '3 hab' }]} color="#FFFFFF" />
        </Band>
      </div>
    )
    const meta = await sharp(await renderToPng(el, { width: 1080, height: 1350 })).metadata()
    expect(meta.width).toBe(1080)
    expect(meta.height).toBe(1350)
  })

  it('un titular de una sola palabra no rompe el énfasis alterno', async () => {
    const el = (
      <div style={{ display: 'flex', width: 1080, height: 1350, backgroundColor: '#FFFFFF' }}>
        <Headline text="Vendida" color="#1B2A41" size={64} />
      </div>
    )
    expect((await sharp(await renderToPng(el, { width: 1080, height: 1350 })).metadata()).width).toBe(1080)
  })

  it('una lista de specs vacía y una etiqueta vacía no rompen el render', async () => {
    const el = (
      <div style={{ display: 'flex', flexDirection: 'column', width: 1080, height: 1350, backgroundColor: '#FFFFFF' }}>
        <Badge text="" color="#000000" />
        <StatRow stats={[]} color="#000000" />
      </div>
    )
    expect((await sharp(await renderToPng(el, { width: 1080, height: 1350 })).metadata()).height).toBe(1350)
  })
})
