import { Band, Badge, Headline, StatRow, PhotoCard } from './primitives'
import type { StudioTemplate, TemplateProps } from './types'

// Editorial — manda la tipografía sobre un bloque de color, y la foto es
// secundaria. No es la variante de relleno: resuelve el caso del agente que
// todavía no tiene sesión fotográfica, que es cuando más falta le hace el
// diseño. Por eso NO requiere photo.hero.

function Render(p: TemplateProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 1080, height: 1350, backgroundColor: p.palette.surface, position: 'relative' }}>
      {/* Bloque de color superior con todo el peso tipográfico */}
      <div style={{
        display: 'flex', flexDirection: 'column', width: 1080, height: 520,
        backgroundColor: p.palette.primary, paddingLeft: 70, paddingRight: 70, paddingTop: 70,
      }}>
        <Badge text={p.badge} color="#E8E3DA" />
        <div style={{ display: 'flex', marginTop: 18 }}>
          <Headline text={p.headline} color="#FFFFFF" size={70} />
        </div>
        {p.price && (
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 82, color: '#FFFFFF', marginTop: 24 }}>
            {p.price}
          </span>
        )}
      </div>

      {p.heroPhoto && (
        <div style={{ display: 'flex', position: 'absolute', top: 560, left: 60 }}>
          <PhotoCard src={p.heroPhoto} width={960} height={420} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', top: 1020, left: 70, width: 900 }}>
        {p.address && (
          <span style={{ fontFamily: 'Spectral', fontSize: 30, color: '#1B2A41' }}>{p.address}</span>
        )}
        <div style={{ display: 'flex', marginTop: 18 }}>
          <StatRow stats={p.stats} color="#33415A" />
        </div>
      </div>

      <Band color={p.palette.primary} height={110} bottom={0}>
        <span style={{ fontFamily: 'Marcellus', fontSize: 26, letterSpacing: 3, color: '#FFFFFF' }}>
          {[p.agentName, p.phone].filter(Boolean).join('  ·  ')}
        </span>
      </Band>

      {p.logo && (
        // eslint-disable-next-line @next/next/no-img-element -- reason: satori rasteriza a SVG
        <img src={p.logo} width={90} height={90} alt=""
             style={{ position: 'absolute', bottom: 10, right: 40, objectFit: 'contain' }} />
      )}
    </div>
  )
}

export const editorialListing: StudioTemplate = {
  key: 'editorial-listing',
  label: 'Editorial',
  hint: 'Pocas fotos, manda el texto',
  recipes: ['new_listing'],
  aspects: ['4:5'],
  idealPhotos: 1,
  slots: {
    required: ['text.headline', 'text.price'],
    optional: ['photo.hero', 'stats', 'text.address', 'text.phone', 'logo.tenant'],
  },
  render: Render,
}
