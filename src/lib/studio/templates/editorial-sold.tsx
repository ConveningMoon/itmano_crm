import { Band, Badge, Headline, AgentBadge, textColors } from './primitives'
import type { StudioTemplate, TemplateProps } from './types'

// Editorial · vendida — la variante donde manda la tipografía. Es la que mejor
// resuelve un cierre sin foto nueva: cuando la casa ya se entregó, muchas veces
// lo único que queda es el material del listado.
//
// Mismas cuatro franjas que las otras dos editoriales. La cifra es opcional:
// sin ella el bloque de color lo cierra la nota, y si tampoco hay nota, el
// titular se queda solo — que es una portada legítima, no un hueco.

const HEADER_H = 430
const PHOTO_Y  = 430
const PHOTO_H  = 560
const INFO_Y   = 990
const BAND_H   = 120

const LOGO_SIZE  = 120
const AGENT_SIZE = 230

function Render(p: TemplateProps) {
  const { onBrand } = textColors(p.palette)

  // Con cifra manda la cifra y la nota baja a la franja clara; sin cifra, la
  // nota sube a cerrar el bloque de color.
  const heroLine = p.price ?? p.cta
  const notaAparte = p.price ? p.cta : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 1080, height: 1350, backgroundColor: p.palette.surface, position: 'relative' }}>
      <div style={{
        display: 'flex', flexDirection: 'column', width: 1080, height: HEADER_H,
        backgroundColor: p.palette.brand, paddingLeft: 70, paddingRight: 70, paddingTop: 62,
      }}>
        <Badge text={p.badge} color={onBrand} />
        <div style={{ display: 'flex', marginTop: 16 }}>
          <Headline text={p.headline} color={onBrand} size={62} />
        </div>
        {heroLine && (
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: p.price ? 78 : 46, color: onBrand, marginTop: 20 }}>
            {heroLine}
          </span>
        )}
      </div>

      {p.heroPhoto && (
        // eslint-disable-next-line @next/next/no-img-element -- reason: satori rasteriza a SVG
        <img src={p.heroPhoto} width={1080} height={PHOTO_H} alt=""
             style={{ position: 'absolute', top: PHOTO_Y, left: 0, objectFit: 'cover' }} />
      )}

      <div style={{
        display: 'flex', position: 'absolute', top: INFO_Y, left: 0,
        width: 1080, height: 1350 - INFO_Y - BAND_H,
        paddingLeft: 70, paddingRight: 70, paddingTop: 46,
        alignItems: 'flex-start', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: 760 }}>
          {p.address && (
            <span style={{ fontFamily: 'Spectral', fontSize: 30, color: p.palette.ink }}>{p.address}</span>
          )}
          {notaAparte && (
            <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 34, color: p.palette.ink, marginTop: 16 }}>
              {notaAparte}
            </span>
          )}
        </div>

        {p.logo && (
          // eslint-disable-next-line @next/next/no-img-element -- reason: ídem
          <img src={p.logo} width={LOGO_SIZE} height={LOGO_SIZE} alt="" style={{ objectFit: 'contain' }} />
        )}
      </div>

      <Band color={p.palette.brand} height={BAND_H} bottom={0}>
        <span style={{ fontFamily: 'Marcellus', fontSize: 26, letterSpacing: 3, color: onBrand }}>
          {[p.agentName, p.phone].filter(Boolean).join('  ·  ')}
        </span>
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
    optional: ['photo.hero', 'photo.agent', 'text.price', 'text.address', 'text.cta', 'text.phone', 'logo.tenant'],
  },
  render: Render,
}
