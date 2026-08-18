import { Band, Headline, Icon, ICONS, textColors, splitWhen } from './primitives'
import type { StudioTemplate, TemplateProps } from './types'

// Editorial · evento — el bloque de color con el anuncio, la foto en el centro
// y el pie de marca, como las otras editoriales.
//
// La diferencia está en que un evento puede no tener foto: sin propiedad de la
// que sacarla, solo la hay si el agente describió una escena. Cuando falta, el
// bloque de color se queda con esos píxeles en vez de dejar un hueco — que es
// exactamente el defecto que había que arreglar en las otras editoriales.

const BAND_H     = 170
const LOGO_SIZE  = 120

function Render(p: TemplateProps) {
  const { onBrand } = textColors(p.palette)
  const { day, time } = splitWhen(p.when)

  // Sin foto no hay franja intermedia: el bloque de color la absorbe.
  const headerH = p.heroPhoto ? 470 : 830
  const photoH  = p.heroPhoto ? 420 : 0
  const infoY   = headerH + photoH

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 1080, height: 1350, backgroundColor: p.palette.surface, position: 'relative' }}>
      <div style={{
        display: 'flex', flexDirection: 'column', width: 1080, height: headerH,
        backgroundColor: p.palette.brand, paddingLeft: 70, paddingRight: 70, paddingTop: 66,
      }}>
        {p.badge && (
          <span style={{ fontFamily: 'Marcellus', fontSize: 32, letterSpacing: 10, color: onBrand }}>{p.badge}</span>
        )}
        <div style={{ display: 'flex', marginTop: 22 }}>
          <Headline text={p.headline} color={onBrand} size={60} />
        </div>
        {day && (
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 50, color: onBrand, marginTop: 24 }}>{day}</span>
        )}
        {time && (
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 42, color: onBrand, marginTop: 4 }}>{time}</span>
        )}
      </div>

      {p.heroPhoto && (
        // eslint-disable-next-line @next/next/no-img-element -- reason: satori rasteriza a SVG
        <img src={p.heroPhoto} width={1080} height={photoH} alt=""
             style={{ position: 'absolute', top: headerH, left: 0, objectFit: 'cover' }} />
      )}

      <div style={{
        display: 'flex', position: 'absolute', top: infoY, left: 0,
        width: 1080, height: 1350 - infoY - BAND_H,
        paddingLeft: 70, paddingRight: 70,
        alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: 760 }}>
          {p.address && (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <Icon path={ICONS.pin} color={p.palette.ink} size={34} />
              <span style={{ fontFamily: 'Spectral', fontSize: 32, color: p.palette.ink, marginLeft: 14 }}>{p.address}</span>
            </div>
          )}
          {p.price && (
            <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 36, color: p.palette.ink, marginTop: 14 }}>{p.price}</span>
          )}
          {p.cta && (
            <span style={{ fontFamily: 'Spectral', fontSize: 26, color: p.palette.ink, opacity: 0.8, marginTop: 12 }}>{p.cta}</span>
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
            <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 40, color: onBrand }}>{p.agentName}</span>
          )}
          {p.phone && (
            <span style={{ fontFamily: 'Marcellus', fontSize: 30, letterSpacing: 3, color: onBrand, marginTop: 8 }}>{p.phone}</span>
          )}
        </div>
      </Band>
    </div>
  )
}

export const editorialEvent: StudioTemplate = {
  key: 'editorial-event',
  label: 'Editorial',
  hint: 'Manda el texto',
  recipes: ['event'],
  aspects: ['4:5'],
  idealPhotos: 0,
  slots: {
    required: ['text.headline', 'text.when'],
    optional: ['photo.hero', 'text.address', 'text.price', 'text.cta', 'text.phone', 'logo.tenant'],
  },
  render: Render,
}
