import { Band, Headline, AgentBadge, textColors } from './primitives'
import type { StudioTemplate, TemplateProps } from './types'

// Editorial · vendida — la variante donde manda la tipografía, que es la que
// mejor resuelve un cierre: cuando la casa ya se entregó rara vez hay material
// nuevo que enseñar.
//
// El reparto cambia respecto a la variante de venta porque hay menos que
// contar. El bloque de color lo llena el anuncio —encabezado grande y titular—,
// la foto ocupa el centro y el pie de marca crece hasta ser una franja con el
// agente y su teléfono, no una línea al borde del lienzo.

const HEADER_H = 400
const PHOTO_Y  = 400
const PHOTO_H  = 590
const INFO_Y   = 990
const BAND_H   = 190

const LOGO_SIZE  = 120
const AGENT_SIZE = 230

function Render(p: TemplateProps) {
  const { onBrand } = textColors(p.palette)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 1080, height: 1350, backgroundColor: p.palette.surface, position: 'relative' }}>
      <div style={{
        display: 'flex', flexDirection: 'column', width: 1080, height: HEADER_H,
        backgroundColor: p.palette.brand, paddingLeft: 70, paddingRight: 70, paddingTop: 66,
      }}>
        {p.badge && (
          <span style={{ fontFamily: 'Marcellus', fontSize: 52, letterSpacing: 12, color: onBrand }}>
            {p.badge}
          </span>
        )}
        <div style={{ display: 'flex', marginTop: 26 }}>
          <Headline text={p.headline} color={onBrand} size={58} />
        </div>
      </div>

      {p.heroPhoto && (
        // eslint-disable-next-line @next/next/no-img-element -- reason: satori rasteriza a SVG
        <img src={p.heroPhoto} width={1080} height={PHOTO_H} alt=""
             style={{ position: 'absolute', top: PHOTO_Y, left: 0, objectFit: 'cover' }} />
      )}

      <div style={{
        display: 'flex', position: 'absolute', top: INFO_Y, left: 0,
        width: 1080, height: 1350 - INFO_Y - BAND_H,
        paddingLeft: 70, paddingRight: 70, paddingTop: 40,
        alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', width: 760 }}>
          {p.address && (
            <span style={{ fontFamily: 'Spectral', fontSize: 32, color: p.palette.ink }}>{p.address}</span>
          )}
        </div>

        {p.logo && (
          // eslint-disable-next-line @next/next/no-img-element -- reason: ídem
          <img src={p.logo} width={LOGO_SIZE} height={LOGO_SIZE} alt="" style={{ objectFit: 'contain' }} />
        )}
      </div>

      <Band color={p.palette.brand} height={BAND_H} bottom={0}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {p.agentName && (
            <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 44, color: onBrand }}>{p.agentName}</span>
          )}
          {p.phone && (
            <span style={{ fontFamily: 'Marcellus', fontSize: 32, letterSpacing: 3, color: onBrand, marginTop: 8 }}>{p.phone}</span>
          )}
        </div>
      </Band>

      {p.agentPhoto && (
        <AgentBadge src={p.agentPhoto} size={AGENT_SIZE} ring={p.palette.surface} right={70} bottom={1350 - (PHOTO_Y + AGENT_SIZE / 2)} />
      )}
    </div>
  )
}

export const editorialSold: StudioTemplate = {
  key: 'editorial-sold',
  label: 'Editorial',
  hint: 'Pocas fotos, manda el texto',
  recipes: ['sold'],
  aspects: ['4:5'],
  idealPhotos: 1,
  slots: {
    required: ['text.headline'],
    optional: ['photo.hero', 'photo.agent', 'text.address', 'text.phone', 'logo.tenant'],
  },
  render: Render,
}
