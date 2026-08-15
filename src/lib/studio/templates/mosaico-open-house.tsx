import { Band, Badge, Headline, PhotoCard, AgentBadge, Icon, ICONS, textColors, splitWhen } from './primitives'
import { darken } from '../palettes'
import type { StudioTemplate, TemplateProps } from './types'

// Mosaico · casa abierta — misma estructura que la variante de venta: hero,
// tres miniaturas y dos bandas apiladas. Cambia QUÉ dato manda.
//
// Una casa abierta no se publica por el precio sino por CUÁNDO se puede
// visitar, así que la fecha y el horario suben al bloque de titular, donde en
// la variante de venta va la dirección. La dirección baja a la primera banda,
// que en venta llevaba las specs — una casa abierta no las tiene.

function Render(p: TemplateProps) {
  const { onBrand, onDark } = textColors(p.palette)
  const { day, time } = splitWhen(p.when)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 1080, height: 1350, backgroundColor: p.palette.surface, position: 'relative' }}>
      {p.heroPhoto && (
        // eslint-disable-next-line @next/next/no-img-element -- reason: satori rasteriza a SVG
        <img src={p.heroPhoto} width={1080} height={700} alt="" style={{ objectFit: 'cover' }} />
      )}

      {p.logo && (
        // eslint-disable-next-line @next/next/no-img-element -- reason: ídem
        <img src={p.logo} width={150} height={150} alt=""
             style={{ position: 'absolute', top: 30, left: 40, objectFit: 'contain' }} />
      )}

      {p.thumbPhotos.length > 0 && (
        <div style={{ display: 'flex', position: 'absolute', top: 560, left: 60 }}>
          {p.thumbPhotos.slice(0, 3).map((src, i) => (
            <div key={i} style={{ display: 'flex', marginRight: 20 }}>
              <PhotoCard src={src} width={300} height={220} />
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', top: 820, left: 60, width: 700 }}>
        <Badge text={p.badge} color={p.palette.brand} />
        <div style={{ display: 'flex', marginTop: 14 }}>
          <Headline text={p.headline} color={p.palette.ink} size={56} />
        </div>
        {day && (
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 42, color: p.palette.ink, marginTop: 18 }}>
            {day}
          </span>
        )}
        {time && (
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 36, color: p.palette.ink, marginTop: 4 }}>
            {time}
          </span>
        )}
      </div>

      {/* Dirección con marcador: en una casa abierta el dónde es la instrucción,
          no un detalle del listado. */}
      <Band color={p.palette.brand} height={110} bottom={130}>
        {p.address && (
          <>
            <Icon path={ICONS.pin} color={onBrand} size={34} />
            <span style={{ fontFamily: 'Spectral', fontSize: 30, color: onBrand, marginLeft: 14 }}>{p.address}</span>
          </>
        )}
      </Band>

      <Band color={darken(p.palette.brand)} height={130} bottom={0}>
        <span style={{ fontFamily: 'Marcellus', fontSize: 26, letterSpacing: 2, color: onDark }}>
          {[p.agentName, p.phone].filter(Boolean).join('  ·  ')}
        </span>
      </Band>

      {p.agentPhoto && <AgentBadge src={p.agentPhoto} size={250} ring={p.palette.brand} right={50} bottom={150} />}
    </div>
  )
}

export const mosaicoOpenHouse: StudioTemplate = {
  key: 'mosaico-open-house',
  label: 'Mosaico',
  hint: 'Cuatro fotos o más',
  recipes: ['open_house'],
  aspects: ['4:5'],
  idealPhotos: 4,
  slots: {
    required: ['photo.hero', 'text.headline', 'text.when'],
    optional: ['photo.thumbs', 'photo.agent', 'text.address', 'text.phone', 'logo.tenant'],
  },
  render: Render,
}
