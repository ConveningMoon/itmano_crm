import { Band, Badge, Headline, StatRow, PhotoCard, AgentCutout } from './primitives'
import { darken } from '../palettes'
import type { StudioTemplate, TemplateProps } from './types'

// Mosaico — el diseño de la referencia. Hero grande, tres miniaturas
// superpuestas, bloque de titular, y dos bandas apiladas abajo con las specs y
// la cifra. Luce cuando el agente tiene sesión fotográfica completa.

function Render(p: TemplateProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 1080, height: 1350, backgroundColor: p.palette.surface, position: 'relative' }}>
      {p.heroPhoto && (
        // eslint-disable-next-line @next/next/no-img-element -- reason: satori rasteriza a SVG
        <img src={p.heroPhoto} width={1080} height={700} alt="" style={{ objectFit: 'cover' }} />
      )}

      {p.logo && (
        // eslint-disable-next-line @next/next/no-img-element -- reason: ídem
        <img src={p.logo} width={150} height={150} alt=""
             style={{ position: 'absolute', top: 30, left: 40, objectFit: 'contain' }} />
      )}

      {p.thumbPhotos.length > 0 && (
        <div style={{ display: 'flex', position: 'absolute', top: 560, left: 60 }}>
          {p.thumbPhotos.slice(0, 3).map((src, i) => (
            <div key={i} style={{ display: 'flex', marginRight: 20 }}>
              <PhotoCard src={src} width={300} height={220} />
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', top: 830, left: 60, width: 700 }}>
        <Badge text={p.badge} color={p.palette.brand} />
        <div style={{ display: 'flex', marginTop: 14 }}>
          <Headline text={p.headline} color={p.palette.ink} size={58} />
        </div>
        {p.address && (
          <span style={{ fontFamily: 'Spectral', fontSize: 26, color: p.palette.ink, opacity: 0.75, marginTop: 16 }}>{p.address}</span>
        )}
      </div>

      <Band color={p.palette.brand} height={110} bottom={130}>
        <StatRow stats={p.stats} color="#FFFFFF" />
      </Band>

      <Band color={darken(p.palette.brand)} height={130} bottom={0}>
        <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 62, color: '#FFFFFF' }}>
          {p.price ?? p.agentName ?? ''}
        </span>
      </Band>

      {p.agentPhoto && <AgentCutout src={p.agentPhoto} width={300} height={520} />}
    </div>
  )
}

export const mosaicoListing: StudioTemplate = {
  key: 'mosaico-listing',
  label: 'Mosaico',
  hint: 'Cuatro fotos o más',
  recipes: ['new_listing'],
  aspects: ['4:5'],
  idealPhotos: 4,
  slots: {
    required: ['photo.hero', 'text.headline', 'text.price'],
    optional: ['photo.thumbs', 'photo.agent', 'stats', 'text.address', 'logo.tenant'],
  },
  render: Render,
}
