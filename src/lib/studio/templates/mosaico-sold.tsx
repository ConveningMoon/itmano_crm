import { Band, Headline, PhotoCard, AgentBadge, textColors } from './primitives'
import type { StudioTemplate, TemplateProps } from './types'

// Mosaico · vendida — el mismo esqueleto de la variante de venta con la mitad
// de los datos, porque un cierre publica la mitad.
//
// Se retiraron la cifra, la nota y las specs: eran cuatro huecos alrededor de
// un dato que casi ningún agente enseña, y el diseño se veía vacío. Lo que
// queda —encabezado, titular, dirección y el agente— sube de cuerpo hasta
// llenar la pieza. El encabezado deja de ser una etiqueta pequeña y pasa a ser
// el anuncio: "VENDIDA" es la noticia.

function Render(p: TemplateProps) {
  const { onBrand } = textColors(p.palette)

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

      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', top: 810, left: 60, width: 700 }}>
        {p.badge && (
          <span style={{ fontFamily: 'Marcellus', fontSize: 46, letterSpacing: 10, color: p.palette.brand }}>
            {p.badge}
          </span>
        )}
        <div style={{ display: 'flex', marginTop: 22 }}>
          <Headline text={p.headline} color={p.palette.ink} size={54} />
        </div>
        {p.address && (
          <span style={{ fontFamily: 'Spectral', fontSize: 28, color: p.palette.ink, opacity: 0.75, marginTop: 18 }}>{p.address}</span>
        )}
      </div>

      {/* El agente cierra la pieza en una sola banda alta: es lo que un cierre
          vende de verdad, y a 22px se leía como un pie de página. */}
      <Band color={p.palette.brand} height={190} bottom={0}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {p.agentName && (
            <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 44, color: onBrand }}>{p.agentName}</span>
          )}
          {p.phone && (
            <span style={{ fontFamily: 'Marcellus', fontSize: 32, letterSpacing: 3, color: onBrand, marginTop: 8 }}>{p.phone}</span>
          )}
        </div>
      </Band>

      {p.agentPhoto && <AgentBadge src={p.agentPhoto} size={250} ring={p.palette.brand} right={50} bottom={190} />}
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
    optional: ['photo.thumbs', 'photo.agent', 'text.address', 'text.phone', 'logo.tenant'],
  },
  render: Render,
}
