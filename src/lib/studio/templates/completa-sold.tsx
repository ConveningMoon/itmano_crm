import { Badge, Headline, AgentBadge, textColors } from './primitives'
import { rgba } from '../palettes'
import type { StudioTemplate, TemplateProps } from './types'

// Foto completa · vendida — la foto de la casa que se cerró, a sangre, con el
// texto sobre el degradado del color primario.
//
// La cifra es opcional y la nota ("Vendida en 9 días") ocupa el lugar de las
// specs. Cuando no hay cifra, la nota sube al cuerpo que llevaría el precio:
// un cierre sin número sigue teniendo algo que presumir.

const AGENT_SIZE = 209

function Render(p: TemplateProps) {
  const { onPhoto } = textColors(p.palette)

  // Qué dato manda debajo del titular. Con cifra, la cifra; sin ella, la nota.
  const heroLine = p.price ?? p.cta
  const notaAparte = p.price ? p.cta : null
  // Con portada del agente el bloque se estrecha: el círculo ocupa la derecha.
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
          <Headline text={p.headline} color={onPhoto} size={66} />
        </div>
        {heroLine && (
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: p.price ? 76 : 48, color: onPhoto, marginTop: 20 }}>
            {heroLine}
          </span>
        )}
        {notaAparte && (
          <span style={{ fontFamily: 'Spectral', fontSize: 32, color: onPhoto, marginTop: 14 }}>{notaAparte}</span>
        )}
        {p.address && (
          <span style={{ fontFamily: 'Spectral', fontSize: 28, color: onPhoto, marginTop: 12 }}>{p.address}</span>
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

export const completaSold: StudioTemplate = {
  key: 'completa-sold',
  label: 'Foto completa',
  hint: 'Una foto excelente',
  recipes: ['sold'],
  aspects: ['4:5'],
  idealPhotos: 1,
  slots: {
    required: ['photo.hero', 'text.headline'],
    optional: ['photo.agent', 'text.price', 'text.address', 'text.cta', 'text.phone', 'logo.tenant'],
  },
  render: Render,
}
