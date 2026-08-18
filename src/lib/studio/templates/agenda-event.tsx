import { Band, Headline, Icon, ICONS, textColors, splitWhen } from './primitives'
import type { StudioTemplate, TemplateProps } from './types'

// Agenda · evento — el único diseño de los doce que NO tiene hueco de foto, y
// existe justo por eso.
//
// Un evento no sale del módulo de propiedades: no hay galería que usar, así que
// las otras dos variantes dependen de que el agente describa una escena para
// que la IA la genere. Esta no depende de nada. Es la que un agente puede
// publicar en treinta segundos y sin gastar presupuesto.
//
// La fecha va en un bloque de color propio, como el cuadro de un calendario:
// es lo que alguien busca cuando decide si puede ir.

// La banda del agente es la más alta de los doce diseños a propósito: sin foto
// que llene el lienzo, es lo que evita que la mitad inferior quede vacía — y en
// un evento el contacto ES la llamada a la acción.
const BAND_H = 250

function Render(p: TemplateProps) {
  const { onBrand } = textColors(p.palette)
  const { day, time } = splitWhen(p.when)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 1080, height: 1350, backgroundColor: p.palette.surface, position: 'relative' }}>
      {p.logo && (
        // eslint-disable-next-line @next/next/no-img-element -- reason: satori rasteriza a SVG
        <img src={p.logo} width={130} height={130} alt=""
             style={{ position: 'absolute', top: 60, right: 70, objectFit: 'contain' }} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', top: 90, left: 70, width: 780 }}>
        {p.badge && (
          <span style={{ fontFamily: 'Marcellus', fontSize: 34, letterSpacing: 10, color: p.palette.brand }}>
            {p.badge}
          </span>
        )}
        <div style={{ display: 'flex', marginTop: 26 }}>
          <Headline text={p.headline} color={p.palette.ink} size={68} />
        </div>
      </div>

      {/* El cuadro de la fecha. Ocupa el centro porque es la pregunta que
          responde un cartel de evento: cuándo. */}
      <div style={{
        display: 'flex', flexDirection: 'column', position: 'absolute', top: 450, left: 70,
        width: 940, backgroundColor: p.palette.brand,
        paddingTop: 46, paddingBottom: 46, paddingLeft: 50, paddingRight: 50,
      }}>
        {day && (
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 62, color: onBrand }}>{day}</span>
        )}
        {time && (
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 52, color: onBrand, marginTop: 6 }}>{time}</span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', top: 800, left: 70, width: 940 }}>
        {p.address && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Icon path={ICONS.pin} color={p.palette.ink} size={42} />
            <span style={{ fontFamily: 'Spectral', fontSize: 40, color: p.palette.ink, marginLeft: 16 }}>{p.address}</span>
          </div>
        )}
        {p.price && (
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 52, color: p.palette.ink, marginTop: 30 }}>
            {p.price}
          </span>
        )}
        {p.cta && (
          <span style={{ fontFamily: 'Spectral', fontSize: 32, color: p.palette.ink, opacity: 0.8, marginTop: 26 }}>
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
  hint: 'Sin foto: manda la fecha',
  recipes: ['event'],
  aspects: ['4:5'],
  // Cero: este diseño no tiene hueco de foto, así que el aviso de encaje no
  // debe pedir ninguna.
  idealPhotos: 0,
  slots: {
    required: ['text.headline', 'text.when'],
    optional: ['text.address', 'text.price', 'text.cta', 'text.phone', 'logo.tenant'],
  },
  render: Render,
}
