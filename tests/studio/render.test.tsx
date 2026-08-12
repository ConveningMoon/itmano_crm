import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'
import { renderToPng } from '@/lib/studio/render/satori'

const OUT = process.env.STUDIO_OUT_DIR

// Foto de relleno como data URI, que es como los templates reciben las imágenes
// en producción: satori no debe hacer red dentro del render.
async function fakePhoto(color: { r: number; g: number; b: number }): Promise<string> {
  const png = await sharp({ create: { width: 400, height: 300, channels: 3, background: color } })
    .png().toBuffer()
  return `data:image/png;base64,${png.toString('base64')}`
}

describe('spike de satori', () => {
  it('renderiza los elementos difíciles del diseño de referencia', async () => {
    const hero  = await fakePhoto({ r: 120, g: 150, b: 190 })
    const thumb = await fakePhoto({ r: 200, g: 200, b: 195 })

    const el = (
      <div style={{ display: 'flex', flexDirection: 'column', width: 1080, height: 1350, backgroundColor: '#FFFFFF', position: 'relative' }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- reason: satori no es DOM; rasteriza a SVG */}
        <img src={hero} width={1080} height={700} style={{ objectFit: 'cover' }} alt="" />

        {/* Tres tarjetas superpuestas al hero, con radio y sombra */}
        <div style={{ display: 'flex', position: 'absolute', top: 560, left: 60 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ display: 'flex', marginRight: 20 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- reason: ídem */}
              <img src={thumb} width={300} height={220} alt=""
                   style={{ objectFit: 'cover', borderRadius: 14, boxShadow: '0 6px 20px rgba(0,0,0,0.28)' }} />
            </div>
          ))}
        </div>

        {/* Bloque de titular con dos pesos de la misma familia */}
        <div style={{ display: 'flex', flexWrap: 'wrap', position: 'absolute', top: 830, left: 60, maxWidth: 900 }}>
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 62, color: '#1B2A41', marginRight: 14 }}>Casa</span>
          <span style={{ fontFamily: 'Spectral', fontWeight: 400, fontSize: 62, color: '#1B2A41', marginRight: 14 }}>elegante</span>
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 62, color: '#1B2A41' }}>y familiar</span>
        </div>

        {/* Dos bandas apiladas */}
        <div style={{ display: 'flex', position: 'absolute', bottom: 130, left: 0, width: 1080, height: 110, backgroundColor: '#1B2A41', alignItems: 'center', paddingLeft: 60 }}>
          <span style={{ fontFamily: 'Marcellus', fontSize: 28, color: '#FBF6EE' }}>1,548 sqft · 3 hab · 2 baños</span>
        </div>
        <div style={{ display: 'flex', position: 'absolute', bottom: 0, left: 0, width: 1080, height: 130, backgroundColor: '#0F1826', alignItems: 'center', paddingLeft: 60 }}>
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 62, color: '#FFFFFF' }}>$274,400</span>
        </div>

        {/* Elemento absoluto que cruza las dos bandas */}
        <div style={{ display: 'flex', position: 'absolute', bottom: 0, right: 40, width: 260, height: 420, borderRadius: 130, backgroundColor: '#C9A96E' }} />
      </div>
    )

    const png = await renderToPng(el, { width: 1080, height: 1350 })
    const meta = await sharp(png).metadata()
    expect(meta.width).toBe(1080)
    expect(meta.height).toBe(1350)
    expect(meta.format).toBe('png')
    if (OUT) writeFileSync(`${OUT}/spike.png`, png)
  })
})
