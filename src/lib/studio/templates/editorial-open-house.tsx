import { Band, Badge, Headline, AgentBadge, Icon, ICONS, textColors, splitWhen } from './primitives'
import type { StudioTemplate, TemplateProps } from './types'

// Editorial · casa abierta — la variante para el agente que todavía no tiene
// sesión fotográfica: manda la tipografía y la foto es secundaria. Por eso NO
// requiere photo.hero.
//
// Mismas cuatro franjas que la variante de venta (0 → 430 → 990 → 1230 → 1350).
// En el bloque de color, donde la de venta pone la cifra, esta pone la fecha y
// el horario; la franja clara lleva la dirección en vez de las specs, que una
// casa abierta no tiene.

const HEADER_H = 430
const PHOTO_Y  = 430
const PHOTO_H  = 560
const INFO_Y   = 990
const BAND_H   = 120

const LOGO_SIZE  = 120
const AGENT_SIZE = 230

function Render(p: TemplateProps) {
  const { onBrand } = textColors(p.palette)
  const { day, time } = splitWhen(p.when)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 1080, height: 1350, backgroundColor: p.palette.surface, position: 'relative' }}>
      <div style={{
        display: 'flex', flexDirection: 'column', width: 1080, height: HEADER_H,
        backgroundColor: p.palette.brand, paddingLeft: 70, paddingRight: 70, paddingTop: 62,
      }}>
        <Badge text={p.badge} color={onBrand} />
        <div style={{ display: 'flex', marginTop: 16 }}>
          <Headline text={p.headline} color={onBrand} size={58} />
        </div>
        {day && (
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 50, color: onBrand, marginTop: 20 }}>
            {day}
          </span>
        )}
        {time && (
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 42, color: onBrand, marginTop: 4 }}>
            {time}
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
        paddingLeft: 70, paddingRight: 70, paddingTop: 52,
        alignItems: 'flex-start', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', width: 760 }}>
          {p.address && (
            <>
              <Icon path={ICONS.pin} color={p.palette.ink} size={34} />
              <span style={{ fontFamily: 'Spectral', fontSize: 30, color: p.palette.ink, marginLeft: 14 }}>{p.address}</span>
            </>
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

export const editorialOpenHouse: StudioTemplate = {
  key: 'editorial-open-house',
  label: 'Editorial',
  hint: 'Pocas fotos, manda el texto',
  recipes: ['open_house'],
  aspects: ['4:5'],
  idealPhotos: 1,
  slots: {
    required: ['text.headline', 'text.when'],
    optional: ['photo.hero', 'photo.agent', 'text.address', 'text.phone', 'logo.tenant'],
  },
  render: Render,
}
