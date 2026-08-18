import { Headline, AgentBadge, Icon, ICONS, textColors, splitWhen } from './primitives'
import { rgba } from '../palettes'
import type { StudioTemplate, TemplateProps } from './types'

// Foto completa · evento — la escena del evento a sangre con el texto sobre el
// degradado.
//
// Un evento no tiene galería en el CRM, así que la foto sale de la escena que
// el agente describa (y entonces la pieza sí consume IA). Sin descripción el
// lienzo queda del color primario, que es un cartel legítimo: por eso el fondo
// base cambia según haya foto o no, en vez de dejar un degradado flotando sobre
// el color de fondo claro.

const AGENT_SIZE = 209

function Render(p: TemplateProps) {
  const { onPhoto } = textColors(p.palette)
  const { day, time } = splitWhen(p.when)
  const textWidth = p.agentPhoto ? 700 : 860

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', width: 1080, height: 1350,
      backgroundColor: p.heroPhoto ? p.palette.surface : p.palette.brand, position: 'relative',
    }}>
      {p.heroPhoto && (
        // eslint-disable-next-line @next/next/no-img-element -- reason: satori rasteriza a SVG
        <img src={p.heroPhoto} width={1080} height={1350} alt=""
             style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover' }} />
      )}

      <div style={{
        display: 'flex', position: 'absolute', top: 0, left: 0, width: 1080, height: 1350,
        backgroundImage: `linear-gradient(to bottom, ${rgba(p.palette.brand, 0)} 24%, ${rgba(p.palette.brand, 0.55)} 48%, ${rgba(p.palette.brand, 0.88)} 68%, ${rgba(p.palette.brand, 0.97)} 100%)`,
      }} />

      {p.logo && (
        // eslint-disable-next-line @next/next/no-img-element -- reason: ídem
        <img src={p.logo} width={120} height={120} alt=""
             style={{ position: 'absolute', top: 50, right: 50, objectFit: 'contain' }} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', bottom: 100, left: 70, width: textWidth }}>
        {p.badge && (
          <span style={{ fontFamily: 'Marcellus', fontSize: 32, letterSpacing: 10, color: onPhoto }}>{p.badge}</span>
        )}
        <div style={{ display: 'flex', marginTop: 20 }}>
          <Headline text={p.headline} color={onPhoto} size={64} />
        </div>
        {day && (
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 46, color: onPhoto, marginTop: 24 }}>{day}</span>
        )}
        {time && (
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 40, color: onPhoto, marginTop: 4 }}>{time}</span>
        )}
        {p.address && (
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 18 }}>
            <Icon path={ICONS.pin} color={onPhoto} size={30} />
            <span style={{ fontFamily: 'Spectral', fontSize: 28, color: onPhoto, marginLeft: 12 }}>{p.address}</span>
          </div>
        )}
        {p.cta && (
          <span style={{ fontFamily: 'Spectral', fontSize: 26, color: onPhoto, marginTop: 14 }}>{p.cta}</span>
        )}
        {p.agentName && (
          <span style={{ fontFamily: 'Marcellus', fontSize: 26, letterSpacing: 3, color: onPhoto, marginTop: 24 }}>
            {[p.agentName, p.phone].filter(Boolean).join('  ·  ')}
          </span>
        )}
      </div>

      {p.agentPhoto && <AgentBadge src={p.agentPhoto} size={AGENT_SIZE} ring={p.palette.surface} right={70} bottom={120} />}
    </div>
  )
}

export const completaEvent: StudioTemplate = {
  key: 'completa-event',
  label: 'Foto completa',
  hint: 'Con escena generada',
  recipes: ['event'],
  aspects: ['4:5'],
  idealPhotos: 1,
  slots: {
    required: ['text.headline', 'text.when'],
    optional: ['photo.hero', 'photo.agent', 'text.address', 'text.price', 'text.cta', 'text.phone', 'logo.tenant'],
  },
  render: Render,
}
