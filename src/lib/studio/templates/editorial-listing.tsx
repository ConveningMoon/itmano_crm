import { Band, Badge, Headline, StatRow, AgentBadge, textColors } from './primitives'
import type { StudioTemplate, TemplateProps } from './types'

// Editorial — manda la tipografía sobre un bloque de color, y la foto es
// secundaria. No es la variante de relleno: resuelve el caso del agente que
// todavía no tiene sesión fotográfica, que es cuando más falta le hace el
// diseño. Por eso NO requiere photo.hero.
//
// REDISEÑO. La versión anterior repartía los bloques a ojo y se notaba:
//   · el bloque de color era de alto fijo (520) con el texto pegado arriba, así
//     que con un titular corto quedaba un vacío enorme antes de la foto;
//   · la foto iba flotando con márgenes y sombra, lo que abría un segundo hueco;
//   · el logo caía en el mismo rincón inferior que la banda de marca y la
//     portada del agente, apretado entre los tres.
// Ahora las cuatro franjas se tocan (0 → 430 → 990 → 1230 → 1350), la foto va a
// sangre y el logo tiene su propia mitad de la franja de datos.

const HEADER_H = 430   // bloque de color: badge + titular + cifra
const PHOTO_Y  = 430
const PHOTO_H  = 560   // a sangre, sin márgenes ni sombra
const INFO_Y   = 990   // dirección y specs, sobre el fondo claro
const BAND_H   = 120   // pie de marca

// Logo y portada del agente son las dos marcas de identidad de la pieza y
// estaban pidiendo presencia: ambos un 15% por encima de lo que medían.
const LOGO_SIZE  = 120
const AGENT_SIZE = 230

function Render(p: TemplateProps) {
  // Etiqueta, titular, cifra, agente y teléfono van sobre el color primario.
  const { onBrand } = textColors(p.palette)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 1080, height: 1350, backgroundColor: p.palette.surface, position: 'relative' }}>
      {/* Bloque de color con todo el peso tipográfico. Lo que va encima del
          color primario se pinta con el SECUNDARIO: es el par que el tenant
          eligió para leerse junto. */}
      <div style={{
        display: 'flex', flexDirection: 'column', width: 1080, height: HEADER_H,
        backgroundColor: p.palette.brand, paddingLeft: 70, paddingRight: 70, paddingTop: 62,
      }}>
        <Badge text={p.badge} color={onBrand} />
        <div style={{ display: 'flex', marginTop: 16 }}>
          <Headline text={p.headline} color={onBrand} size={62} />
        </div>
        {p.price && (
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 78, color: onBrand, marginTop: 20 }}>
            {p.price}
          </span>
        )}
      </div>

      {p.heroPhoto && (
        // eslint-disable-next-line @next/next/no-img-element -- reason: satori rasteriza a SVG
        <img src={p.heroPhoto} width={1080} height={PHOTO_H} alt=""
             style={{ position: 'absolute', top: PHOTO_Y, left: 0, objectFit: 'cover' }} />
      )}

      {/* Franja de datos: dirección y specs a la izquierda, logo a la derecha.
          El logo deja de compartir rincón con la banda y la portada del agente,
          que era lo que lo dejaba sin aire. */}
      <div style={{
        display: 'flex', position: 'absolute', top: INFO_Y, left: 0,
        width: 1080, height: 1350 - INFO_Y - BAND_H,
        paddingLeft: 70, paddingRight: 70, paddingTop: 46,
        alignItems: 'flex-start', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: 760 }}>
          {p.address && (
            <span style={{ fontFamily: 'Spectral', fontSize: 30, color: p.palette.ink }}>{p.address}</span>
          )}
          <div style={{ display: 'flex', marginTop: 20 }}>
            <StatRow stats={p.stats} color={p.palette.ink} />
          </div>
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

      {/* La portada del agente cabalga la costura entre el bloque de color y la
          foto: es el único punto de la pieza donde sobra espacio a la derecha, y
          la saca del rincón de abajo donde competía con el logo. */}
      {p.agentPhoto && (
        <AgentBadge src={p.agentPhoto} size={AGENT_SIZE} ring={p.palette.surface} right={70} bottom={1350 - (PHOTO_Y + AGENT_SIZE / 2)} />
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
    optional: ['photo.hero', 'photo.agent', 'stats', 'text.address', 'text.phone', 'logo.tenant'],
  },
  render: Render,
}
