import { Headline, AgentBadge, textColors } from './primitives'
import { rgba } from '../palettes'
import type { StudioTemplate, TemplateProps } from './types'

// Foto completa · vendida — la casa que se cerró, a sangre, con el anuncio
// sobre el degradado.
//
// Sin cifra, sin nota y sin specs: un cierre publica el hecho y quién lo hizo.
// El encabezado se agranda hasta ser el titular real de la pieza y el agente
// cierra abajo con su teléfono en un cuerpo que se lee desde el feed.

const AGENT_SIZE = 209

function Render(p: TemplateProps) {
  const { onPhoto } = textColors(p.palette)
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
        backgroundImage: `linear-gradient(to bottom, ${rgba(p.palette.brand, 0)} 24%, ${rgba(p.palette.brand, 0.55)} 48%, ${rgba(p.palette.brand, 0.88)} 68%, ${rgba(p.palette.brand, 0.97)} 100%)`,
      }} />

      {p.logo && (
        // eslint-disable-next-line @next/next/no-img-element -- reason: ídem
        <img src={p.logo} width={120} height={120} alt=""
             style={{ position: 'absolute', top: 50, right: 50, objectFit: 'contain' }} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', bottom: 100, left: 70, width: textWidth }}>
        {p.badge && (
          <span style={{ fontFamily: 'Marcellus', fontSize: 54, letterSpacing: 12, color: onPhoto }}>
            {p.badge}
          </span>
        )}
        <div style={{ display: 'flex', marginTop: 26 }}>
          <Headline text={p.headline} color={onPhoto} size={62} />
        </div>
        {p.address && (
          <span style={{ fontFamily: 'Spectral', fontSize: 30, color: onPhoto, marginTop: 20 }}>{p.address}</span>
        )}
        {p.agentName && (
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 40, color: onPhoto, marginTop: 34 }}>
            {p.agentName}
          </span>
        )}
        {p.phone && (
          <span style={{ fontFamily: 'Marcellus', fontSize: 30, letterSpacing: 3, color: onPhoto, marginTop: 6 }}>
            {p.phone}
          </span>
        )}
      </div>

      {p.agentPhoto && <AgentBadge src={p.agentPhoto} size={AGENT_SIZE} ring={p.palette.surface} right={70} bottom={120} />}
    </div>
  )
}

export const completaSold: StudioTemplate = {
  key: 'completa-sold',
  label: 'Foto completa',
  hint: 'Una foto excelente',
  recipes: ['sold'],
  aspects: ['4:5'],
  idealPhotos: 1,
  slots: {
    required: ['photo.hero', 'text.headline'],
    optional: ['photo.agent', 'text.address', 'text.phone', 'logo.tenant'],
  },
  render: Render,
}
