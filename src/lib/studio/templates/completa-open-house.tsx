import { Badge, Headline, AgentBadge, Icon, ICONS, textColors, splitWhen } from './primitives'
import { rgba } from '../palettes'
import type { StudioTemplate, TemplateProps } from './types'

// Foto completa · casa abierta — la foto ocupa el lienzo y el texto vive sobre
// el degradado del color primario, igual que la variante de venta.
//
// Donde esa pone el precio, esta pone la fecha y el horario. Va a menor cuerpo
// que una cifra —"15 de agosto de 2026 · 11:00–14:00" son treinta y cinco
// caracteres frente a ocho— pero con el mismo peso: es el dato por el que
// alguien decide presentarse.

const AGENT_SIZE = 209

function Render(p: TemplateProps) {
  const { onPhoto } = textColors(p.palette)
  const { day, time } = splitWhen(p.when)
  // El bloque se estrecha cuando hay portada del agente: sin esto, la línea de
  // la hora acababa por debajo del círculo, cortada.
  const textWidth = p.agentPhoto ? 700 : 860

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', width: 1080, height: 1350,
      backgroundColor: p.palette.surface, position: 'relative',
    }}>
      {p.heroPhoto && (
        // eslint-disable-next-line @next/next/no-img-element -- reason: satori rasteriza a SVG
        <img src={p.heroPhoto} width={1080} height={1350} alt=""
             style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover' }} />
      )}

      <div style={{
        display: 'flex', position: 'absolute', top: 0, left: 0, width: 1080, height: 1350,
        backgroundImage: `linear-gradient(to bottom, ${rgba(p.palette.brand, 0)} 28%, ${rgba(p.palette.brand, 0.55)} 52%, ${rgba(p.palette.brand, 0.85)} 70%, ${rgba(p.palette.brand, 0.97)} 100%)`,
      }} />

      {p.logo && (
        // eslint-disable-next-line @next/next/no-img-element -- reason: ídem
        <img src={p.logo} width={120} height={120} alt=""
             style={{ position: 'absolute', top: 50, right: 50, objectFit: 'contain' }} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', bottom: 100, left: 70, width: textWidth }}>
        <Badge text={p.badge} color={onPhoto} />
        <div style={{ display: 'flex', marginTop: 16 }}>
          <Headline text={p.headline} color={onPhoto} size={64} />
        </div>
        {day && (
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 46, color: onPhoto, marginTop: 22 }}>
            {day}
          </span>
        )}
        {time && (
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 40, color: onPhoto, marginTop: 4 }}>
            {time}
          </span>
        )}
        {p.address && (
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 18 }}>
            <Icon path={ICONS.pin} color={onPhoto} size={30} />
            <span style={{ fontFamily: 'Spectral', fontSize: 28, color: onPhoto, marginLeft: 12 }}>{p.address}</span>
          </div>
        )}
        {p.agentName && (
          <span style={{ fontFamily: 'Marcellus', fontSize: 24, letterSpacing: 3, color: onPhoto, marginTop: 24 }}>
            {[p.agentName, p.phone].filter(Boolean).join('  ·  ')}
          </span>
        )}
      </div>

      {p.agentPhoto && <AgentBadge src={p.agentPhoto} size={AGENT_SIZE} ring={p.palette.surface} right={70} bottom={120} />}
    </div>
  )
}

export const completaOpenHouse: StudioTemplate = {
  key: 'completa-open-house',
  label: 'Foto completa',
  hint: 'Una foto excelente',
  recipes: ['open_house'],
  aspects: ['4:5'],
  idealPhotos: 1,
  slots: {
    required: ['photo.hero', 'text.headline', 'text.when'],
    optional: ['photo.agent', 'text.address', 'text.phone', 'logo.tenant'],
  },
  render: Render,
}
