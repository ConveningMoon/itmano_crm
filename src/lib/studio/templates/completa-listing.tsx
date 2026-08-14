import { Badge, Headline, StatRow, AgentCutout } from './primitives'
import type { StudioTemplate, TemplateProps } from './types'

// Foto completa — la foto ocupa el lienzo entero y el texto vive sobre un
// degradado en la mitad inferior. Para el agente que tiene UNA foto excelente:
// no hay mosaico que llenar ni espacio que justificar.

function Render(p: TemplateProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 1080, height: 1350, backgroundColor: p.palette.brand, position: 'relative' }}>
      {p.heroPhoto && (
        // eslint-disable-next-line @next/next/no-img-element -- reason: satori rasteriza a SVG
        <img src={p.heroPhoto} width={1080} height={1350} alt=""
             style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover' }} />
      )}

      {/* Degradado: lo que hace legible el texto sobre una foto que nadie
          controló. Los tramos están calculados contra dónde EMPIEZA el bloque de
          texto (~56% del alto), no repartidos a ojo: con una rampa suave desde el
          42% el titular caía sobre la parte clara de la fachada y se perdía. */}
      <div style={{
        display: 'flex', position: 'absolute', top: 0, left: 0, width: 1080, height: 1350,
        backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0) 28%, rgba(0,0,0,0.45) 52%, rgba(0,0,0,0.78) 70%, rgba(0,0,0,0.94) 100%)',
      }} />

      {p.logo && (
        // eslint-disable-next-line @next/next/no-img-element -- reason: ídem
        <img src={p.logo} width={120} height={120} alt=""
             style={{ position: 'absolute', top: 40, right: 40, objectFit: 'contain' }} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', bottom: 90, left: 70, width: 800 }}>
        <Badge text={p.badge} color="#E8E3DA" />
        <div style={{ display: 'flex', marginTop: 16 }}>
          <Headline text={p.headline} color="#FFFFFF" size={66} />
        </div>
        {p.price && (
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 76, color: '#FFFFFF', marginTop: 20 }}>
            {p.price}
          </span>
        )}
        {p.address && (
          <span style={{ fontFamily: 'Spectral', fontSize: 28, color: '#E8E3DA', marginTop: 12 }}>{p.address}</span>
        )}
        <div style={{ display: 'flex', marginTop: 22 }}>
          <StatRow stats={p.stats} color="#E8E3DA" />
        </div>
        {p.agentName && (
          <span style={{ fontFamily: 'Marcellus', fontSize: 24, letterSpacing: 3, color: '#E8E3DA', marginTop: 24 }}>
            {[p.agentName, p.phone].filter(Boolean).join('  ·  ')}
          </span>
        )}
      </div>

      {p.agentPhoto && <AgentCutout src={p.agentPhoto} width={260} height={440} />}
    </div>
  )
}

export const completaListing: StudioTemplate = {
  key: 'completa-listing',
  label: 'Foto completa',
  hint: 'Una foto excelente',
  recipes: ['new_listing'],
  aspects: ['4:5'],
  idealPhotos: 1,
  slots: {
    required: ['photo.hero', 'text.headline', 'text.price'],
    optional: ['photo.agent', 'stats', 'text.address', 'text.phone', 'logo.tenant'],
  },
  render: Render,
}
