import { Band, Badge, Headline, PhotoCard, AgentBadge, textColors } from './primitives'
import { darken } from '../palettes'
import type { StudioTemplate, TemplateProps } from './types'

// Mosaico · vendida — misma estructura que la variante de venta, con las dos
// diferencias que tiene un cierre:
//
//   · La cifra es OPCIONAL. Muchos agentes no publican por cuánto cerraron, así
//     que sin ella la banda inferior la ocupa el agente, no un hueco.
//   · La nota ("Vendida en 9 días") ocupa el lugar de las specs, que en un
//     cierre ya no interesan: la casa no está a la venta.
//
// Cuando no hay nota, esa banda no se dibuja. Una franja de color vacía se lee
// como un error de maquetación, no como espacio.

function Render(p: TemplateProps) {
  const { onBrand, onDark } = textColors(p.palette)

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

      {p.cta && (
        <Band color={p.palette.brand} height={110} bottom={130}>
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 36, color: onBrand }}>{p.cta}</span>
        </Band>
      )}

      <Band color={darken(p.palette.brand)} height={130} bottom={0}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {p.price && (
            <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 56, color: onDark }}>{p.price}</span>
          )}
          {p.agentName && (
            <span style={{
              fontFamily: 'Marcellus', letterSpacing: 2, color: onDark,
              // Sin cifra el nombre es lo único que lleva esta banda: si se
              // quedara en el cuerpo de un subtítulo, la banda parecería vacía.
              fontSize: p.price ? 22 : 30,
            }}>
              {[p.agentName, p.phone].filter(Boolean).join('  ·  ')}
            </span>
          )}
        </div>
      </Band>

      {p.agentPhoto && <AgentBadge src={p.agentPhoto} size={250} ring={p.palette.brand} right={50} bottom={150} />}
    </div>
  )
}

export const mosaicoSold: StudioTemplate = {
  key: 'mosaico-sold',
  label: 'Mosaico',
  hint: 'Cuatro fotos o más',
  recipes: ['sold'],
  aspects: ['4:5'],
  idealPhotos: 4,
  slots: {
    required: ['photo.hero', 'text.headline'],
    optional: ['photo.thumbs', 'photo.agent', 'text.price', 'text.address', 'text.cta', 'text.phone', 'logo.tenant'],
  },
  render: Render,
}
