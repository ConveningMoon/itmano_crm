import { Band, Headline, Icon, ICONS, textColors, splitWhen } from './primitives'
import type { StudioTemplate, TemplateProps } from './types'

// Agenda · evento — la fecha en un bloque de color propio, como el cuadro de un
// calendario: es la pregunta que responde un cartel de evento.
//
// La foto va ARRIBA y a sangre, no de fondo: aquí la imagen presenta el evento
// y el bloque de la fecha es el que manda. Es la diferencia con las otras dos
// variantes, donde la foto ocupa el lienzo y el texto se le monta encima.

const PHOTO_H = 520
const BAND_H  = 170

function Render(p: TemplateProps) {
  const { onBrand } = textColors(p.palette)
  const { day, time } = splitWhen(p.when)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 1080, height: 1350, backgroundColor: p.palette.surface, position: 'relative' }}>
      {p.heroPhoto && (
        // eslint-disable-next-line @next/next/no-img-element -- reason: satori rasteriza a SVG
        <img src={p.heroPhoto} width={1080} height={PHOTO_H} alt="" style={{ objectFit: 'cover' }} />
      )}

      {p.logo && (
        // eslint-disable-next-line @next/next/no-img-element -- reason: ídem
        <img src={p.logo} width={120} height={120} alt=""
             style={{ position: 'absolute', top: PHOTO_H + 40, right: 70, objectFit: 'contain' }} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', top: PHOTO_H + 50, left: 70, width: 780 }}>
        {p.badge && (
          <span style={{ fontFamily: 'Marcellus', fontSize: 32, letterSpacing: 10, color: p.palette.brand }}>
            {p.badge}
          </span>
        )}
        <div style={{ display: 'flex', marginTop: 20 }}>
          <Headline text={p.headline} color={p.palette.ink} size={58} />
        </div>
      </div>

      <div style={{
        display: 'flex', flexDirection: 'column', position: 'absolute', top: 800, left: 70,
        width: 940, backgroundColor: p.palette.brand,
        paddingTop: 34, paddingBottom: 34, paddingLeft: 46, paddingRight: 46,
      }}>
        {day && (
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 56, color: onBrand }}>{day}</span>
        )}
        {time && (
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 46, color: onBrand, marginTop: 4 }}>{time}</span>
        )}
      </div>

      {/* Debajo del cuadro de la fecha, con aire: a 1010 el lugar quedaba
          tapado por el propio cuadro. */}
      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', top: 1050, left: 70, width: 940 }}>
        {p.address && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Icon path={ICONS.pin} color={p.palette.ink} size={38} />
            <span style={{ fontFamily: 'Spectral', fontSize: 36, color: p.palette.ink, marginLeft: 16 }}>{p.address}</span>
          </div>
        )}
        {p.cta && (
          <span style={{ fontFamily: 'Spectral', fontSize: 28, color: p.palette.ink, opacity: 0.8, marginTop: 14 }}>
            {p.cta}
          </span>
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

export const agendaEvent: StudioTemplate = {
  key: 'agenda-event',
  label: 'Agenda',
  hint: 'La fecha en primer plano',
  recipes: ['event'],
  aspects: ['4:5'],
  idealPhotos: 1,
  slots: {
    required: ['photo.hero', 'text.headline', 'text.when'],
    optional: ['text.address', 'text.cta', 'text.phone', 'logo.tenant'],
  },
  render: Render,
}
